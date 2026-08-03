import { describe, it, expect } from "vitest";
import { detectAmountDeviation, detectMissedSeries } from "./alerts";
import type { SeriesOccurrence } from "./detect";

const series = (...amounts: number[]): SeriesOccurrence[] =>
  amounts.map((amount, i) => ({
    date: `2026-0${(i % 9) + 1}-15`,
    amount,
  }));

describe("detectAmountDeviation", () => {
  it("flags a charge well above the usual amount (the O2 case: 58 → 88.28)", () => {
    const deviation = detectAmountDeviation(series(58, 58, 58, 58, 88.28));
    expect(deviation).not.toBeNull();
    expect(deviation!.latestAmount).toBe(88.28);
    expect(deviation!.baselineAmount).toBe(58);
    expect(deviation!.relativeChange).toBeCloseTo(0.522, 3);
  });

  it("flags a drop as well, as informational data", () => {
    const deviation = detectAmountDeviation(series(124.29, 124.29, 124.29, 90));
    expect(deviation).not.toBeNull();
    expect(deviation!.relativeChange).toBeLessThan(0);
  });

  it("stays quiet inside the threshold (a 9% insurance rise at default 15%)", () => {
    expect(detectAmountDeviation(series(54.57, 54.61, 54.57, 59.49))).toBeNull();
  });

  it("catches the same rise when the caller tightens the threshold", () => {
    const deviation = detectAmountDeviation(series(54.57, 54.61, 54.57, 59.49), 0.05);
    expect(deviation).not.toBeNull();
    expect(deviation!.relativeChange).toBeCloseTo(0.09, 2);
  });

  it("uses the median of previous charges, so one earlier outlier is no baseline", () => {
    // Electra-style noisy series: median of [42.25, 107.29, 45.06] is 45.06.
    const deviation = detectAmountDeviation(series(42.25, 107.29, 45.06, 76.48));
    expect(deviation).not.toBeNull();
    expect(deviation!.baselineAmount).toBe(45.06);
  });

  it("needs at least 3 occurrences", () => {
    expect(detectAmountDeviation(series(10, 20))).toBeNull();
  });

  it("ignores a zero baseline", () => {
    expect(detectAmountDeviation(series(0, 0, 50))).toBeNull();
  });
});

describe("detectMissedSeries", () => {
  it("stays quiet within the grace window", () => {
    expect(detectMissedSeries("2026-08-01", "2026-08-05")).toBeNull();
  });

  it("flags a charge overdue past the grace window", () => {
    const missed = detectMissedSeries("2026-08-01", "2026-08-08");
    expect(missed).not.toBeNull();
    expect(missed!.expectedDate).toBe("2026-08-01");
    expect(missed!.daysOverdue).toBe(7);
  });

  it("stays quiet when the expected date is still ahead", () => {
    expect(detectMissedSeries("2026-08-10", "2026-08-03")).toBeNull();
  });

  it("respects a custom grace", () => {
    expect(detectMissedSeries("2026-08-01", "2026-08-08", 10)).toBeNull();
  });
});
