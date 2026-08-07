import { describe, it, expect } from "vitest";
import { computeControl, type ControlCategoryInput } from "./control";

const cat = (name: string, assigned: number, consumed: number): ControlCategoryInput => ({
  categoryId: name.toLowerCase().replace(/\s+/g, "-"),
  categoryName: name,
  categoryColor: "#000",
  assigned,
  consumed,
});

describe("computeControl", () => {
  it("acceptance #7: July's real data orders Alimentación first by projected deviation", () => {
    // Closed month: daysElapsed = daysInMonth → projection = consumed.
    const rows = computeControl(
      [
        cat("Tabaco", 250, 254),
        cat("Restaurantes", 550, 584),
        cat("Ropa y calzado", 300, 333),
        cat("Combustible", 200, 292),
        cat("Alimentación", 1300, 1636),
      ],
      31,
      31
    );
    expect(rows.map((r) => r.categoryName)).toEqual([
      "Alimentación",
      "Combustible",
      "Restaurantes",
      "Ropa y calzado",
      "Tabaco",
    ]);
    expect(rows[0].state).toBe("EXCEDIDO");
    expect(rows[0].projectedDeviation).toBe(336);
    expect(rows[1].projectedDeviation).toBe(92);
    expect(rows[2].projectedDeviation).toBe(34);
    expect(rows[3].projectedDeviation).toBe(33);
    expect(rows[4].projectedDeviation).toBe(4);
    expect(rows.every((r) => r.state === "EXCEDIDO")).toBe(true);
  });

  it("acceptance #8: 46% on day 12 projecting 1580 over 1300 is RIESGO, not OK", () => {
    // 611.61 / 12 × 31 ≈ 1580 — under budget today, over at this pace.
    const [row] = computeControl([cat("Alimentación", 1300, 611.61)], 12, 31);
    expect(row.consumed).toBeLessThan(row.assigned);
    expect(row.projectedEndOfMonth).toBeCloseTo(1580, 0);
    expect(row.state).toBe("RIESGO");
    expect(row.monthElapsedPct).toBeCloseTo(0.39, 2);
  });

  it("the same consumption reads OK on day 11 and RIESGO on day 3 (the pace reference)", () => {
    // 429 € on 1300: day 11 projects 1209 (OK); day 3 projects 4433 (RIESGO).
    const day11 = computeControl([cat("Alimentación", 1300, 429)], 11, 31)[0];
    const day3 = computeControl([cat("Alimentación", 1300, 429)], 3, 31)[0];
    expect(day11.state).toBe("OK");
    expect(day3.state).toBe("RIESGO");
  });

  it("consumed over assigned is EXCEDIDO even when the window just opened", () => {
    const [row] = computeControl([cat("Tabaco", 250, 260)], 2, 31);
    expect(row.state).toBe("EXCEDIDO");
  });

  it("zero assigned never divides by zero", () => {
    const [row] = computeControl([cat("Nueva", 0, 50)], 10, 31);
    expect(row.percentage).toBe(0);
    expect(row.state).toBe("EXCEDIDO");
  });

  it("a fully fixed objective projects the plan, not a run rate", () => {
    // Rent: 1389.17 planned, charged on day 3. A run rate would extrapolate
    // it to ~14.352 € by day 31 and scream RIESGO every month.
    const [row] = computeControl(
      [{ ...cat("Vivienda", 1389.17, 1389.17), fixedTotal: 1389.17, fixedMatched: 1389.17 }],
      3,
      31
    );
    expect(row.projectedEndOfMonth).toBe(1389.17);
    expect(row.projectedDeviation).toBe(0);
    expect(row.state).toBe("OK");
  });

  it("a fixed charge still pending counts at its planned amount", () => {
    // IBI: 600 planned, nothing charged yet. The month still owes it.
    const [row] = computeControl(
      [{ ...cat("Impuestos", 600, 0), fixedTotal: 600, fixedMatched: 0 }],
      6,
      31
    );
    expect(row.projectedEndOfMonth).toBe(600);
    expect(row.state).toBe("OK");
  });

  it("a mixed objective projects only its discretionary part", () => {
    // 24 € of subscriptions (all charged) + 40 € manual, 20 € of it spent by
    // day 10: 24 + 20/10×31 = 86 over a 64 € budget → RIESGO.
    const [row] = computeControl(
      [{ ...cat("Suscripciones", 64, 44), fixedTotal: 24, fixedMatched: 24 }],
      10,
      31
    );
    expect(row.projectedEndOfMonth).toBe(86);
    expect(row.projectedDeviation).toBe(22);
    expect(row.state).toBe("RIESGO");
  });

  it("omitting the fixed fields leaves the pure run rate untouched", () => {
    const withOut = computeControl([cat("Restaurantes", 550, 121.97)], 6, 31)[0];
    const withZero = computeControl(
      [{ ...cat("Restaurantes", 550, 121.97), fixedTotal: 0, fixedMatched: 0 }],
      6,
      31
    )[0];
    expect(withOut.projectedEndOfMonth).toBe(withZero.projectedEndOfMonth);
    expect(withOut.projectedEndOfMonth).toBeCloseTo(630.18, 2);
  });

  it("fixedMatched can never exceed the plan or what was consumed", () => {
    const [row] = computeControl(
      [{ ...cat("Vivienda", 100, 30), fixedTotal: 100, fixedMatched: 100 }],
      10,
      31
    );
    // Only 30 of the 100 has actually landed, so nothing is double-counted as
    // discretionary — the projection stays at the plan.
    expect(row.fixedMatched).toBe(30);
    expect(row.projectedEndOfMonth).toBe(100);
  });
});
