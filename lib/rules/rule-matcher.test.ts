import { describe, it, expect } from "vitest";
import { matchesCondition, matchesNode, isValidRegex } from "./rule-matcher";
import type { MatchableTransaction } from "./rule-matcher";
import { normalizeText, parseConditions } from "./rule-dto";
import type { ConditionNode, RuleCondition } from "./rule-dto";

function tx(overrides: Partial<MatchableTransaction> = {}): MatchableTransaction {
  return {
    description: "MERCADONA BARCELONA",
    remittanceInfo: "PAGO CON TARJETA",
    amount: 42.5,
    direction: "DEBIT",
    accountName: "BBVA Checking",
    ...overrides,
  };
}

function cond(c: Partial<RuleCondition>): RuleCondition {
  return { field: "any", operator: "contains", value: "", ...c };
}

describe("normalizeText", () => {
  it("folds accents, upper-cases and collapses whitespace", () => {
    expect(normalizeText(" AmortizaciÓn   SEPA ")).toBe("AMORTIZACION SEPA");
    expect(normalizeText("Aigües")).toBe("AIGUES");
    expect(normalizeText("Nómina")).toBe("NOMINA");
  });

  it("treats null and undefined as empty", () => {
    expect(normalizeText(null)).toBe("");
    expect(normalizeText(undefined)).toBe("");
  });
});

describe("text matching", () => {
  it("matches accented data with an unaccented rule value", () => {
    const t = tx({ description: "AMORTIZACIÓN PRÉSTAMO" });
    expect(matchesCondition(t, cond({ value: "AMORTIZACION" }))).toBe(true);
  });

  it("matches unaccented data with an accented rule value", () => {
    const t = tx({ description: "NOMINA JULIO" });
    expect(matchesCondition(t, cond({ value: "NÓMINA" }))).toBe(true);
  });

  it("is case-insensitive", () => {
    expect(matchesCondition(tx(), cond({ value: "mercadona" }))).toBe(true);
  });

  it("supports equals, startsWith and endsWith", () => {
    const t = tx({ description: "LIDL VILAFRANCA", remittanceInfo: null });
    expect(
      matchesCondition(t, cond({ field: "description", operator: "equals", value: "lidl vilafranca" }))
    ).toBe(true);
    expect(
      matchesCondition(t, cond({ field: "description", operator: "startsWith", value: "LIDL" }))
    ).toBe(true);
    expect(
      matchesCondition(t, cond({ field: "description", operator: "endsWith", value: "VILAFRANCA" }))
    ).toBe(true);
  });

  it("never matches on a blank value", () => {
    expect(matchesCondition(tx(), cond({ value: "   " }))).toBe(false);
  });
});

describe("field selection", () => {
  it("`any` searches description and remittanceInfo together", () => {
    const t = tx({ description: "ESCLAT SANT PERE", remittanceInfo: "ADEUDO A SU CARGO" });
    expect(matchesCondition(t, cond({ field: "any", value: "ESCLAT" }))).toBe(true);
    expect(matchesCondition(t, cond({ field: "any", value: "ADEUDO" }))).toBe(true);
  });

  it("`remittanceInfo` alone misses merchant names — the bug that broke the original rules", () => {
    // parseRemittanceFields puts the operation type in remittanceInfo and the
    // merchant in description, so a merchant rule on remittanceInfo can never hit.
    const t = tx({ description: "SUPERMERCAT CONDIS", remittanceInfo: "PAGO CON TARJETA" });
    expect(
      matchesCondition(t, cond({ field: "remittanceInfo", value: "SUPERMERCA" }))
    ).toBe(false);
    expect(matchesCondition(t, cond({ field: "any", value: "SUPERMERCA" }))).toBe(true);
  });

  it("tolerates a null remittanceInfo", () => {
    const t = tx({ description: "MERCADONA", remittanceInfo: null });
    expect(matchesCondition(t, cond({ field: "any", value: "MERCADONA" }))).toBe(true);
    expect(matchesCondition(t, cond({ field: "remittanceInfo", value: "X" }))).toBe(false);
  });

  it("matches on account name", () => {
    expect(
      matchesCondition(tx(), cond({ field: "account", value: "bbva" }))
    ).toBe(true);
  });
});

