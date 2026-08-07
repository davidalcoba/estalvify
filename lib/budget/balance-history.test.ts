import { describe, it, expect } from "vitest";
import {
  pickAnchor,
  dayDiff,
  walkWindow,
  balanceAt,
  anchorGap,
  type BalanceAnchor,
} from "./balance-history";

// The production shape: a real reading on 7 June, an eight-week hole while a
// PSD2 consent sat expired, then readings again from 3 August.
const JUN: BalanceAnchor = { date: "2026-06-07", balance: 47663.89 };
const AUG3: BalanceAnchor = { date: "2026-08-03", balance: 53036.06 };
const AUG7: BalanceAnchor = { date: "2026-08-07", balance: 52069.07 };

describe("pickAnchor", () => {
  it("crosses the hole rather than walking eight weeks of ledger", () => {
    // Opening balance of August = end of 31 July. The June anchor is 54 days
    // back, the 3 August one 3 days forward: fewer transactions between a bank
    // reading and the answer wins, even though it means walking backwards.
    expect(pickAnchor([JUN, AUG3, AUG7], "2026-07-31")).toEqual(AUG3);
  });

  it("returns null with no anchors at all — a brand-new connection", () => {
    expect(pickAnchor([], "2026-07-31")).toBeNull();
  });

  it("prefers the earlier anchor on a tie, the settled side", () => {
    const a: BalanceAnchor = { date: "2026-08-01", balance: 100 };
    const b: BalanceAnchor = { date: "2026-08-03", balance: 200 };
    expect(pickAnchor([a, b], "2026-08-02")).toEqual(a);
  });
});

describe("walkWindow", () => {
  it("walks forward from an anchor that precedes the target", () => {
    expect(walkWindow("2026-06-07", "2026-07-31")).toEqual({
      after: "2026-06-07",
      upTo: "2026-07-31",
      forward: true,
    });
  });

  it("walks back from an anchor that follows it", () => {
    expect(walkWindow("2026-08-03", "2026-07-31")).toEqual({
      after: "2026-07-31",
      upTo: "2026-08-03",
      forward: false,
    });
  });
});

describe("balanceAt", () => {
  it("subtracts the flows when walking back to the opening balance", () => {
    // 1–3 August moved −1.000 net, so 31 July closed 1.000 above the 3 August
    // reading. This is the figure August's saving must be measured from.
    expect(balanceAt(AUG3, "2026-07-31", -1000)).toBe(54036.06);
  });

  it("adds them when walking forward", () => {
    expect(balanceAt(JUN, "2026-07-31", 1000)).toBe(48663.89);
  });

  it("returns the anchor itself when it IS the target", () => {
    expect(balanceAt(AUG7, "2026-08-07", 0)).toBe(52069.07);
  });
});

describe("anchorGap", () => {
  it("is the residue two real readings leave after the ledger explains them", () => {
    // Measured on production: the readings differ by 4.405,18 and 487
    // transactions account for 4.371,69.
    expect(anchorGap(JUN, AUG7, 4371.69)).toBe(33.49);
  });

  it("is zero when the ledger explains the change exactly", () => {
    expect(anchorGap(JUN, AUG7, 4405.18)).toBe(0);
  });

  it("cannot be computed from a single anchor", () => {
    expect(anchorGap(JUN, JUN, 0)).toBeNull();
    expect(anchorGap(null, AUG7, 0)).toBeNull();
    expect(anchorGap(JUN, null, 0)).toBeNull();
  });
});

describe("dayDiff", () => {
  it("counts whole days, signed", () => {
    expect(dayDiff("2026-08-01", "2026-08-07")).toBe(6);
    expect(dayDiff("2026-08-07", "2026-08-01")).toBe(-6);
    expect(dayDiff("2026-06-07", "2026-08-07")).toBe(61);
  });
});
