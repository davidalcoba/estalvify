import { describe, it, expect } from "vitest";
import { buildUncategorizedWhere, matchesTransactionSearch } from "./categorize";

describe("matchesTransactionSearch", () => {
  const tx = { description: "MERCADONA SL", remittanceInfo: "COMPRA TARJETA" };

  it("matches case-insensitively on description", () => {
    expect(matchesTransactionSearch(tx, "mercadona")).toBe(true);
  });

  it("matches on remittanceInfo", () => {
    expect(matchesTransactionSearch(tx, "tarjeta")).toBe(true);
  });

  it("returns false when neither field contains the query", () => {
    expect(matchesTransactionSearch(tx, "netflix")).toBe(false);
  });

  it("tolerates null fields", () => {
    expect(matchesTransactionSearch({ description: null, remittanceInfo: null }, "x")).toBe(false);
  });
});

function andClauses(where: unknown): Record<string, unknown>[] {
  return (where as { AND: Record<string, unknown>[] }).AND;
}

describe("buildUncategorizedWhere", () => {
  it("scopes to the user and matches uncategorized or rejected transactions", () => {
    const clauses = andClauses(buildUncategorizedWhere("user-1"));
    expect(clauses[0]).toEqual({ userId: "user-1" });
    expect(clauses[1]).toEqual({
      OR: [{ categorization: null }, { categorization: { status: "REJECTED" } }],
    });
  });

  it("does not add a search clause when no query is given", () => {
    expect(andClauses(buildUncategorizedWhere("user-1"))).toHaveLength(2);
  });

  it("ignores a blank/whitespace query", () => {
    expect(andClauses(buildUncategorizedWhere("user-1", "   "))).toHaveLength(2);
  });

  it("adds a case-insensitive search across description and remittanceInfo", () => {
    const clauses = andClauses(buildUncategorizedWhere("user-1", "  Mercadona  "));
    expect(clauses).toHaveLength(3);
    // The query is trimmed before use.
    expect(clauses[2]).toEqual({
      OR: [
        { description: { contains: "Mercadona", mode: "insensitive" } },
        { remittanceInfo: { contains: "Mercadona", mode: "insensitive" } },
      ],
    });
  });
});