describe("word boundaries — the real substring collisions", () => {
  it("`word` DIA does not match CLAUDIA", () => {
    const claudia = tx({ description: "TRANSFERENCIA A CLAUDIA", remittanceInfo: null });
    const supermarket = tx({ description: "DIA VILAFRANCA", remittanceInfo: null });

    expect(matchesCondition(claudia, cond({ operator: "word", value: "DIA" }))).toBe(false);
    expect(matchesCondition(supermarket, cond({ operator: "word", value: "DIA" }))).toBe(true);

    // Plain `contains` is exactly what caused the 304 € misattribution.
    expect(matchesCondition(claudia, cond({ operator: "contains", value: "DIA" }))).toBe(true);
  });

  it("`word` ESCLAT does not match ESCLATOIL", () => {
    const fuel = tx({ description: "ESCLATOIL VILAFRANCA", remittanceInfo: null });
    const grocer = tx({ description: "ESCLAT SANT SADURNI", remittanceInfo: null });

    expect(matchesCondition(fuel, cond({ operator: "word", value: "ESCLAT" }))).toBe(false);
    expect(matchesCondition(grocer, cond({ operator: "word", value: "ESCLAT" }))).toBe(true);
  });

  it("`word` KING does not match PARKING", () => {
    // The parking/subscriptions collision, stated accurately: PARKING embeds
    // KING, not RING (P-A-R-K-I-N-G).
    const parking = tx({ description: "PARKING SABA", remittanceInfo: null });
    expect(matchesCondition(parking, cond({ operator: "contains", value: "KING" }))).toBe(true);
    expect(matchesCondition(parking, cond({ operator: "word", value: "KING" }))).toBe(false);
  });

  it("escapes regex metacharacters in the word value", () => {
    const t = tx({ description: "PAGO A+B SL", remittanceInfo: null });
    expect(matchesCondition(t, cond({ operator: "word", value: "A+B" }))).toBe(true);
    expect(matchesCondition(tx(), cond({ operator: "word", value: "A+B" }))).toBe(false);
  });
});

describe("regex operator", () => {
  it("supports explicit word-boundary patterns", () => {
    const claudia = tx({ description: "TRANSFERENCIA A CLAUDIA", remittanceInfo: null });
    const supermarket = tx({ description: "COMPRA DIA SL", remittanceInfo: null });

    expect(matchesCondition(claudia, cond({ operator: "matches", value: "\\bDIA\\b" }))).toBe(false);
    expect(matchesCondition(supermarket, cond({ operator: "matches", value: "\\bDIA\\b" }))).toBe(true);
  });

  it("an invalid pattern fails to match instead of throwing", () => {
    expect(() =>
      matchesCondition(tx(), cond({ operator: "matches", value: "[unclosed" }))
    ).not.toThrow();
    expect(matchesCondition(tx(), cond({ operator: "matches", value: "[unclosed" }))).toBe(false);
    expect(isValidRegex("[unclosed")).toBe(false);
    expect(isValidRegex("\\bDIA\\b")).toBe(true);
  });

  it("rejects an over-long pattern", () => {
    expect(isValidRegex("A".repeat(201))).toBe(false);
  });
});

describe("amount", () => {
  // Both BBVA Plan EstarSeguro receipts share a description and differ only in amount.
  const home = tx({ description: "BBVA PLAN ESTARSEGURO", amount: 54.61, remittanceInfo: null });
  const life = tx({ description: "BBVA PLAN ESTARSEGURO", amount: 9.39, remittanceInfo: null });

  it("`between` separates the two identical-description insurance receipts", () => {
    const homeRule: ConditionNode = {
      op: "AND",
      children: [
        cond({ value: "ESTARSEGURO" }),
        cond({ field: "amount", operator: "between", value: [50, 60] }),
      ],
    };

    expect(matchesNode(home, homeRule)).toBe(true);
    expect(matchesNode(life, homeRule)).toBe(false);
  });

  it("supports gt/gte/lt/lte and equals", () => {
    const t = tx({ amount: 100 });
    expect(matchesCondition(t, cond({ field: "amount", operator: "gt", value: 99 }))).toBe(true);
    expect(matchesCondition(t, cond({ field: "amount", operator: "gte", value: 100 }))).toBe(true);
    expect(matchesCondition(t, cond({ field: "amount", operator: "lt", value: 100 }))).toBe(false);
    expect(matchesCondition(t, cond({ field: "amount", operator: "lte", value: 100 }))).toBe(true);
    expect(matchesCondition(t, cond({ field: "amount", operator: "equals", value: 100 }))).toBe(true);
  });

  it("accepts numeric strings, so values coming from form inputs work", () => {
    const t = tx({ amount: 54.61 });
    expect(
      matchesCondition(t, cond({ field: "amount", operator: "between", value: ["50", "60"] as unknown as [number, number] }))
    ).toBe(true);
  });

  it("normalizes an inverted range", () => {
    const t = tx({ amount: 55 });
    expect(matchesCondition(t, cond({ field: "amount", operator: "between", value: [60, 50] }))).toBe(true);
  });

  it("compares magnitude — amounts are stored unsigned", () => {
    const credit = tx({ amount: 2000, direction: "CREDIT" });
    expect(matchesCondition(credit, cond({ field: "amount", operator: "gte", value: 1000 }))).toBe(true);
  });

  it("a non-numeric value never matches", () => {
    expect(matchesCondition(tx(), cond({ field: "amount", operator: "gt", value: "abc" }))).toBe(false);
  });
});

