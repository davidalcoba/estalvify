import { describe, expect, it } from "vitest";
import { isEmailAllowed, parseAllowedEmails } from "./allowed-emails";

describe("isEmailAllowed", () => {
  describe("an empty allowlist is open", () => {
    it("accepts anyone when unset, empty, or only separators", () => {
      for (const raw of [undefined, null, "", "   ", ",", " , ,"]) {
        expect(isEmailAllowed("anyone@anywhere.com", raw)).toBe(true);
      }
    });
  });

  describe("exact addresses", () => {
    it("accepts the listed address and rejects others", () => {
      const list = "david@example.com";
      expect(isEmailAllowed("david@example.com", list)).toBe(true);
      expect(isEmailAllowed("someone@example.com", list)).toBe(false);
      expect(isEmailAllowed("david@other.com", list)).toBe(false);
    });

    it("ignores case and surrounding whitespace on both sides", () => {
      const list = "  David@Example.COM , second@example.com ";
      expect(isEmailAllowed("DAVID@EXAMPLE.com", list)).toBe(true);
      expect(isEmailAllowed("  second@example.com  ", list)).toBe(true);
    });

    it("accepts any of several entries", () => {
      const list = "a@x.com,b@y.com,c@z.com";
      expect(isEmailAllowed("b@y.com", list)).toBe(true);
      expect(isEmailAllowed("d@x.com", list)).toBe(false);
    });
  });

  describe("whole domains", () => {
    it("treats a bare domain, @domain and *@domain identically", () => {
      for (const list of ["example.com", "@example.com", "*@example.com"]) {
        expect(isEmailAllowed("anyone@example.com", list)).toBe(true);
        expect(isEmailAllowed("someone.else@example.com", list)).toBe(true);
        expect(isEmailAllowed("anyone@other.com", list)).toBe(false);
      }
    });

    it("does not match a domain that merely ends with the entry", () => {
      // The bug this guards: a naive endsWith would let notexample.com through.
      expect(isEmailAllowed("attacker@notexample.com", "example.com")).toBe(false);
      expect(isEmailAllowed("attacker@example.com.evil.net", "example.com")).toBe(false);
    });

    it("does not accept a subdomain for a plain domain entry", () => {
      expect(isEmailAllowed("someone@mail.example.com", "example.com")).toBe(false);
    });
  });

  describe("subdomain wildcards", () => {
    it("accepts subdomains, one level or more", () => {
      for (const list of ["*.example.com", "@*.example.com", "*@*.example.com"]) {
        expect(isEmailAllowed("someone@mail.example.com", list)).toBe(true);
        expect(isEmailAllowed("someone@a.b.example.com", list)).toBe(true);
        expect(isEmailAllowed("someone@other.com", list)).toBe(false);
      }
    });

    it("does NOT accept the apex — list it separately", () => {
      expect(isEmailAllowed("someone@example.com", "*.example.com")).toBe(false);
      expect(isEmailAllowed("someone@example.com", "*.example.com,example.com")).toBe(true);
    });

    it("does not match a lookalike parent domain", () => {
      expect(isEmailAllowed("someone@mail.notexample.com", "*.example.com")).toBe(false);
    });
  });

  describe("catch-all", () => {
    it("accepts everyone with a bare *", () => {
      expect(isEmailAllowed("anyone@anywhere.com", "*")).toBe(true);
    });

    it("accepts any domain with *@*", () => {
      expect(isEmailAllowed("anyone@anywhere.com", "*@*")).toBe(true);
    });

    it("still requires a usable address", () => {
      expect(isEmailAllowed("not-an-email", "*")).toBe(false);
      expect(isEmailAllowed("", "*")).toBe(false);
      expect(isEmailAllowed(null, "*")).toBe(false);
    });

    it("pins one local part across every domain", () => {
      const list = "postmaster@*";
      expect(isEmailAllowed("postmaster@anywhere.com", list)).toBe(true);
      expect(isEmailAllowed("someone@anywhere.com", list)).toBe(false);
    });
  });

  describe("malformed input", () => {
    it("rejects addresses that are not addresses", () => {
      const list = "example.com";
      for (const email of ["", "  ", "nope", "@example.com", "a@", "a@b@example.com"]) {
        expect(isEmailAllowed(email, list)).toBe(false);
      }
    });

    it("rejects a domain with a leading or trailing dot", () => {
      expect(isEmailAllowed("a@.example.com", "example.com")).toBe(false);
      expect(isEmailAllowed("a@example.com.", "example.com")).toBe(false);
    });

    it("drops malformed entries instead of treating them as catch-alls", () => {
      // "@" and "user@" carry no domain; if either were read as "anything goes"
      // a typo in the env var would silently open sign-in to the world.
      expect(isEmailAllowed("anyone@anywhere.com", "@,david@example.com")).toBe(false);
      expect(isEmailAllowed("anyone@anywhere.com", "user@,david@example.com")).toBe(false);
      expect(isEmailAllowed("david@example.com", "@,david@example.com")).toBe(true);
    });

    it("does not let a multi-@ entry act as a domain entry", () => {
      expect(isEmailAllowed("anyone@example.com", "a@b@example.com")).toBe(false);
    });
  });
});

describe("parseAllowedEmails", () => {
  it("keeps only usable entries", () => {
    expect(parseAllowedEmails("a@x.com, , @y.com, @, bad@, *.z.com")).toHaveLength(4);
  });

  it("returns nothing for an absent list", () => {
    expect(parseAllowedEmails(undefined)).toEqual([]);
    expect(parseAllowedEmails("")).toEqual([]);
  });
});
