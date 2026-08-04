import { describe, it, expect } from "vitest";
import {
  matchPlannedItems,
  isMissed,
  significantDeviation,
  matchWindow,
  type PlannedForMatch,
} from "./matching";

const rent: PlannedForMatch = {
  id: "rent-sep",
  direction: "DEBIT",
  amount: 1389.17,
  matcher: "ALQUILER",
  categoryId: "housing",
  year: 2026,
  month: 9,
  dueDay: null,
  windowFromDay: 1,
  windowToDay: 6,
  anchorMonthEnd: false,
};

describe("matchPlannedItems", () => {
  it("links a descriptor match inside the window", () => {
    const results = matchPlannedItems(
      [rent],
      [
        {
          id: "t1",
          date: "2026-09-03",
          direction: "DEBIT",
          amount: 1389.17,
          descriptor: "TRANSFERENCIA ALQUILER PISO BARCELONA",
          categoryId: "housing",
        },
      ]
    );
    expect(results).toHaveLength(1);
    expect(results[0].transactionId).toBe("t1");
    expect(results[0].deviation).toBe(0);
  });

  it("reports the deviation for a price change (O2: 58 → 88.28)", () => {
    const o2: PlannedForMatch = {
      ...rent,
      id: "o2",
      amount: 58,
      matcher: "O2 FIBRA",
      windowFromDay: 4,
      windowToDay: 6,
    };
    const results = matchPlannedItems(
      [o2],
      [
        {
          id: "t2",
          date: "2026-09-05",
          direction: "DEBIT",
          amount: 88.28,
          descriptor: "ADEUDO O2 FIBRA Y MOVIL",
          categoryId: null,
        },
      ]
    );
    expect(results[0].deviation).toBeCloseTo(0.522, 3);
    expect(significantDeviation(results[0].deviation)).toBeCloseTo(0.522, 3);
    expect(significantDeviation(0.09)).toBeNull();
  });

  it("falls back to category+amount for matcher-less one-offs (the IBI)", () => {
    const ibi: PlannedForMatch = {
      id: "ibi",
      direction: "DEBIT",
      amount: 600,
      matcher: "",
      categoryId: "taxes",
      year: 2026,
      month: 8,
      dueDay: null,
      windowFromDay: null,
      windowToDay: null,
      anchorMonthEnd: false,
    };
    const results = matchPlannedItems(
      [ibi],
      [
        {
          id: "t3",
          date: "2026-08-20",
          direction: "DEBIT",
          amount: 612.4,
          descriptor: "AJUNTAMENT DE PALAFRUGELL",
          categoryId: "taxes",
        },
      ]
    );
    expect(results).toHaveLength(1);
  });

  it("never links the same transaction twice or the wrong direction", () => {
    const salary: PlannedForMatch = {
      ...rent,
      id: "salary",
      direction: "CREDIT",
      matcher: "MOVIL ACCESS",
      windowFromDay: 26,
      windowToDay: 30,
    };
    const results = matchPlannedItems(
      [rent, salary],
      [
        {
          id: "t4",
          date: "2026-09-02",
          direction: "DEBIT",
          amount: 1389.17,
          descriptor: "ALQUILER",
          categoryId: "housing",
        },
      ]
    );
    expect(results).toHaveLength(1);
    expect(results[0].itemId).toBe("rent-sep");
  });

  it("accepts an arrival a couple of days early (lead days)", () => {
    const results = matchPlannedItems(
      [rent],
      [
        {
          id: "t5",
          date: "2026-08-30",
          direction: "DEBIT",
          amount: 1389.17,
          descriptor: "ALQUILER PISO",
          categoryId: "housing",
        },
      ]
    );
    expect(results).toHaveLength(1);
  });
});

describe("matchWindow / isMissed", () => {
  it("month-end item accepts arrivals a few days into the next month", () => {
    const mortgage: PlannedForMatch = {
      ...rent,
      id: "mortgage",
      matcher: "PRESTAMO HIPOTECARIO",
      windowFromDay: null,
      windowToDay: null,
      anchorMonthEnd: true,
    };
    const w = matchWindow(mortgage);
    expect(w.windowEnd).toBe("2026-09-30");
    expect(w.end).toBe("2026-10-07");
  });

  it("MISSED only after the window plus grace", () => {
    expect(isMissed(rent, "2026-09-10")).toBe(false); // window ends the 6th, grace 5
    expect(isMissed(rent, "2026-09-12")).toBe(true);
  });
});