describe("direction — the transfers case", () => {
  const out = tx({ description: "TRASPASO A CUENTA DAVID ALCOBA", direction: "DEBIT", remittanceInfo: null });
  const inbound = tx({ description: "TRASPASO DESDE CUENTA MONICA ARBOS", direction: "CREDIT", remittanceInfo: null });

  it("separates near-identical transfer text by direction", () => {
    const savings: ConditionNode = {
      op: "AND",
      children: [
        cond({ value: "TRASPASO" }),
        cond({ field: "direction", operator: "equals", value: "DEBIT" }),
      ],
    };

    expect(matchesNode(out, savings)).toBe(true);
    expect(matchesNode(inbound, savings)).toBe(false);
  });
});

describe("negate", () => {
  it("inverts a condition, enabling exclusions", () => {
    const fuel = tx({ description: "ESCLATOIL VILAFRANCA", remittanceInfo: null });
    const grocer = tx({ description: "ESCLAT SANT SADURNI", remittanceInfo: null });

    const groceriesNotFuel: ConditionNode = {
      op: "AND",
      children: [
        cond({ value: "ESCLAT" }),
        cond({ value: "ESCLATOIL", negate: true }),
      ],
    };

    expect(matchesNode(grocer, groceriesNotFuel)).toBe(true);
    expect(matchesNode(fuel, groceriesNotFuel)).toBe(false);
  });
});

describe("AND / OR trees", () => {
  const supermarkets: ConditionNode = {
    op: "OR",
    children: [
      cond({ value: "MERCADONA" }),
      cond({ value: "CONDIS" }),
      cond({ value: "LIDL" }),
      cond({ operator: "word", value: "DIA" }),
    ],
  };

  it("OR matches when any child matches", () => {
    expect(matchesNode(tx({ description: "LIDL VILAFRANCA" }), supermarkets)).toBe(true);
    expect(matchesNode(tx({ description: "CONDIS EXPRESS" }), supermarkets)).toBe(true);
    expect(matchesNode(tx({ description: "ZARA HOME" }), supermarkets)).toBe(false);
  });

  it("AND requires every child", () => {
    const node: ConditionNode = {
      op: "AND",
      children: [cond({ value: "RESTAURANT" }), cond({ value: "CAFETERIA" })],
    };
    // The original "Restaurants" rule: no single description holds both words.
    expect(matchesNode(tx({ description: "RESTAURANT CAN PERE" }), node)).toBe(false);
  });

  it("supports nesting", () => {
    const node: ConditionNode = {
      op: "AND",
      children: [
        supermarkets,
        cond({ field: "direction", operator: "equals", value: "DEBIT" }),
      ],
    };
    expect(matchesNode(tx({ description: "LIDL", direction: "DEBIT" }), node)).toBe(true);
    expect(matchesNode(tx({ description: "LIDL", direction: "CREDIT" }), node)).toBe(false);
  });

  it("an empty group matches nothing", () => {
    expect(matchesNode(tx(), { op: "AND", children: [] })).toBe(false);
    expect(matchesNode(tx(), { op: "OR", children: [] })).toBe(false);
  });
});

describe("parseConditions", () => {
  it("reads a legacy flat array as an AND group", () => {
    const legacy = [
      { field: "remittanceInfo", operator: "contains", value: "RESTAURANTE" },
      { field: "remittanceInfo", operator: "contains", value: "CAFETERIA" },
    ];
    expect(parseConditions(legacy)).toEqual({ op: "AND", children: legacy });
  });

  it("reads a tree unchanged", () => {
    const tree = { op: "OR", children: [cond({ value: "LIDL" })] };
    expect(parseConditions(tree)).toEqual(tree);
  });

  it("defaults an unknown op to AND and survives malformed input", () => {
    expect(parseConditions({ op: "XOR", children: [] })).toEqual({ op: "AND", children: [] });
    expect(parseConditions(null)).toEqual({ op: "AND", children: [] });
    expect(parseConditions("nonsense")).toEqual({ op: "AND", children: [] });
  });

  it("wraps a bare condition object", () => {
    const single = { field: "any", operator: "contains", value: "LIDL" };
    expect(parseConditions(single)).toEqual({ op: "AND", children: [single] });
  });
});
