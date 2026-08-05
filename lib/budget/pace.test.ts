import { describe, it, expect } from "vitest";
import { chargeTone, incomeTone } from "./pace";

describe("chargeTone", () => {
  it("success on pace or better, with slack", () => {
    expect(chargeTone(200, 1300, 16)).toBe("success"); // 15% vs 16% elapsed
    expect(chargeTone(0, 1300, 16)).toBe("success");
    // 1 point ahead stays green thanks to the slack
    expect(chargeTone(273, 1300, 16)).toBe("success"); // 21% vs 16+5
  });

  it("warning when ahead of the month beyond the slack", () => {
    expect(chargeTone(400, 1300, 16)).toBe("warning"); // 31% vs 21%
  });

  it("destructive over the objective, regardless of the day", () => {
    expect(chargeTone(1400, 1300, 99)).toBe("destructive");
    // spending against a 0 objective is over by definition
    expect(chargeTone(50, 0, 16)).toBe("destructive");
  });

  it("late in the month, high consumption within objective is fine", () => {
    expect(chargeTone(1200, 1300, 95)).toBe("success"); // 92% vs 95%
  });
});

describe("incomeTone", () => {
  it("neutral while arriving — salaries land when they land", () => {
    expect(incomeTone(0, 8262, 0.16)).toBe("neutral");
    expect(incomeTone(2253, 8262, 0.9)).toBe("neutral");
  });

  it("success when complete", () => {
    expect(incomeTone(8262, 8262, 0.16)).toBe("success");
    expect(incomeTone(8300, 8262, 0.16)).toBe("success");
  });

  it("warning only when the month closed short", () => {
    expect(incomeTone(6009, 8262, 1)).toBe("warning");
  });

  it("nothing expected → neutral", () => {
    expect(incomeTone(0, 0, 1)).toBe("neutral");
  });
});
