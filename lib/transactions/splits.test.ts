import { describe, it, expect } from "vitest";
import { validateSplitLines, splitRemainder, MAX_SPLIT_LINES } from "./splits";

describe("validateSplitLines", () => {
  it("accepts lines that reconstruct the amount exactly", () => {
    expect(
      validateSplitLines(380, [
        { amount: 120.5, categoryId: "food" },
        { amount: 259.5, categoryId: null },
      ])
    ).toBeNull();
  });

  it("works against a negative parent amount (DEBIT stored signed)", () => {
    expect(
      validateSplitLines(-100, [
        { amount: 60, categoryId: "a" },
        { amount: 40, categoryId: null },
      ])
    ).toBeNull();
  });

  it("rejects a sum that misses by a cent", () => {
    expect(
      validateSplitLines(100, [
        { amount: 60, categoryId: "a" },
        { amount: 39.99, categoryId: null },
      ])
    ).toMatch(/add up/);
  });

  it("rejects fewer than 2 lines", () => {
    expect(validateSplitLines(100, [{ amount: 100, categoryId: "a" }])).toMatch(
      /at least 2/
    );
  });

  it("rejects non-positive line amounts", () => {
    expect(
      validateSplitLines(100, [
        { amount: 0, categoryId: "a" },
        { amount: 100, categoryId: null },
      ])
    ).toMatch(/positive/);
  });

  it("survives floating-point line sums (0.1+0.2 style)", () => {
    expect(
      validateSplitLines(0.3, [
        { amount: 0.1, categoryId: "a" },
        { amount: 0.2, categoryId: null },
      ])
    ).toBeNull();
  });

  it("caps the number of lines", () => {
    const lines = Array.from({ length: MAX_SPLIT_LINES + 1 }, () => ({
      amount: 1,
      categoryId: null,
    }));
    expect(validateSplitLines(MAX_SPLIT_LINES + 1, lines)).toMatch(/At most/);
  });
});

describe("splitRemainder", () => {
  it("tracks what is left to allocate", () => {
    expect(splitRemainder(380, [{ amount: 120.5, categoryId: null }])).toBe(259.5);
  });

  it("goes negative when over-allocated", () => {
    expect(splitRemainder(100, [{ amount: 130, categoryId: null }])).toBe(-30);
  });
});
