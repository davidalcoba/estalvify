import { describe, it, expect } from "vitest";
import { buildRulePrefilterWhere } from "./rule-evaluator";

// The clause is a nested { AND: [...] } structure. This helper pulls the AND
// array out with a loose type so tests can assert on its contents.
function andClauses(where: unknown): Record<string, unknown>[] {
  return (where as { AND: Record<string, unknown>[] }).AND;
}

describe("buildRulePrefilterWhere", () => {
  it("always scopes to the given userId", () => {
    const clauses = andClauses(buildRulePrefilterWhere("user-1", null));
    expect(clauses[0]).toEqual({ userId: "user-1" });
  });

  it("adds a source-category constraint (APPROVED) when sourceCategoryId is set", () => {
    const clauses = andClauses(buildRulePrefilterWhere("user-1", "cat-9"));
    expect(clauses).toContainEqual({
      categorization: { categoryId: "cat-9", status: "APPROVED" },
    });
  });

  it("does not add a source-category constraint when sourceCategoryId is null", () => {
    const clauses = andClauses(buildRulePrefilterWhere("user-1", null));
    expect(clauses.some((c) => "categorization" in c)).toBe(false);
  });

  it("restricts to uncategorized/rejected rows when asked", () => {
    const clauses = andClauses(
      buildRulePrefilterWhere("user-1", null, { onlyUncategorized: true })
    );
    expect(clauses).toContainEqual({
      OR: [{ categorization: null }, { categorization: { status: "REJECTED" } }],
    });
  });

  it("prefers the source-category constraint over onlyUncategorized", () => {
    // A source-category rule operates on already-categorized rows by definition,
    // so the two filters are mutually exclusive.
    const clauses = andClauses(
      buildRulePrefilterWhere("user-1", "cat-9", { onlyUncategorized: true })
    );
    expect(clauses).toHaveLength(2);
    expect(clauses).toContainEqual({
      categorization: { categoryId: "cat-9", status: "APPROVED" },
    });
  });
});
