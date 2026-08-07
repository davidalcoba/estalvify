import { describe, it, expect } from "vitest";
import {
  computeCascade,
  computeActualResult,
  performance,
  reconciliationGap,
  rolloverBalance,
  monthsOfCushion,
  expectedResultToDate,
  openingSnapshotIsUsable,
} from "./cascade";

describe("computeCascade (v4: savings target in, variable as residue)", () => {
  it("acceptance #1: the spec's cascade — 8.262 − 2.650 − 225 − 1.000 = 4.387", () => {
    const c = computeCascade({
      plannedItems: [
        { direction: "CREDIT", amount: 6009 },
        { direction: "CREDIT", amount: 2253 },
        { direction: "DEBIT", amount: 2650 },
      ],
      rolloverQuotas: 225,
      savingsTarget: 1000,
      assignedVariable: 4390,
    });
    expect(c.expectedIncome).toBe(8262);
    expect(c.variableBudget).toBe(4387);
    expect(c.savingsTarget).toBe(1000);
    // Lines don't square with the residue: shown as a gap, never auto-fixed.
    expect(c.assignmentGap).toBe(3);
    expect(c.expectedResult).toBe(1000);
  });

  it("acceptance #1b: raising the target 1.000 → 1.300 lowers the residue to 4.087", () => {
    const base = {
      plannedItems: [
        { direction: "CREDIT" as const, amount: 8262 },
        { direction: "DEBIT" as const, amount: 2650 },
      ],
      rolloverQuotas: 225,
      assignedVariable: 4390,
    };
    const at1000 = computeCascade({ ...base, savingsTarget: 1000 });
    const at1300 = computeCascade({ ...base, savingsTarget: 1300 });
    expect(at1000.variableBudget).toBe(4387);
    expect(at1300.variableBudget).toBe(4087);
  });

  it("a target beyond the month's residue floors variable at 0 and caps the result", () => {
    const c = computeCascade({
      plannedItems: [{ direction: "CREDIT", amount: 3000 }, { direction: "DEBIT", amount: 2500 }],
      rolloverQuotas: 200,
      savingsTarget: 5000,
      assignedVariable: 0,
    });
    expect(c.variableBudget).toBe(0);
    expect(c.expectedResult).toBe(300); // what the month can actually leave
  });

  it("always uses EXPECTED amounts — reality lands in performance, not the plan", () => {
    const c = computeCascade({
      plannedItems: [{ direction: "CREDIT", amount: 6009 }],
      rolloverQuotas: 0,
      savingsTarget: 0,
      assignedVariable: 0,
    });
    expect(c.expectedIncome).toBe(6009);
  });

  it("a 600 € one-off IBI planned in August lowers August's residue, not the target", () => {
    const base = { rolloverQuotas: 0, savingsTarget: 1000, assignedVariable: 0 };
    const without = computeCascade({ plannedItems: [{ direction: "CREDIT", amount: 8262 }], ...base });
    const withIbi = computeCascade({
      plannedItems: [
        { direction: "CREDIT", amount: 8262 },
        { direction: "DEBIT", amount: 600 },
      ],
      ...base,
    });
    expect(without.variableBudget - withIbi.variableBudget).toBe(600);
    expect(withIbi.savingsTarget).toBe(1000);
  });
});

describe("computeActualResult / performance", () => {
  it("accrual: matched items count at actual amounts in their budget month", () => {
    const r = computeActualResult({
      matchedCredit: 8262,
      matchedDebit: 2610.5,
      unmatchedCredit: 12,
      unmatchedDebit: 2900,
    });
    expect(r.actualResult).toBe(8262 + 12 - 2610.5 - 2900);
  });

  it("plan test #4: a salary sliding into the next calendar month doesn't wreck performance", () => {
    // Under accrual the matched salary still counts in its budget month, so
    // July's real income carries the 6.009 even if the bank dated it 1 Aug.
    const july = computeActualResult({
      matchedCredit: 8262,
      matchedDebit: 2610,
      unmatchedCredit: 0,
      unmatchedDebit: 4800,
    });
    expect(performance(july.actualResult, 800)).toBe(52);
  });
});

describe("reconciliationGap", () => {
  it("plan test #12: a gap between flows and balance change is SHOWN", () => {
    expect(reconciliationGap(900, 852)).toBe(48);
    expect(reconciliationGap(null, 852)).toBeNull();
  });
});

describe("rolloverBalance / monthsOfCushion", () => {
  it("accumulates assigned minus spent across months", () => {
    expect(
      rolloverBalance([
        { assigned: 50, spent: 0 },
        { assigned: 50, spent: 120 },
      ])
    ).toBe(-20);
  });

  it("cushion is consolidated balance over average spend", () => {
    expect(monthsOfCushion(47664, 7700)).toBe(6.2);
    expect(monthsOfCushion(null, 7700)).toBeNull();
    expect(monthsOfCushion(47664, 0)).toBeNull();
  });
});

