import { describe, it, expect } from "vitest";
import { formatCurrency, formatDate } from "./formatters";

describe("formatCurrency", () => {
  it("formats a number in the given locale and currency", () => {
    // Non-breaking spaces are used by Intl; normalize before asserting.
    const out = formatCurrency(1234.5, "EUR", "es-ES").replace(/ /g, " ");
    expect(out).toBe("1234,50 €");
  });

  it("accepts a string amount", () => {
    const out = formatCurrency("10", "EUR", "es-ES").replace(/ /g, " ");
    expect(out).toBe("10,00 €");
  });

  it("accepts a Decimal-like object with toString()", () => {
    const decimalLike = { toString: () => "42.75" };
    const out = formatCurrency(decimalLike, "EUR", "es-ES").replace(/ /g, " ");
    expect(out).toBe("42,75 €");
  });

  it("respects a different currency", () => {
    const out = formatCurrency(5, "USD", "en-US");
    expect(out).toBe("$5.00");
  });
});

describe("formatDate", () => {
  it("formats a date string in the given locale and timezone", () => {
    expect(formatDate("2026-03-01", "en-GB", "Europe/London")).toBe("01/03/2026");
  });

  it("accepts a Date object and custom options", () => {
    const out = formatDate(new Date("2026-03-01T00:00:00Z"), "en-US", "UTC", {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
    expect(out).toBe("Mar 1, 2026");
  });
});
