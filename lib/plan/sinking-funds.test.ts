import { describe, it, expect } from "vitest";
import {
  monthsElapsed,
  accruedAmount,
  isFunded,
  totalMonthlyContribution,
  suggestedContribution,
} from "./sinking-funds";

const REF = { year: 2026, month: 8 };

describe("monthsElapsed", () => {
  it("counts the start month itself", () => {
    expect(monthsElapsed("2026-08-03", REF)).toBe(1);
    expect(monthsElapsed("2026-06-01", REF)).toBe(3);
  });

  it("crosses years", () => {
    expect(monthsElapsed("2025-12-01", REF)).toBe(9);
  });
});

describe("accruedAmount", () => {
  it("accrues monthly from the start month and caps at target", () => {
    const fund = {
      targetAmount: 600,
      monthlyContribution: 100,
      startDate: "2026-05-01",
      initialAmount: 50,
    };
    // May–Aug = 4 months → 50 + 400
    expect(accruedAmount(fund, REF)).toBe(450);
    expect(accruedAmount(fund, { year: 2026, month: 12 })).toBe(600); // capped
  });

  it("a fund starting in the future has only its initial amount... capped at zero months", () => {
    const fund = {
      targetAmount: 600,
      monthlyContribution: 100,
      startDate: "2026-10-01",
      initialAmount: 0,
    };
    expect(accruedAmount(fund, REF)).toBe(0);
  });
});

describe("totalMonthlyContribution", () => {
  it("sums active unfunded funds and drops the ones already full", () => {
    const ibi = {
      targetAmount: 800,
      monthlyContribution: 100,
      startDate: "2026-08-01",
      initialAmount: 0,
    };
    const done = {
      targetAmount: 300,
      monthlyContribution: 150,
      startDate: "2026-01-01",
      initialAmount: 0,
    }; // full since February
    expect(totalMonthlyContribution([ibi, done], REF)).toBe(100);
  });

  it("still charges the month that completes the fund", () => {
    const fund = {
      targetAmount: 300,
      monthlyContribution: 100,
      startDate: "2026-06-01",
      initialAmount: 0,
    };
    // June+July accrued 200 < 300 → August contributes the final 100.
    expect(totalMonthlyContribution([fund], REF)).toBe(100);
    expect(isFunded(fund, REF)).toBe(true);
    // September: already full, no charge.
    expect(totalMonthlyContribution([fund], { year: 2026, month: 9 })).toBe(0);
  });
});

describe("suggestedContribution", () => {
  it("spreads the remainder over the months left", () => {
    // IBI ~800 due next June, nothing saved: 10 months → 80/month.
    expect(suggestedContribution(800, 0, "2027-06-01", REF)).toBe(80);
  });

  it("null when the date is not ahead", () => {
    expect(suggestedContribution(800, 0, "2026-08-15", REF)).toBeNull();
    expect(suggestedContribution(800, 0, "2026-05-01", REF)).toBeNull();
  });
});
