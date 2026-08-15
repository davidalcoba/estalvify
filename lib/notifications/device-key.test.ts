import { describe, it, expect } from "vitest";
import { deviceKey } from "./device-key";

// The two strings this whole helper exists for: one iPhone, two push
// subscriptions six days apart, Safari updated in between. Matching user agents
// verbatim left the abandoned row behind and the test send kept reporting two
// devices for one phone.
const IPHONE_BEFORE_UPDATE =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 18_7 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.5.2 Mobile/15E148 Safari/604.1";
const IPHONE_AFTER_UPDATE =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 18_7 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.6 Mobile/15E148 Safari/604.1";
const IPHONE_AFTER_IOS_UPDATE =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 19_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.6 Mobile/15E148 Safari/604.1";
const IPAD =
  "Mozilla/5.0 (iPad; CPU OS 18_7 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.6 Mobile/15E148 Safari/604.1";
const MAC =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36";

describe("deviceKey", () => {
  it("survives a browser update on the same phone", () => {
    expect(deviceKey(IPHONE_AFTER_UPDATE)).toBe(deviceKey(IPHONE_BEFORE_UPDATE));
  });

  it("survives an OS update on the same phone", () => {
    expect(deviceKey(IPHONE_AFTER_IOS_UPDATE)).toBe(
      deviceKey(IPHONE_BEFORE_UPDATE),
    );
  });

  it("keeps different devices apart", () => {
    const keys = [IPHONE_AFTER_UPDATE, IPAD, MAC].map(deviceKey);
    expect(new Set(keys).size).toBe(3);
  });

  it("is empty for an absent user agent, so nothing matches it", () => {
    expect(deviceKey("")).toBe("");
  });
});
