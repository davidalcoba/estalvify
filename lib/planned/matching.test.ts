import { describe, it, expect } from "vitest";
import {
  matchPlannedItems,
  isMissed,
  isProvisionalMonth,
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

  it("plan test #9: MISSED fires when the TOLERANCE window closes, not the due date", () => {
    expect(isMissed(rent, "2026-09-07")).toBe(false); // due window ended the 6th
    expect(isMissed(rent, "2026-09-13")).toBe(false); // tolerance = +7 days
    expect(isMissed(rent, "2026-09-14")).toBe(true);
  });
});

const mortgage = (id: string, year: number, month: number): PlannedForMatch => ({
  id,
  direction: "DEBIT",
  amount: 562.48,
  matcher: "PRESTAMO",
  categoryId: "mortgage",
  year,
  month,
  dueDay: null,
  windowFromDay: null,
  windowToDay: null,
  anchorMonthEnd: true,
});

describe("accrual across the month border", () => {
  it("plan test #2: mortgage expected 31 Jul, charged 2 Aug → pairs with JULY's item", () => {
    const results = matchPlannedItems(
      [mortgage("jul", 2026, 7)],
      [
        {
          id: "t-aug2",
          date: "2026-08-02",
          direction: "DEBIT",
          amount: 562.48,
          descriptor: "AMORTIZACION PRESTAMO 0182",
          categoryId: "mortgage",
        },
      ]
    );
    expect(results).toHaveLength(1);
    expect(results[0].itemId).toBe("jul");
  });

  it("plan test #3: two mortgage charges in one calendar month split FIFO", () => {
    const results = matchPlannedItems(
      [mortgage("aug", 2026, 8), mortgage("jul", 2026, 7)],
      [
        {
          id: "t-late",
          date: "2026-08-02",
          direction: "DEBIT",
          amount: 562.48,
          descriptor: "AMORTIZACION PRESTAMO 0182",
          categoryId: "mortgage",
        },
        {
          id: "t-current",
          date: "2026-08-31",
          direction: "DEBIT",
          amount: 562.48,
          descriptor: "AMORTIZACION PRESTAMO 0182",
          categoryId: "mortgage",
        },
      ]
    );
    const byItem = Object.fromEntries(results.map((r) => [r.itemId, r.transactionId]));
    expect(byItem["jul"]).toBe("t-late");
    expect(byItem["aug"]).toBe("t-current");
  });

  it("plan test #4: a salary expected the 28th arriving the 1st pairs with its budget month", () => {
    const salary: PlannedForMatch = {
      id: "jul-salary",
      direction: "CREDIT",
      amount: 6009,
      matcher: "MOVIL ACCESS",
      categoryId: "salary",
      year: 2026,
      month: 7,
      dueDay: null,
      windowFromDay: 27,
      windowToDay: 29,
      anchorMonthEnd: false,
    };
    const results = matchPlannedItems(
      [salary],
      [
        {
          id: "t-aug1",
          date: "2026-08-01",
          direction: "CREDIT",
          amount: 6009,
          descriptor: "NOMINA MOVIL ACCESS SL",
          categoryId: "salary",
        },
      ]
    );
    expect(results[0]?.itemId).toBe("jul-salary");
  });
});

describe("isProvisionalMonth", () => {
  it("plan test #13: provisional while last month's charges can still slide in", () => {
    expect(isProvisionalMonth("2026-08-02")).toBe(true);
    expect(isProvisionalMonth("2026-08-07")).toBe(true);
    expect(isProvisionalMonth("2026-08-08")).toBe(false);
  });
});
