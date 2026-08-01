import { describe, it, expect } from "vitest";
import { parseRecommendations } from "./parse";

describe("parseRecommendations", () => {
  it("parses a valid response", () => {
    const json = JSON.stringify({
      recommendations: [
        { title: "Cut dining", body: "You spent a lot on food.", category: "Food", severity: "warning" },
        { title: "Nice savings", body: "Keep it up.", severity: "info" },
      ],
    });
    const recs = parseRecommendations(json);
    expect(recs).toHaveLength(2);
    expect(recs[0]).toMatchObject({ title: "Cut dining", category: "Food", severity: "warning" });
    expect(recs[1].category).toBeUndefined();
  });

  it("coerces an unknown severity to info", () => {
    const json = JSON.stringify({
      recommendations: [{ title: "x", body: "y", severity: "critical" }],
    });
    expect(parseRecommendations(json)[0].severity).toBe("info");
  });

  it("caps the number of recommendations", () => {
    const json = JSON.stringify({
      recommendations: Array.from({ length: 10 }, (_, i) => ({
        title: `t${i}`,
        body: "b",
        severity: "info",
      })),
    });
    expect(parseRecommendations(json).length).toBe(6);
  });

  it("throws on invalid JSON", () => {
    expect(() => parseRecommendations("not json")).toThrow();
  });

  it("throws when the shape is wrong", () => {
    expect(() => parseRecommendations(JSON.stringify({ foo: 1 }))).toThrow();
  });
});