describe("expectedResultToDate", () => {
  // The month that made this necessary: charges land 1–8, salaries on 27–29.
  const rent = {
    direction: "DEBIT" as const,
    amount: 1389.17,
    windowToDay: 6,
    anchorMonthEnd: false,
  };
  const salary = {
    direction: "CREDIT" as const,
    amount: 6009,
    windowToDay: 29,
    anchorMonthEnd: false,
  };

  it("does not book income whose window has not opened yet", () => {
    // Day 7: the rent has been charged, the salary is three weeks away. The
    // whole-month plan would compare against +4 620 and report a catastrophe.
    const toDate = expectedResultToDate({
      plannedItems: [
        { ...rent, matched: true },
        { ...salary, matched: false },
      ],
      linearSpend: 0,
      daysElapsed: 7,
      daysInMonth: 31,
    });
    expect(toDate).toBe(-1389.17);
  });

  it("a matched item accrues at its PLANNED amount, so the gap is the deviation", () => {
    // Planned 1389.17, actually charged 1409.17: the 20 € rise is exactly what
    // performance should report, and it can only do that if the plan side
    // holds the planned figure.
    const toDate = expectedResultToDate({
      plannedItems: [{ ...rent, matched: true }],
      linearSpend: 0,
      daysElapsed: 7,
      daysInMonth: 31,
    });
    expect(performance(-1409.17, toDate)).toBe(-20);
  });

  it("an unmatched item accrues once its window has closed", () => {
    // Day 10, window closed on the 6th and nothing arrived: the month still
    // owes it, and hiding it would flatter the result.
    const toDate = expectedResultToDate({
      plannedItems: [{ ...rent, matched: false }],
      linearSpend: 0,
      daysElapsed: 10,
      daysInMonth: 31,
    });
    expect(toDate).toBe(-1389.17);
  });

  it("a month-end anchored item is due on the last day, not on day null", () => {
    const mortgage = {
      direction: "DEBIT" as const,
      amount: 562.48,
      matched: false,
      windowToDay: null,
      anchorMonthEnd: true,
    };
    expect(
      expectedResultToDate({
        plannedItems: [mortgage],
        linearSpend: 0,
        daysElapsed: 30,
        daysInMonth: 31,
      })
    ).toBe(0);
  });

  it("the variable side accrues linearly, so on-pace spending nets to zero", () => {
    // 3100 € of variable budget over 31 days, 700 € spent by day 7 — exactly
    // on pace. Nothing planned has moved, so performance must be 0.
    const toDate = expectedResultToDate({
      plannedItems: [],
      linearSpend: 3100,
      daysElapsed: 7,
      daysInMonth: 31,
    });
    expect(toDate).toBe(-700);
    expect(performance(-700, toDate)).toBe(0);
  });

  it("a fully elapsed month accrues the whole plan", () => {
    const toDate = expectedResultToDate({
      plannedItems: [
        { ...rent, matched: true },
        { ...salary, matched: true },
      ],
      linearSpend: 3100,
      daysElapsed: 31,
      daysInMonth: 31,
    });
    expect(toDate).toBe(1519.83);
  });
});

describe("openingSnapshotIsUsable", () => {
  const augustStart = new Date("2026-08-01T00:00:00Z");

  it("accepts the last days of the previous month", () => {
    expect(openingSnapshotIsUsable(new Date("2026-07-31T00:00:00Z"), augustStart, 3)).toBe(true);
    expect(openingSnapshotIsUsable(new Date("2026-07-29T00:00:00Z"), augustStart, 3)).toBe(true);
  });

  it("rejects the snapshot that opened August on a June figure", () => {
    // The production case: the sync stopped on 7 June and resumed on 3 August,
    // so the search for "last row before the month" reached back eight weeks
    // and turned two salaries into August's savings.
    expect(openingSnapshotIsUsable(new Date("2026-06-07T00:00:00Z"), augustStart, 3)).toBe(false);
  });

  it("rejects a missing snapshot", () => {
    expect(openingSnapshotIsUsable(null, augustStart, 3)).toBe(false);
  });

  it("accepts a snapshot exactly at the limit, and rejects one past it", () => {
    expect(openingSnapshotIsUsable(new Date("2026-07-29T00:00:00Z"), augustStart, 3)).toBe(true);
    expect(openingSnapshotIsUsable(new Date("2026-07-28T00:00:00Z"), augustStart, 3)).toBe(false);
  });
});
