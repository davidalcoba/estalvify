import { describe, it, expect } from "vitest";
import { wouldCreateCycle, depthOf, hasChildren } from "./hierarchy";

// transport
//   └── car-insurance
// insurance
//   ├── home-insurance
//   └── life-insurance
const tree = new Map<string, string | null>([
  ["transport", null],
  ["car-insurance", "transport"],
  ["insurance", null],
  ["home-insurance", "insurance"],
  ["life-insurance", "insurance"],
]);

describe("wouldCreateCycle", () => {
  it("allows the real move: a leaf to another top-level parent", () => {
    expect(wouldCreateCycle("car-insurance", "insurance", tree)).toBe(false);
  });

  it("allows moving to the root", () => {
    expect(wouldCreateCycle("car-insurance", null, tree)).toBe(false);
  });

  it("rejects moving a category under itself", () => {
    expect(wouldCreateCycle("insurance", "insurance", tree)).toBe(true);
  });

  it("rejects moving a parent under its own child", () => {
    expect(wouldCreateCycle("insurance", "home-insurance", tree)).toBe(true);
  });

  it("rejects moving under a deeper descendant", () => {
    const deep = new Map<string, string | null>([
      ["a", null],
      ["b", "a"],
      ["c", "b"],
      ["d", "c"],
    ]);
    expect(wouldCreateCycle("a", "d", deep)).toBe(true);
    expect(wouldCreateCycle("d", "a", deep)).toBe(false);
  });

  it("allows moving between siblings", () => {
    expect(wouldCreateCycle("home-insurance", "transport", tree)).toBe(false);
  });

  it("terminates on data that already contains a cycle", () => {
    const broken = new Map<string, string | null>([
      ["x", "y"],
      ["y", "x"],
      ["z", null],
    ]);
    expect(() => wouldCreateCycle("z", "x", broken)).not.toThrow();
    expect(wouldCreateCycle("z", "x", broken)).toBe(false);
  });
});

describe("depthOf", () => {
  it("is 0 at the root and 1 for a child", () => {
    expect(depthOf("insurance", tree)).toBe(0);
    expect(depthOf("home-insurance", tree)).toBe(1);
  });

  it("treats an unknown id as a root", () => {
    expect(depthOf("nope", tree)).toBe(0);
  });
});

describe("hasChildren", () => {
  it("distinguishes a parent from a leaf", () => {
    expect(hasChildren("insurance", tree)).toBe(true);
    expect(hasChildren("car-insurance", tree)).toBe(false);
  });
});
