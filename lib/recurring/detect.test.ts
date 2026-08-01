import { describe, it, expect } from "vitest";
import {
  normalizeMerchantKey,
  merchantDisplayName,
  median,
  daysBetween,
  classifyCadence,
  nextExpectedDate,
  detectRecurringSeries,
  type DetectionInput,
} from "./detect";

describe("normalizeMerchantKey", () => {
  it("collapses digits, dates and punctuation to a stable key", () => {
    expect(normalizeMerchantKey("NETFLIX 1234 05/01", null)).toBe("NETFLIX");
    expect(normalizeMerchantKey("NETFLIX.COM 987", null)).toBe("NETFLIX COM");
  });

  it("strips known bank prefixes", () => {
    expect(normalizeMerchantKey("PAGO CON TARJETA SPOTIFY AB", null)).toBe("SPOTIFY AB");
  });

  it("returns empty for an unusable descriptor", () => {
    expect(normalizeMerchantKey("12345", null)).toBe("");
    expect(normalizeMerchantKey(null, null)).toBe("");
  });
});

describe("merchantDisplayName", () => {
  it("strips the prefix and preserves original case", () => {
    expect(merchantDisplayName("RECIBO Gimnasio Metropolitan", null)).toBe(
      "Gimnasio Metropolitan"
    );
  });
});

describe("median", () => {
  it("handles odd and even lengths", () => {
    expect(median([30, 31, 29])).toBe(30);
    expect(median([28, 30, 31, 33])).toBe(30.5);
    expect(median([])).toBe(0);
  });
});

describe("daysBetween", () => {
  it("counts whole days across a month", () => {
    expect(daysBetween("2026-01-01", "2026-01-31")).toBe(30);
    expect(daysBetween("2026-01-15", "2026-02-15")).toBe(31);
  });
});

describe("classifyCadence", () => {
  it("maps median gaps to cadence buckets", () => {
    expect(classifyCadence(7)).toBe("WEEKLY");
    expect(classifyCadence(30)).toBe("MONTHLY");
    expect(classifyCadence(91)).toBe("QUARTERLY");
    expect(classifyCadence(365)).toBe("YEARLY");
  });

  it("returns null for irregular gaps", () => {
    expect(classifyCadence(15)).toBeNull();
    expect(classifyCadence(200)).toBeNull();
  });
});

describe("nextExpectedDate", () => {
  it("advances by one calendar period", () => {
    expect(nextExpectedDate("2026-01-15", "MONTHLY")).toBe("2026-02-15");
    expect(nextExpectedDate("2026-12-10", "MONTHLY")).toBe("2027-01-10");
    expect(nextExpectedDate("2026-03-01", "WEEKLY")).toBe("2026-03-08");
    expect(nextExpectedDate("2026-01-15", "YEARLY")).toBe("2027-01-15");
  });
});

function tx(overrides: Partial<DetectionInput>): DetectionInput {
  return {
    amount: 10,
    direction: "DEBIT",
    valueDate: "2026-01-01",
    description: "NETFLIX",
    remittanceInfo: null,
    ...overrides,
  };
}

describe("detectRecurringSeries", () => {
  it("detects a monthly subscription", () => {
    const rows = [
      tx({ amount: 13.99, valueDate: "2026-01-05", description: "NETFLIX 111" }),
      tx({ amount: 13.99, valueDate: "2026-02-05", description: "NETFLIX 222" }),
      tx({ amount: 13.99, valueDate: "2026-03-05", description: "NETFLIX 333" }),
    ];
    const result = detectRecurringSeries(rows);
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      merchantKey: "NETFLIX",
      direction: "DEBIT",
      cadence: "MONTHLY",
      occurrences: 3,
      averageAmount: 13.99,
      lastSeen: "2026-03-05",
      nextExpected: "2026-04-05",
    });
  });

  it("ignores groups below the minimum occurrences", () => {
    const rows = [
      tx({ valueDate: "2026-01-05" }),
      tx({ valueDate: "2026-02-05" }),
    ];
    expect(detectRecurringSeries(rows)).toHaveLength(0);
  });

  it("ignores irregular one-off spending at the same merchant", () => {
    const rows = [
      tx({ description: "AMAZON 1", valueDate: "2026-01-03" }),
      tx({ description: "AMAZON 2", valueDate: "2026-01-09" }),
      tx({ description: "AMAZON 3", valueDate: "2026-02-20" }),
      tx({ description: "AMAZON 4", valueDate: "2026-02-21" }),
    ];
    expect(detectRecurringSeries(rows)).toHaveLength(0);
  });

  it("separates expenses from income and picks the majority category", () => {
    const rows = [
      tx({ amount: 2000, direction: "CREDIT", valueDate: "2026-01-30", description: "ACME PAYROLL", categoryId: "salary", categoryName: "Salary", categoryColor: "#0f0" }),
      tx({ amount: 2000, direction: "CREDIT", valueDate: "2026-02-27", description: "ACME PAYROLL", categoryId: "salary", categoryName: "Salary", categoryColor: "#0f0" }),
      tx({ amount: 2000, direction: "CREDIT", valueDate: "2026-03-30", description: "ACME PAYROLL", categoryId: "salary", categoryName: "Salary", categoryColor: "#0f0" }),
      tx({ amount: 9.99, valueDate: "2026-01-05", description: "SPOTIFY" }),
      tx({ amount: 9.99, valueDate: "2026-02-05", description: "SPOTIFY" }),
      tx({ amount: 9.99, valueDate: "2026-03-05", description: "SPOTIFY" }),
    ];
    const result = detectRecurringSeries(rows);
    expect(result.map((r) => r.direction)).toEqual(["DEBIT", "CREDIT"]);
    const salary = result.find((r) => r.direction === "CREDIT");
    expect(salary?.categoryId).toBe("salary");
    expect(salary?.categoryName).toBe("Salary");
  });
});
