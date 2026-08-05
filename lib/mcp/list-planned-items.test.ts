// Guards the schema→handler→query wiring for list_planned_items' filters (a
// declared parameter that never reaches the where clause is the recurring
// MCP-vs-handler mismatch — offset, dateFrom, categoryId, and status, which
// silently returned every status when asked for PENDING), and the recognition
// diagnostics that make an empty match distinguishable: broken matcher
// (seriesHistoricMatches 0) vs charge-not-arrived (historic > 0, window OPEN)
// vs real miss (window CLOSED).

import { describe, it, expect, vi, beforeEach } from "vitest";

const { plannedFindMany, seriesFindMany, txFindMany } = vi.hoisted(() => ({
  plannedFindMany: vi.fn(async (_args: { where: Record<string, unknown> }) => [] as unknown[]),
  seriesFindMany: vi.fn(async () => [] as unknown[]),
  txFindMany: vi.fn(async () => [] as unknown[]),
}));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    plannedItem: { findMany: plannedFindMany },
    recurringSeries: { findMany: seriesFindMany },
    transaction: { findMany: txFindMany },
  },
}));

import { listPlannedItemsForUser } from "./manage";

function lastWhere(): Record<string, unknown> {
  const call = plannedFindMany.mock.calls.at(-1);
  return (call?.[0]?.where ?? {}) as Record<string, unknown>;
}

const plannedRow = (over: Record<string, unknown> = {}) => ({
  id: "p1",
  description: "Escola Gràcia",
  direction: "DEBIT",
  categoryId: "edu",
  category: { name: "Educación" },
  amount: { toString: () => "259.00" },
  year: 2026,
  month: 8,
  dueDay: null,
  windowFromDay: 2,
  windowToDay: 5,
  anchorMonthEnd: false,
  recurringSeriesId: "s1",
  status: "PENDING",
  matchedTransactionId: null,
  matchedTransactionIds: [],
  matchedAmount: null,
  ...over,
});

const txRow = (date: string, description: string, amount = 20) => ({
  valueDate: new Date(`${date}T00:00:00Z`),
  direction: "DEBIT",
  amount: { toString: () => String(amount) },
  description,
  remittanceInfo: null,
  bankAccount: { name: "Despeses" },
});

describe("listPlannedItemsForUser filters reach the query", () => {
  beforeEach(() => {
    plannedFindMany.mockClear();
    seriesFindMany.mockClear();
    txFindMany.mockClear();
    plannedFindMany.mockResolvedValue([]);
  });

  it("passes status/year/month into the where clause", async () => {
    await listPlannedItemsForUser("u1", { year: 2026, month: 8, status: "PENDING" });
    expect(lastWhere()).toMatchObject({ userId: "u1", year: 2026, month: 8, status: "PENDING" });
  });

  it("omits a filter that was not provided (no status key)", async () => {
    await listPlannedItemsForUser("u1", { month: 8 });
    const where = lastWhere();
    expect(where.status).toBeUndefined();
    expect(where).toMatchObject({ userId: "u1", month: 8 });
  });
});

describe("recognition diagnostics", () => {
  beforeEach(() => {
    plannedFindMany.mockClear();
    seriesFindMany.mockClear();
    txFindMany.mockClear();
  });

  it("healthy series, charge not arrived: historic > 0, window candidates 0", async () => {
    plannedFindMany.mockResolvedValue([plannedRow()]);
    seriesFindMany.mockResolvedValue([
      { id: "s1", direction: "DEBIT", merchantKey: "ESCOLA GRACIA", rule: null },
    ]);
    // 3 historic charges, none inside the Aug 2-5 (+lead/lag) window.
    txFindMany.mockResolvedValue([
      txRow("2026-05-04", "SEPA N 111 ESCOLA GRACIA"),
      txRow("2026-06-04", "SEPA N 222 ESCOLA GRACIA"),
      txRow("2026-07-03", "SEPA N 333 ESCOLA GRACIA"),
    ]);
    const [item] = await listPlannedItemsForUser("u1", { month: 8 });
    expect(item.seriesHistoricMatches).toBe(3);
    expect(item.candidatesInWindow).toBe(0);
    expect(["FUTURE", "OPEN", "CLOSED"]).toContain(item.windowStatus);
  });

  it("broken matcher: historic 0 — instantly distinguishable", async () => {
    plannedFindMany.mockResolvedValue([plannedRow()]);
    seriesFindMany.mockResolvedValue([
      { id: "s1", direction: "DEBIT", merchantKey: "UBER ONE", rule: null },
    ]);
    txFindMany.mockResolvedValue([txRow("2026-07-22", "PAGO CON TARJETA UBER *UNRELATED")]);
    const [item] = await listPlannedItemsForUser("u1", { month: 8 });
    expect(item.seriesHistoricMatches).toBe(0);
    expect(item.candidatesInWindow).toBe(0);
  });

  it("a one-off (no series) gets windowStatus but null counters", async () => {
    plannedFindMany.mockResolvedValue([plannedRow({ recurringSeriesId: null })]);
    const [item] = await listPlannedItemsForUser("u1", { month: 8 });
    expect(item.seriesHistoricMatches).toBeNull();
    expect(item.candidatesInWindow).toBeNull();
    expect(item.windowStatus).toBeDefined();
    expect(seriesFindMany).not.toHaveBeenCalled();
  });
});
