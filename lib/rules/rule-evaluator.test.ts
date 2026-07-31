import { describe, it, expect } from "vitest";
import { buildRuleWhereClause } from "./rule-evaluator";
import type { RuleCondition } from "./rule-dto";

// The clause is a nested { AND: [...] } structure. These helpers pull the
// AND array out with a loose type so tests can assert on its contents.
function andClauses(where: unknown): Record<string, unknown>[] {
  return (where as { AND: Record<string, unknown>[] }).AND;
}

describe("buildRuleWhereClause", () => {
  it("always scopes to the given userId", () => {
    const clauses = andClauses(buildRuleWhereClause("user-1", [], null));
    expect(clauses[0]).toEqual({ userId: "user-1" });
  });

  it("adds a source-category constraint (APPROVED) when sourceCategoryId is set", () => {
    const clauses = andClauses(buildRuleWhereClause("user-1", [], "cat-9"));
    expect(clauses).toContainEqual({
      categorization: { categoryId: "cat-9", status: "APPROVED" },
    });
  });

  it("does not add a source-category constraint when sourceCategoryId is null", () => {
    const clauses = andClauses(buildRuleWhereClause("user-1", [], null));
    expect(clauses.some((c) => "categorization" in c)).toBe(false);
  });

  it("maps each operator to the expected Prisma text filter (case-insensitive)", () => {
    const conditions: RuleCondition[] = [
      { field: "description", operator: "contains", value: "amazon" },
      { field: "description", operator: "equals", value: "netflix" },
      { field: "remittanceInfo", operator: "startsWith", value: "PAGO" },
      { field: "remittanceInfo", operator: "endsWith", value: "SL" },
    ];
    const clauses = andClauses(buildRuleWhereClause("user-1", conditions, null));
    expect(clauses).toContainEqual({ description: { contains: "amazon", mode: "insensitive" } });
    expect(clauses).toContainEqual({ description: { equals: "netflix", mode: "insensitive" } });
    expect(clauses).toContainEqual({ remittanceInfo: { startsWith: "PAGO", mode: "insensitive" } });
    expect(clauses).toContainEqual({ remittanceInfo: { endsWith: "SL", mode: "insensitive" } });
  });

  it("trims condition values before matching", () => {
    const clauses = andClauses(
      buildRuleWhereClause("user-1", [{ field: "description", operator: "contains", value: "  amazon  " }], null)
    );
    expect(clauses).toContainEqual({ description: { contains: "amazon", mode: "insensitive" } });
  });

  it("skips conditions whose value is blank/whitespace", () => {
    const clauses = andClauses(
      buildRuleWhereClause("user-1", [{ field: "description", operator: "contains", value: "   " }], null)
    );
    // Only the userId scope clause remains.
    expect(clauses).toHaveLength(1);
    expect(clauses[0]).toEqual({ userId: "user-1" });
  });

  it("combines multiple conditions with AND (each is a separate clause)", () => {
    const conditions: RuleCondition[] = [
      { field: "description", operator: "contains", value: "uber" },
      { field: "remittanceInfo", operator: "contains", value: "trip" },
    ];
    const clauses = andClauses(buildRuleWhereClause("user-1", conditions, null));
    // userId + 2 conditions
    expect(clauses).toHaveLength(3);
  });
});
