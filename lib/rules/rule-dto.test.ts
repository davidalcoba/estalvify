import { describe, it, expect } from "vitest";
import { toCategoryRuleDTO } from "./rule-dto";

function rule(overrides: Partial<Parameters<typeof toCategoryRuleDTO>[0]>) {
  return toCategoryRuleDTO({
    id: "r1",
    name: "Rule",
    conditions: { op: "AND", children: [] },
    sourceCategoryId: null,
    categoryId: "c1",
    isActive: true,
    matchCount: 0,
    lastRunAt: null,
    lastMatchAt: null,
    createdAt: new Date("2026-01-01T00:00:00Z"),
    category: { name: "Cat", color: "#fff" },
    sourceCategory: null,
    ...overrides,
  });
}

// neverMatched exists to surface DEAD rules. matchCount holds only the most
// recent run's matches, so "matchCount 0" describes a quiet run, not a dead
// rule — six healthy rules were flagged red because of exactly that.
describe("toCategoryRuleDTO — neverMatched", () => {
  it("true only when the rule has run and lastMatchAt is null", () => {
    expect(
      rule({ lastRunAt: new Date("2026-08-01"), lastMatchAt: null }).neverMatched
    ).toBe(true);
  });

  it("false for a rule that matched in the past but caught nothing last run", () => {
    expect(
      rule({
        lastRunAt: new Date("2026-08-01"),
        lastMatchAt: new Date("2026-06-01"),
        matchCount: 0,
      }).neverMatched
    ).toBe(false);
  });

  it("false for a rule that has never run at all", () => {
    expect(rule({ lastRunAt: null, lastMatchAt: null }).neverMatched).toBe(false);
  });
});
