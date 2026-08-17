import { describe, it, expect } from "vitest";
import { addDays, daysBetween, selectUpcoming, type UpcomingSource } from "./upcoming";

const item = (over: Partial<UpcomingSource> & { id: string; date: string }): UpcomingSource => ({
  description: "Charge",
  direction: "DEBIT",
  amount: 100,
  matchedAmount: null,
  status: "PENDING",
  endDate: over.date,
  fromSeries: true,
  ...over,
});

const TODAY = "2026-08-16";

describe("date helpers", () => {
  it("counts whole days across a month boundary", () => {
    expect(daysBetween(TODAY, "2026-08-16")).toBe(0);
    expect(daysBetween(TODAY, "2026-08-17")).toBe(1);
    expect(daysBetween(TODAY, "2026-09-01")).toBe(16);
    expect(daysBetween(TODAY, "2026-08-10")).toBe(-6);
  });

  it("adds days across months and years", () => {
    expect(addDays("2026-08-30", 3)).toBe("2026-09-02");
    expect(addDays("2026-01-01", -1)).toBe("2025-12-31");
  });
});

describe("selectUpcoming", () => {
  it("keeps the window ahead, in date order", () => {
    const { rows } = selectUpcoming(
      [
        item({ id: "c", date: "2026-08-25", description: "Netflix" }),
        item({ id: "a", date: "2026-08-16", description: "Mortgage" }),
        item({ id: "b", date: "2026-08-20", description: "Gym" }),
      ],
      TODAY
    );
    expect(rows.map((r) => r.id)).toEqual(["a", "b", "c"]);
    expect(rows[0].daysAway).toBe(0);
    expect(rows[2].daysAway).toBe(9);
  });

  it("drops what falls past the horizon", () => {
    const { rows } = selectUpcoming(
      [item({ id: "in", date: "2026-08-30" }), item({ id: "out", date: "2026-08-31" })],
      TODAY
    );
    expect(rows.map((r) => r.id)).toEqual(["in"]);
  });

  it("totals only what is still to happen, by direction", () => {
    const result = selectUpcoming(
      [
        item({ id: "rent", date: "2026-08-20", amount: 850 }),
        item({ id: "salary", date: "2026-08-27", amount: 2400, direction: "CREDIT" }),
        // Already arrived: it is no longer money about to move.
        item({ id: "paid", date: "2026-08-18", amount: 60, status: "MATCHED", matchedAmount: 62.5 }),
      ],
      TODAY
    );
    expect(result.pendingOut).toBe(850);
    expect(result.pendingIn).toBe(2400);
    expect(result.rows.find((r) => r.id === "paid")?.shownAmount).toBe(62.5);
  });

  it("sinks what has already happened below what is still to come", () => {
    const { rows } = selectUpcoming(
      [
        item({ id: "paid", date: "2026-08-14", endDate: "2026-08-18", status: "MATCHED" }),
        item({ id: "missed", date: "2026-08-12", endDate: "2026-08-13", status: "MISSED" }),
        item({ id: "today", date: TODAY }),
        item({ id: "friday", date: "2026-08-21" }),
      ],
      TODAY
    );
    // Today and Friday lead; the settled one follows. The missed row is not
    // in this list at all — it has its own.
    expect(rows.map((r) => r.id)).toEqual(["today", "friday", "paid"]);
  });

  it("keeps a recently missed window, because it is the row that asks for an action", () => {
    const result = selectUpcoming(
      [
        item({ id: "missed", date: "2026-08-12", endDate: "2026-08-13", status: "MISSED" }),
        // Too long ago: the card is not a history.
        item({ id: "stale", date: "2026-08-01", endDate: "2026-08-02", status: "MISSED" }),
      ],
      TODAY
    );
    expect(result.rows).toEqual([]);
    expect(result.missed.map((r) => r.id)).toEqual(["missed"]);
    expect(result.missed[0].daysAway).toBe(-4);
  });

  it("keeps an item whose window is still open even though it started before today", () => {
    const { rows } = selectUpcoming(
      [item({ id: "open", date: "2026-08-14", endDate: "2026-08-18" })],
      TODAY
    );
    expect(rows.map((r) => r.id)).toEqual(["open"]);
  });

  it("never lets the row limit swallow a missed charge", () => {
    const source = [
      ...Array.from({ length: 8 }, (_, i) => item({ id: `i${i}`, date: addDays(TODAY, i) })),
      item({ id: "missed", date: "2026-08-13", endDate: "2026-08-14", status: "MISSED" }),
    ];
    const result = selectUpcoming(source, TODAY, { limit: 5 });
    expect(result.rows.map((r) => r.id)).not.toContain("missed");
    expect(result.missed.map((r) => r.id)).toEqual(["missed"]);
  });

  it("limits the rows shown without distorting the totals", () => {
    const source = Array.from({ length: 8 }, (_, i) =>
      item({ id: `i${i}`, date: addDays(TODAY, i), amount: 10 })
    );
    const result = selectUpcoming(source, TODAY, { limit: 3 });
    expect(result.rows).toHaveLength(3);
    expect(result.pendingOut).toBe(80);
  });

  it("reports an empty window without inventing figures", () => {
    const result = selectUpcoming([], TODAY);
    expect(result).toMatchObject({ rows: [], missed: [], pendingOut: 0, pendingIn: 0 });
    expect(result.until).toBe("2026-08-30");
  });
});
