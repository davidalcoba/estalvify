import { describe, expect, it } from "vitest";
import { isCompleteOrder, isSameOrder, moveItem } from "./rule-order";

describe("moveItem", () => {
  it("moves an item down, shifting the ones it passes", () => {
    expect(moveItem(["a", "b", "c", "d"], 0, 2)).toEqual(["b", "c", "a", "d"]);
  });

  it("moves an item up", () => {
    expect(moveItem(["a", "b", "c", "d"], 3, 1)).toEqual(["a", "d", "b", "c"]);
  });

  it("returns a copy for a no-op move", () => {
    const items = ["a", "b"];
    const next = moveItem(items, 1, 1);
    expect(next).toEqual(items);
    expect(next).not.toBe(items);
  });

  it("ignores out-of-range indices rather than dropping items", () => {
    expect(moveItem(["a", "b"], 0, 5)).toEqual(["a", "b"]);
    expect(moveItem(["a", "b"], -1, 0)).toEqual(["a", "b"]);
  });
});

describe("isSameOrder", () => {
  it("compares by position, not by set", () => {
    expect(isSameOrder(["a", "b"], ["a", "b"])).toBe(true);
    expect(isSameOrder(["a", "b"], ["b", "a"])).toBe(false);
    expect(isSameOrder(["a"], ["a", "b"])).toBe(false);
  });
});

describe("isCompleteOrder", () => {
  it("accepts any permutation of exactly the owned rules", () => {
    expect(isCompleteOrder(["c", "a", "b"], ["a", "b", "c"])).toBe(true);
  });

  it("rejects a missing, unknown or duplicated rule", () => {
    expect(isCompleteOrder(["a", "b"], ["a", "b", "c"])).toBe(false);
    expect(isCompleteOrder(["a", "b", "x"], ["a", "b", "c"])).toBe(false);
    expect(isCompleteOrder(["a", "a", "b"], ["a", "b", "c"])).toBe(false);
  });

  it("accepts an empty order for a user with no rules", () => {
    expect(isCompleteOrder([], [])).toBe(true);
  });
});
