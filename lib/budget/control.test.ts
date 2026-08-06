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
});
