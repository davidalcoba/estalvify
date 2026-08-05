import { describe, it, expect } from "vitest";
import {
  matchPlannedItems,
  isMissed,
  isProvisionalMonth,
  significantDeviation,
  matchWindow,
  normalizeDescriptor,
  type PlannedForMatch,
} from "./matching";

describe("normalizeDescriptor", () => {
  it("folds gateway asterisks so a merchant-name matcher matches the feed", () => {
    const d = normalizeDescriptor("PAGO CON TARJETA UBER *ONE MEMBERSHIP");
    expect(d).toBe("PAGO CON TARJETA UBER ONE MEMBERSHIP");
    expect(d.includes(normalizeDescriptor("UBER ONE"))).toBe(true);
  });

  it("folds a dot/apostrophe mismatch to the same normalized form", () => {
    const feed = normalizeDescriptor("Institut d.Investigacio en Ciencies");
    const matcher = normalizeDescriptor("Institut d'Investigació");
    expect(feed.includes(matcher)).toBe(true);
  });

  it("still strips accents and collapses whitespace", () => {
    expect(normalizeDescriptor("  Aigües   de  Barcelona ")).toBe("AIGUES DE BARCELONA");
  });
});

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

describe("amount guard on descriptor collisions (bug report 2026-08-05)", () => {
  it("the rent never matches a taxi whose remittance says ALQUILER DE VEHICULOS", () => {
    const results = matchPlannedItems(
      [{ ...rent, year: 2026, month: 8 }],
      [
        {
          id: "freenow",
          date: "2026-08-03",
          direction: "DEBIT",
          amount: 19.55,
          descriptor: "FREE NOW PAGO CON TARJETA EN TRANSPORTE Y ALQUILER DE VEHICULOS",
          categoryId: "transport",
        },
      ]
    );
    expect(results).toHaveLength(0);
  });

  it("twin insurances with one shared descriptor split by amount", () => {
    const policy = (id: string, amount: number): PlannedForMatch => ({
      ...rent,
      id,
      amount,
      matcher: "BBVA PLAN ESTARSEGURO",
      windowFromDay: 3,
      windowToDay: 5,
    });
    const tx = (id: string, amount: number) => ({
      id,
      date: "2026-09-04",
      direction: "DEBIT" as const,
      amount,
      descriptor: "BBVA PLAN ESTARSEGURO",
      categoryId: null,
    });
    const results = matchPlannedItems(
      [policy("hogar", 59.49), policy("vida", 10.97)],
      [tx("t-vida", 10.97), tx("t-hogar", 59.49)]
    );
    const byItem = Object.fromEntries(results.map((r) => [r.itemId, r.transactionId]));
    expect(byItem["hogar"]).toBe("t-hogar");
    expect(byItem["vida"]).toBe("t-vida");
  });

  it("a real price change within the cap still matches (O2 +52%)", () => {
    const o2: PlannedForMatch = { ...rent, id: "o2", amount: 58, matcher: "O2 FIBRA" };
    const results = matchPlannedItems(
      [o2],
      [
        {
          id: "t",
          date: "2026-09-04",
          direction: "DEBIT",
          amount: 88.28,
          descriptor: "ADEUDO O2 FIBRA",
          categoryId: null,
        },
      ]
    );
    expect(results).toHaveLength(1);
  });
});

describe("aggregate series (several charges per period)", () => {
  const afa = (): PlannedForMatch => ({
    ...rent,
    id: "afa-aug",
    amount: 60,
    matcher: "TEIXIDORES",
    aggregate: true,
    year: 2026,
    month: 8,
    windowFromDay: 1,
    windowToDay: 6,
  });
  const debit = (id: string, amount: number, date = "2026-08-03") => ({
    id,
    date,
    direction: "DEBIT" as const,
    amount,
    descriptor: "AFA TEIXIDORES DE GRACIA",
    categoryId: "education",
  });

  it("sums three same-day dues into one matched total", () => {
    const results = matchPlannedItems(
      [afa()],
      [debit("a", 20), debit("b", 20), debit("c", 20)]
    );
    expect(results).toHaveLength(1);
    expect(results[0].matchedAmount).toBe(60);
    expect(results[0].transactionIds).toHaveLength(3);
    expect(results[0].transactionId).toBe("a"); // earliest anchors
    expect(results[0].deviation).toBe(0);
  });

  it("absorbs small fractions the single-charge amount guard would reject (school ≈259)", () => {
    const escola: PlannedForMatch = {
      ...afa(),
      id: "escola",
      amount: 259,
      matcher: "ESCOLA GRACIA",
    };
    const tx = (id: string, amount: number) => ({
      id,
      date: "2026-08-03",
      direction: "DEBIT" as const,
      amount,
      descriptor: "ESCOLA GRACIA",
      categoryId: "education",
    });
    const results = matchPlannedItems(
      [escola],
      [tx("t1", 106.5), tx("t2", 104.45), tx("t3", 20), tx("t4", 20), tx("t5", 4), tx("t6", 4)]
    );
    expect(results[0].matchedAmount).toBe(258.95);
    expect(results[0].transactionIds).toHaveLength(6);
  });

  it("a non-aggregate series still takes a single charge and keeps the amount guard", () => {
    // Same three 20€ dues, but aggregate off: only one is claimed (guard would
    // even reject them vs 60, but 20/60 dev=0.67 < 0.75 so one strong match).
    const single: PlannedForMatch = { ...afa(), aggregate: false };
    const results = matchPlannedItems(
      [single],
      [debit("a", 20), debit("b", 20), debit("c", 20)]
    );
    expect(results[0].transactionIds).toHaveLength(1);
    expect(results[0].matchedAmount).toBe(20);
  });
});

describe("rule-linked recognition", () => {
  it("uses the item's predicate instead of the matcher text", () => {
    const item: PlannedForMatch = {
      ...rent,
      id: "linked",
      matcher: "",
      matches: (tx) => tx.descriptor.includes("COMERCIO EDIFICACION") && tx.amount > 1000,
    };
    const results = matchPlannedItems(
      [item],
      [
        {
          id: "t-rent",
          date: "2026-09-02",
          direction: "DEBIT",
          amount: 1389.17,
          descriptor: "COMERCIO EDIFICACION E INDUSTRIA, S.L.",
          categoryId: null,
        },
        {
          id: "t-noise",
          date: "2026-09-02",
          direction: "DEBIT",
          amount: 1389.17,
          descriptor: "OTRA COSA",
          categoryId: "housing",
        },
      ]
    );
    expect(results).toHaveLength(1);
    expect(results[0].transactionId).toBe("t-rent");
  });
});

describe("isProvisionalMonth", () => {
  it("plan test #13: provisional while last month's charges can still slide in", () => {
    expect(isProvisionalMonth("2026-08-02")).toBe(true);
    expect(isProvisionalMonth("2026-08-07")).toBe(true);
    expect(isProvisionalMonth("2026-08-08")).toBe(false);
  });
});
