// Pure recurring-payment detection: group a user's transactions by a normalized
// merchant key and surface those that repeat on a regular cadence (weekly /
// monthly / quarterly / yearly) with a stable-ish amount. No Prisma/network —
// unit-tested in isolation; the page passes plain rows in.

export type Direction = "DEBIT" | "CREDIT";
export type Cadence = "WEEKLY" | "MONTHLY" | "QUARTERLY" | "YEARLY";

export interface DetectionInput {
  amount: number;
  direction: Direction;
  /** ISO date string (or anything Date can parse). */
  valueDate: string;
  description: string | null;
  remittanceInfo: string | null;
  categoryId?: string | null;
  categoryName?: string | null;
  categoryColor?: string | null;
  /** Account the charge hit — lets per-account cash-flow place the series. */
  bankAccountId?: string | null;
}

export interface RecurringCandidate {
  merchantKey: string;
  displayName: string;
  direction: Direction;
  cadence: Cadence;
  occurrences: number;
  averageAmount: number;
  lastAmount: number;
  firstSeen: string; // YYYY-MM-DD
  lastSeen: string; // YYYY-MM-DD
  nextExpected: string; // YYYY-MM-DD
  categoryId: string | null;
  categoryName: string | null;
  categoryColor: string | null;
  /**
   * Chronological occurrences (absolute amounts). Feeds the amount-deviation
   * alert (baseline = the charges before the latest one) and the day-of-month
   * window the cash-flow projection schedules charges in.
   */
  history: SeriesOccurrence[];
  /** Account most of the series' charges hit, or null when inputs carry none. */
  bankAccountId: string | null;
}

export interface SeriesOccurrence {
  date: string; // YYYY-MM-DD
  amount: number; // absolute value
}

// Minimum repeats before something counts as a series.
export const MIN_OCCURRENCES = 3;

// Bank descriptor prefixes to strip before deriving a merchant name.
const DESCRIPTION_PREFIXES = [
  "PAGO DE ADEUDO DIRECTO SEPA ",
  "PAGO DE ADEUDO SEPA ",
  "ADEUDO DIRECTO SEPA ",
  "RECIBO ",
  "PAGO CON TARJETA ",
  "PAGO CON VISA ",
  "COMPRA ",
  "TRANSFERENCIA ",
];

function stripPrefix(value: string): string {
  const upper = value.toUpperCase();
  for (const prefix of DESCRIPTION_PREFIXES) {
    if (upper.startsWith(prefix)) return value.slice(prefix.length).trim();
  }
  return value.trim();
}

/** Human-friendly label for the series (original case, prefix stripped). */
export function merchantDisplayName(
  description: string | null,
  remittanceInfo: string | null
): string {
  const raw = (description ?? remittanceInfo ?? "").trim();
  const cleaned = stripPrefix(raw).replace(/\s+/g, " ").trim();
  return cleaned.length > 48 ? `${cleaned.slice(0, 48).trim()}…` : cleaned;
}

/**
 * Stable grouping key: strip prefixes, drop digits/dates/punctuation, keep the
 * first few alphabetic tokens. "NETFLIX 1234 05/01" and "NETFLIX.COM 987" both
 * collapse to "NETFLIX".
 */
export function normalizeMerchantKey(
  description: string | null,
  remittanceInfo: string | null
): string {
  const base = stripPrefix((description ?? remittanceInfo ?? "").trim()).toUpperCase();
  const tokens = base
    .replace(/[^A-ZÀ-Ÿ\s]/g, " ") // keep letters (incl. accents) only
    .replace(/\s+/g, " ")
    .trim()
    .split(" ")
    .filter((t) => t.length >= 2);
  return tokens.slice(0, 3).join(" ");
}

export function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

/** Whole-day difference between two ISO dates (UTC). */
export function daysBetween(a: string, b: string): number {
  const [ay, am, ad] = ymd(a);
  const [by, bm, bd] = ymd(b);
  const ms = Date.UTC(by, bm, bd) - Date.UTC(ay, am, ad);
  return Math.round(ms / 86_400_000);
}

function ymd(iso: string): [number, number, number] {
  const d = new Date(iso);
  return [d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()];
}

