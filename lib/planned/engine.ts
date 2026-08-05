// The planned-items engine: generate instances forward from the recurring
// series, match arriving transactions to pending items, flip closed windows to
// MISSED, and emit the alerts those transitions deserve. Pure logic lives in
// ./schedule and ./matching; this module is the one place that talks to Prisma.
//
// Called from the daily cron and lazily from the pages that read planned state,
// so the model stays true even if the cron skips a beat.

import "server-only";

import { prisma } from "@/lib/prisma";
import type { Prisma } from "@/app/generated/prisma";
import { isDueInMonth, monthsForward, resolveWindow, isoDate } from "./schedule";
import type { YearMonth } from "./schedule";
import {
  matchPlannedItems,
  isMissed,
  significantDeviation,
  normalizeDescriptor,
  type PlannedForMatch,
  type TransactionForMatch,
} from "./matching";
import { matchesNode, type MatchableTransaction } from "@/lib/rules/rule-matcher";
import { parseConditions } from "@/lib/rules/rule-dto";
import { formatCurrency } from "@/lib/formatters";

const GENERATION_HORIZON_MONTHS = 4;

function todayInTimezone(timezone: string, now: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

function currentYearMonth(today: string): YearMonth {
  return { year: Number(today.slice(0, 4)), month: Number(today.slice(5, 7)) };
}

/** Create missing planned instances for every active series, a few months out. */
export async function ensurePlannedItems(userId: string, timezone: string): Promise<void> {
  const today = todayInTimezone(timezone);
  const months = monthsForward(currentYearMonth(today), GENERATION_HORIZON_MONTHS);

  const [series, existing] = await Promise.all([
    prisma.recurringSeries.findMany({
      where: { userId, active: true },
      select: {
        id: true,
        displayName: true,
        direction: true,
        categoryId: true,
        bankAccountId: true,
        cadence: true,
        expectedAmount: true,
        currency: true,
        windowFromDay: true,
        windowToDay: true,
        anchorMonthEnd: true,
        nextExpectedDate: true,
        lastSeenAt: true,
      },
    }),
    prisma.plannedItem.findMany({
      where: {
        userId,
        recurringSeriesId: { not: null },
        OR: months.map((m) => ({ year: m.year, month: m.month })),
      },
      select: { recurringSeriesId: true, year: true, month: true },
    }),
  ]);

  const have = new Set(existing.map((e) => `${e.recurringSeriesId}:${e.year}-${e.month}`));
  const creates: Prisma.PlannedItemCreateManyInput[] = [];

  for (const s of series) {
    const anchorDate =
      s.nextExpectedDate?.toISOString().slice(0, 10) ??
      s.lastSeenAt?.toISOString().slice(0, 10) ??
      null;
    for (const m of months) {
      if (!isDueInMonth({ cadence: s.cadence, anchorDate, windowFromDay: s.windowFromDay, windowToDay: s.windowToDay, anchorMonthEnd: s.anchorMonthEnd }, m)) {
        continue;
      }
      if (have.has(`${s.id}:${m.year}-${m.month}`)) continue;
      creates.push({
        userId,
        description: s.displayName,
        direction: s.direction,
        categoryId: s.categoryId,
        bankAccountId: s.bankAccountId,
        amount: s.expectedAmount,
        currency: s.currency,
        year: m.year,
        month: m.month,
        windowFromDay: s.windowFromDay,
        windowToDay: s.windowToDay,
        anchorMonthEnd: s.anchorMonthEnd,
        recurringSeriesId: s.id,
      });
    }
  }

  if (creates.length > 0) {
    await prisma.plannedItem.createMany({ data: creates, skipDuplicates: true });
  }
}

/**
 * Match arriving transactions to PENDING items, alert on price deviations,
 * flip closed windows to MISSED (with an alert), and keep the series'
 * lastSeenAt fresh. Idempotent — safe from cron, sync and page loads alike.
 */
export async function runPlannedMatching(
  userId: string,
  timezone: string,
  currency: string,
  locale: string
): Promise<void> {
  const today = todayInTimezone(timezone);
  const current = currentYearMonth(today);
  const monthsSpan = [
    { year: current.month === 1 ? current.year - 1 : current.year, month: current.month === 1 ? 12 : current.month - 1 },
    current,
    { year: current.month === 12 ? current.year + 1 : current.year, month: current.month === 12 ? 1 : current.month + 1 },
  ];

  const pending = await prisma.plannedItem.findMany({
    where: { userId, status: "PENDING", OR: monthsSpan.map((m) => ({ year: m.year, month: m.month })) },
    select: {
      id: true,
      description: true,
      direction: true,
      categoryId: true,
      amount: true,
      year: true,
      month: true,
      dueDay: true,
      windowFromDay: true,
      windowToDay: true,
      anchorMonthEnd: true,
      recurringSeriesId: true,
      recurringSeries: {
        select: {
          merchantKey: true,
          displayName: true,
          rule: { select: { conditions: true, isActive: true } },
        },
      },
    },
  });
  if (pending.length === 0) return;

  // Candidate transactions across the span, minus ones already claimed.
  const spanStart = new Date(Date.UTC(monthsSpan[0].year, monthsSpan[0].month - 1, 1));
  const [transactions, claimed] = await Promise.all([
    prisma.transaction.findMany({
      where: { userId, valueDate: { gte: spanStart } },
      select: {
        id: true,
        valueDate: true,
        direction: true,
        amount: true,
        description: true,
        remittanceInfo: true,
        bankAccount: { select: { name: true } },
        categorization: { select: { categoryId: true } },
      },
    }),
    prisma.plannedItem.findMany({
      where: { userId, matchedTransactionId: { not: null } },
      select: { matchedTransactionId: true },
    }),
  ]);
  const claimedIds = new Set(claimed.map((c) => c.matchedTransactionId));

  // Rule-linked recognition: the predicate evaluates the rule's condition
  // tree over the raw transaction fields (looked up by id — the pure matcher
  // only carries the combined descriptor).
  const matchableById = new Map<string, MatchableTransaction>(
    transactions.map((t) => [
      t.id,
      {
        description: t.description,
        remittanceInfo: t.remittanceInfo,
        amount: Math.abs(Number(t.amount.toString())),
        direction: t.direction,
        accountName: t.bankAccount?.name ?? null,
      },
    ])
  );
  const predicateFor = (
    rule: { conditions: unknown; isActive: boolean } | null | undefined
  ): ((tx: TransactionForMatch) => boolean) | undefined => {
    if (!rule) return undefined;
    try {
      const group = parseConditions(rule.conditions);
      return (tx) => {
        const raw = matchableById.get(tx.id);
        return raw ? matchesNode(raw, group) : false;
      };
    } catch {
      return undefined; // unparseable rule → fall back to the matcher text
    }
  };

  const items: PlannedForMatch[] = pending.map((p) => ({
    id: p.id,
    direction: p.direction,
    amount: Number(p.amount.toString()),
    matcher: p.recurringSeries?.merchantKey ?? p.description,
    matches: predicateFor(p.recurringSeries?.rule),
    categoryId: p.categoryId,
    year: p.year,
    month: p.month,
    dueDay: p.dueDay,
    windowFromDay: p.windowFromDay,
    windowToDay: p.windowToDay,
    anchorMonthEnd: p.anchorMonthEnd,
  }));
  const candidates = transactions
    .filter((t) => !claimedIds.has(t.id))
    .map((t) => ({
      id: t.id,
      date: t.valueDate.toISOString().slice(0, 10),
      direction: t.direction,
      amount: Math.abs(Number(t.amount.toString())),
      descriptor: `${t.description ?? ""} ${t.remittanceInfo ?? ""}`,
      categoryId: t.categorization?.categoryId ?? null,
    }));

  const matches = matchPlannedItems(items, candidates);
  const pendingById = new Map(pending.map((p) => [p.id, p]));
  const txDateById = new Map(candidates.map((c) => [c.id, c.date]));

  const writes: Prisma.PrismaPromise<unknown>[] = [];
  for (const match of matches) {
    const item = pendingById.get(match.itemId)!;
    writes.push(
      prisma.plannedItem.update({
        where: { id: match.itemId },
        data: {
          status: "MATCHED",
          matchedTransactionId: match.transactionId,
          matchedAmount: match.matchedAmount,
        },
      })
    );
    if (item.recurringSeriesId) {
      writes.push(
        prisma.recurringSeries.update({
          where: { id: item.recurringSeriesId },
          data: { lastSeenAt: new Date(`${txDateById.get(match.transactionId)}T00:00:00Z`) },
        })
      );
    }
    const deviation = significantDeviation(match.deviation);
    if (deviation !== null) {
      const name = item.recurringSeries?.displayName ?? item.description;
      const pct = Math.round(Math.abs(deviation) * 100);
      const rose = deviation > 0;
      writes.push(
        prisma.notification.upsert({
          where: { userId_dedupeKey: { userId, dedupeKey: `planned-amount:${item.id}` } },
          create: {
            userId,
            type: "RECURRING_AMOUNT_CHANGE",
            severity: rose ? "WARNING" : "INFO",
            title: `${name} ${rose ? "went up" : "went down"} ${pct}%`,
            body: `The charge arrived at ${formatCurrency(match.matchedAmount, currency, locale)} against an expected ${formatCurrency(Number(item.amount.toString()), currency, locale)}. If the new price is permanent, update the series so next month expects it.`,
            dedupeKey: `planned-amount:${item.id}`,
            metadata: { plannedItemId: item.id },
          },
          update: {},
        })
      );
    }
  }

  // MISSED: windows closed beyond grace with nothing matched.
  const matchedIds = new Set(matches.map((m) => m.itemId));
  for (const item of items) {
    if (matchedIds.has(item.id)) continue;
    if (!isMissed(item, today)) continue;
    const row = pendingById.get(item.id)!;
    const name = row.recurringSeries?.displayName ?? row.description;
    writes.push(
      prisma.plannedItem.update({ where: { id: item.id }, data: { status: "MISSED" } })
    );
    writes.push(
      prisma.notification.upsert({
        where: { userId_dedupeKey: { userId, dedupeKey: `planned-missed:${item.id}` } },
        create: {
          userId,
          type: "RECURRING_MISSED",
          severity: "WARNING",
          title: `Missing: ${name}`,
          body: `${row.direction === "CREDIT" ? "An expected income of" : "An expected charge of"} ${formatCurrency(Number(row.amount.toString()), currency, locale)} didn't arrive in its ${row.month}/${row.year} window. Check the bill — or the bank sync.`,
          dedupeKey: `planned-missed:${item.id}`,
          metadata: { plannedItemId: item.id },
        },
        update: {},
      })
    );
  }

  if (writes.length > 0) await prisma.$transaction(writes);
}

/** How far back lastSeenAt scans the feed — long enough for any cadence. */
const LAST_SEEN_LOOKBACK_MONTHS = 18;

/**
 * Recompute each active series' schedule fields FROM REALITY, idempotently:
 *
 *  - `nextExpectedDate` = the window-start of the series' earliest still-PENDING
 *    occurrence. For MONTHLY that derives from windowFromDay/anchorMonthEnd of
 *    the planned item — no anchorDate needed — and it advances as items match
 *    or miss.
 *  - `lastSeenAt` = the value date of the most recent TRANSACTION the series
 *    actually recognizes (its rule's condition tree, or its matcher text over
 *    the descriptor). Deriving it from the feed — not from matched planned
 *    items — is what makes it true: a charge whose month predates the planned
 *    horizon (e.g. the mortgage) still counts as "last seen", and a series that
 *    can't recognize anything correctly reads back as null.
 *
 * Both are written only when they change.
 */
export async function refreshSeriesSchedule(userId: string): Promise<void> {
  const lookback = new Date();
  lookback.setUTCMonth(lookback.getUTCMonth() - LAST_SEEN_LOOKBACK_MONTHS);
  const [series, pendingItems, transactions] = await Promise.all([
    prisma.recurringSeries.findMany({
      where: { userId, active: true },
      select: {
        id: true,
        direction: true,
        merchantKey: true,
        nextExpectedDate: true,
        lastSeenAt: true,
        rule: { select: { conditions: true, isActive: true } },
      },
    }),
    prisma.plannedItem.findMany({
      where: { userId, status: "PENDING", recurringSeriesId: { not: null } },
      select: {
        recurringSeriesId: true,
        year: true,
        month: true,
        dueDay: true,
        windowFromDay: true,
        windowToDay: true,
        anchorMonthEnd: true,
      },
    }),
    prisma.transaction.findMany({
      where: { userId, valueDate: { gte: lookback } },
      select: {
        valueDate: true,
        direction: true,
        amount: true,
        description: true,
        remittanceInfo: true,
        bankAccount: { select: { name: true } },
      },
    }),
  ]);

  // nextExpectedDate — earliest PENDING window start per series.
  const earliest = new Map<string, string>();
  for (const p of pendingItems) {
    const ym: YearMonth = { year: p.year, month: p.month };
    const window =
      p.dueDay != null && !p.anchorMonthEnd
        ? { fromDay: p.dueDay, toDay: p.dueDay }
        : resolveWindow(p, ym);
    const date = isoDate(ym, window.fromDay);
    const key = p.recurringSeriesId!;
    const prev = earliest.get(key);
    if (!prev || date < prev) earliest.set(key, date);
  }

  // lastSeenAt — newest recognized transaction per series, from the feed.
  const feed = transactions.map((t) => ({
    date: t.valueDate.toISOString().slice(0, 10),
    descriptor: normalizeDescriptor(`${t.description ?? ""} ${t.remittanceInfo ?? ""}`),
    raw: {
      description: t.description,
      remittanceInfo: t.remittanceInfo,
      amount: Math.abs(Number(t.amount.toString())),
      direction: t.direction,
      accountName: t.bankAccount?.name ?? null,
    } as MatchableTransaction,
  }));
  const lastSeen = new Map<string, string>();
  for (const s of series) {
    let recognizes: (tx: (typeof feed)[number]) => boolean;
    let parsed: ReturnType<typeof parseConditions> | null = null;
    if (s.rule) {
      try {
        parsed = parseConditions(s.rule.conditions);
      } catch {
        parsed = null;
      }
    }
    if (parsed) {
      const group = parsed;
      recognizes = (tx) => matchesNode(tx.raw, group);
    } else {
      const needle = normalizeDescriptor(s.merchantKey);
      recognizes = (tx) =>
        tx.raw.direction === s.direction &&
        needle.length >= 3 &&
        tx.descriptor.includes(needle);
    }
    let best: string | null = null;
    for (const tx of feed) {
      if (recognizes(tx) && (!best || tx.date > best)) best = tx.date;
    }
    if (best) lastSeen.set(s.id, best);
  }

  const writes: Prisma.PrismaPromise<unknown>[] = [];
  for (const s of series) {
    const data: { nextExpectedDate?: Date; lastSeenAt?: Date | null } = {};
    const next = earliest.get(s.id);
    const storedNext = s.nextExpectedDate?.toISOString().slice(0, 10) ?? null;
    if (next && next !== storedNext) data.nextExpectedDate = new Date(`${next}T00:00:00Z`);

    const seen = lastSeen.get(s.id) ?? null;
    const storedSeen = s.lastSeenAt?.toISOString().slice(0, 10) ?? null;
    if (seen !== storedSeen) data.lastSeenAt = seen ? new Date(`${seen}T00:00:00Z`) : null;

    if (Object.keys(data).length > 0) {
      writes.push(prisma.recurringSeries.update({ where: { id: s.id }, data }));
    }
  }
  if (writes.length > 0) await prisma.$transaction(writes);
}

/** Generation + matching in one call — what cron and pages actually use. */
export async function syncPlannedState(
  userId: string,
  timezone: string,
  currency: string,
  locale: string
): Promise<void> {
  await ensurePlannedItems(userId, timezone);
  await runPlannedMatching(userId, timezone, currency, locale);
  await refreshSeriesSchedule(userId);
}
