import { describe, it, expect } from "vitest";
import { incomeConcentration } from "./household";

describe("incomeConcentration", () => {
  it("reports the top holder's share (73% of fixed income on one person)", () => {
    const result = incomeConcentration([
      { holder: "David", income: 6009 },
      { holder: "Mònica", income: 2253 },
    ]);
    expect(result).not.toBeNull();
    expect(result!.holder).toBe("David");
    expect(result!.share).toBeCloseTo(0.727, 3);
  });

  it("aggregates multiple accounts per holder", () => {
    const result = incomeConcentration([
      { holder: "David", income: 3000 },
      { holder: "David", income: 3009 },
      { holder: "Mònica", income: 2253 },
    ]);
    expect(result!.share).toBeCloseTo(0.727, 3);
  });

  it("null with a single holder — nothing to compare", () => {
    expect(incomeConcentration([{ holder: "David", income: 6009 }])).toBeNull();
  });

  it("null without income", () => {
    expect(
      incomeConcentration([
        { holder: "David", income: 0 },
        { holder: "Mònica", income: 0 },
      ])
    ).toBeNull();
  });
});