function toDateOnly(iso: string): string {
  const [y, m, d] = ymd(iso);
  return `${y}-${String(m + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

const CADENCE_BUCKETS: { cadence: Cadence; min: number; max: number }[] = [
  { cadence: "WEEKLY", min: 5, max: 9 },
  { cadence: "MONTHLY", min: 24, max: 37 },
  { cadence: "QUARTERLY", min: 80, max: 100 },
  { cadence: "YEARLY", min: 330, max: 400 },
];

/** Map a median gap (in days) to a cadence bucket, or null if irregular. */
export function classifyCadence(medianGapDays: number): Cadence | null {
  for (const bucket of CADENCE_BUCKETS) {
    if (medianGapDays >= bucket.min && medianGapDays <= bucket.max) return bucket.cadence;
  }
  return null;
}

/** Advance a date by one cadence period (calendar-aware for month/year). */
export function nextExpectedDate(lastSeen: string, cadence: Cadence): string {
  const [y, m, d] = ymd(lastSeen);
  switch (cadence) {
    case "WEEKLY":
      return toDateOnly(new Date(Date.UTC(y, m, d + 7)).toISOString());
    case "MONTHLY":
      return toDateOnly(new Date(Date.UTC(y, m + 1, d)).toISOString());
    case "QUARTERLY":
      return toDateOnly(new Date(Date.UTC(y, m + 3, d)).toISOString());
    case "YEARLY":
      return toDateOnly(new Date(Date.UTC(y + 1, m, d)).toISOString());
  }
}

function majorityAccount(rows: DetectionInput[]): string | null {
  const counts = new Map<string, number>();
  for (const row of rows) {
    if (!row.bankAccountId) continue;
    counts.set(row.bankAccountId, (counts.get(row.bankAccountId) ?? 0) + 1);
  }
  let bestId: string | null = null;
  let best = 0;
  for (const [id, count] of counts) {
    if (count > best) {
      bestId = id;
      best = count;
    }
  }
  return bestId;
}

function majorityCategory(
  rows: DetectionInput[]
): { id: string | null; name: string | null; color: string | null } {
  const counts = new Map<string, { count: number; name: string | null; color: string | null }>();
  for (const row of rows) {
    if (!row.categoryId) continue;
    const entry = counts.get(row.categoryId) ?? {
      count: 0,
      name: row.categoryName ?? null,
      color: row.categoryColor ?? null,
    };
    entry.count += 1;
    counts.set(row.categoryId, entry);
  }
  let bestId: string | null = null;
  let best = { count: 0, name: null as string | null, color: null as string | null };
  for (const [id, entry] of counts) {
    if (entry.count > best.count) {
      bestId = id;
      best = entry;
    }
  }
  return { id: bestId, name: best.name, color: best.color };
}

/**
 * Detect recurring series from a transaction list. Groups by (direction,
 * merchantKey), keeps groups with >= MIN_OCCURRENCES whose median gap matches a
 * cadence bucket, and summarizes each.
 */
export function detectRecurringSeries(rows: DetectionInput[]): RecurringCandidate[] {
  const groups = new Map<string, DetectionInput[]>();
  for (const row of rows) {
    const key = normalizeMerchantKey(row.description, row.remittanceInfo);
    if (key.length < 2) continue; // unusable descriptor
    const groupKey = `${row.direction}::${key}`;
    let bucket = groups.get(groupKey);
    if (!bucket) {
      bucket = [];
      groups.set(groupKey, bucket);
    }
    bucket.push(row);
  }

  const candidates: RecurringCandidate[] = [];

  for (const [groupKey, groupRows] of groups) {
    if (groupRows.length < MIN_OCCURRENCES) continue;

    const sorted = [...groupRows].sort(
      (a, b) => new Date(a.valueDate).getTime() - new Date(b.valueDate).getTime()
    );

    const gaps: number[] = [];
    for (let i = 1; i < sorted.length; i++) {
      gaps.push(daysBetween(sorted[i - 1].valueDate, sorted[i].valueDate));
    }
    const cadence = classifyCadence(median(gaps));
    if (!cadence) continue;

    // Guard against a lucky median: require most individual gaps to match the
    // same cadence, so bursty one-off spending isn't mistaken for a series.
    const consistentGaps = gaps.filter((gap) => classifyCadence(gap) === cadence).length;
    if (consistentGaps < Math.ceil(gaps.length * 0.6)) continue;

    const amounts = sorted.map((r) => Math.abs(r.amount));
    const averageAmount =
      Math.round((amounts.reduce((s, a) => s + a, 0) / amounts.length) * 100) / 100;
    const last = sorted[sorted.length - 1];
    const first = sorted[0];
    const cat = majorityCategory(sorted);
    const [direction, merchantKey] = groupKey.split("::") as [Direction, string];

    candidates.push({
      merchantKey,
      displayName: merchantDisplayName(last.description, last.remittanceInfo) || merchantKey,
      direction,
      cadence,
      occurrences: sorted.length,
      averageAmount,
      lastAmount: Math.abs(last.amount),
      firstSeen: toDateOnly(first.valueDate),
      lastSeen: toDateOnly(last.valueDate),
      nextExpected: nextExpectedDate(toDateOnly(last.valueDate), cadence),
      categoryId: cat.id,
      categoryName: cat.name,
      categoryColor: cat.color,
      history: sorted.map((r) => ({
        date: toDateOnly(r.valueDate),
        amount: Math.abs(r.amount),
      })),
      bankAccountId: majorityAccount(sorted),
    });
  }

  // Expenses first, then by size — the most useful review order.
  return candidates.sort((a, b) => {
    if (a.direction !== b.direction) return a.direction === "DEBIT" ? -1 : 1;
    return b.averageAmount - a.averageAmount;
  });
}
