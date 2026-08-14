import { describe, it, expect } from "vitest";
import { greetingBand, hourInTimezone } from "./greeting";

describe("greetingBand", () => {
  it("16:03 is the afternoon — the case that started this", () => {
    expect(greetingBand(16)).toBe("afternoon");
  });

  it("boundaries: 06, 14 and 21 open their band", () => {
    expect(greetingBand(5)).toBe("evening");
    expect(greetingBand(6)).toBe("morning");
    expect(greetingBand(13)).toBe("morning");
    expect(greetingBand(14)).toBe("afternoon");
    expect(greetingBand(20)).toBe("afternoon");
    expect(greetingBand(21)).toBe("evening");
  });

  it("the small hours are 'evening', not 'morning'", () => {
    expect(greetingBand(0)).toBe("evening");
    expect(greetingBand(3)).toBe("evening");
  });

  it("covers all 24 hours", () => {
    for (let h = 0; h < 24; h++) {
      expect(["morning", "afternoon", "evening"]).toContain(greetingBand(h));
    }
  });
});

describe("hourInTimezone", () => {
  it("reads the member's clock, not the server's", () => {
    const noonUtc = new Date("2026-08-14T12:00:00Z");
    expect(hourInTimezone("UTC", noonUtc)).toBe(12);
    expect(hourInTimezone("Europe/Madrid", noonUtc)).toBe(14); // CEST, UTC+2
    expect(hourInTimezone("America/New_York", noonUtc)).toBe(8); // EDT, UTC−4
  });

  it("midnight is 0, never 24", () => {
    expect(hourInTimezone("UTC", new Date("2026-08-14T00:00:00Z"))).toBe(0);
  });

  it("the same instant greets two members differently", () => {
    const instant = new Date("2026-08-14T14:03:00Z"); // 16:03 in Madrid
    expect(greetingBand(hourInTimezone("Europe/Madrid", instant))).toBe("afternoon");
    expect(greetingBand(hourInTimezone("America/Los_Angeles", instant))).toBe("morning");
  });
});
