import { describe, it, expect } from "vitest";
import {
  PULL_MAX,
  PULL_THRESHOLD,
  pullDistance,
  pullProgress,
} from "./pull-to-refresh";

describe("pullDistance", () => {
  it("stays at rest for a finger that has not moved down", () => {
    expect(pullDistance(0)).toBe(0);
    expect(pullDistance(-40)).toBe(0);
    expect(pullDistance(NaN)).toBe(0);
  });

  it("grows with the pull but never past the ceiling", () => {
    const samples = [10, 40, 90, 200, 600, 5000].map((d) => pullDistance(d));
    for (let i = 1; i < samples.length; i++) {
      expect(samples[i]).toBeGreaterThan(samples[i - 1]);
    }
    // Even a pull the length of the screen stops at the ceiling.
    expect(pullDistance(600)).toBeLessThan(PULL_MAX);
    expect(samples.at(-1)).toBeLessThanOrEqual(PULL_MAX);
  });

  it("resists: the sheet always trails the finger", () => {
    for (const delta of [20, 60, 120, 300]) {
      expect(pullDistance(delta)).toBeLessThan(delta);
    }
  });

  it("needs a deliberate pull to arm — more travel than the threshold itself", () => {
    expect(pullDistance(PULL_THRESHOLD)).toBeLessThan(PULL_THRESHOLD);
    expect(pullDistance(80)).toBeLessThan(PULL_THRESHOLD);
    // ~92px of finger for a 64px sheet (plus the slop the hook takes off
    // first): long enough not to fire by accident, short enough for one thumb.
    expect(pullDistance(92)).toBeGreaterThanOrEqual(PULL_THRESHOLD);
  });

  it("honours a custom ceiling", () => {
    expect(pullDistance(1000, 40)).toBeLessThan(40);
    expect(pullDistance(1000, 40)).toBeGreaterThan(39);
  });
});

describe("pullProgress", () => {
  it("runs 0 → 1 over the threshold and clamps there", () => {
    expect(pullProgress(0)).toBe(0);
    expect(pullProgress(-10)).toBe(0);
    expect(pullProgress(PULL_THRESHOLD / 2)).toBeCloseTo(0.5);
    expect(pullProgress(PULL_THRESHOLD)).toBe(1);
    expect(pullProgress(PULL_MAX)).toBe(1);
  });
});
