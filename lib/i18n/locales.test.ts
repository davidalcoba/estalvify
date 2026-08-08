import { describe, it, expect } from "vitest";
import { resolveUiLocale, UI_LOCALES, DEFAULT_UI_LOCALE } from "./locales";
import { createTranslator, interpolate } from "./translate";
import { dictionaries } from "./dictionaries";
import { en } from "./dictionaries/en";

describe("resolveUiLocale", () => {
  it("maps a regional tag onto its language", () => {
    expect(resolveUiLocale("es-ES")).toBe("es");
    expect(resolveUiLocale("ca-ES")).toBe("ca");
    expect(resolveUiLocale("en-GB")).toBe("en");
  });

  it("accepts a bare language tag and odd casing/separators", () => {
    expect(resolveUiLocale("ca")).toBe("ca");
    expect(resolveUiLocale("ES-es")).toBe("es");
    expect(resolveUiLocale("ca_ES")).toBe("ca");
    expect(resolveUiLocale("  es-MX ")).toBe("es");
  });

  // The whole point of falling back rather than throwing: `language` also
  // drives date rendering and already holds tags we do not translate.
  it("falls back to English for an untranslated or missing language", () => {
    expect(resolveUiLocale("fr-FR")).toBe(DEFAULT_UI_LOCALE);
    expect(resolveUiLocale("")).toBe(DEFAULT_UI_LOCALE);
    expect(resolveUiLocale(null)).toBe(DEFAULT_UI_LOCALE);
    expect(resolveUiLocale(undefined)).toBe(DEFAULT_UI_LOCALE);
  });

  // The default `User.language` is en-GB, so nobody's app silently changes
  // language when this ships.
  it("leaves the schema default on English", () => {
    expect(resolveUiLocale("en-GB")).toBe("en");
  });
});

describe("interpolate", () => {
  it("substitutes named placeholders", () => {
    expect(interpolate("Hi {name}, {n} left", { name: "Ada", n: 3 })).toBe(
      "Hi Ada, 3 left",
    );
  });

  it("leaves an unknown placeholder untouched instead of blanking it", () => {
    expect(interpolate("Hi {name}", {})).toBe("Hi {name}");
  });
});

describe("createTranslator", () => {
  const t = createTranslator("en", { greet: "Hello {name}" });

  it("returns the key when the message is missing", () => {
    expect(t("nope" as never)).toBe("nope");
  });

  it("interpolates", () => {
    expect(t("greet" as never, { name: "Ada" })).toBe("Hello Ada");
  });

  it("picks the plural form and supplies {count}", () => {
    const p = createTranslator("en", {
      "x.one": "{count} item",
      "x.other": "{count} items",
    });
    expect(p.plural("x" as never, 1)).toBe("1 item");
    expect(p.plural("x" as never, 5)).toBe("5 items");
    expect(p.plural("x" as never, 0)).toBe("0 items");
  });
});

describe("dictionaries", () => {
  const keys = Object.keys(en);

  it("covers every UI locale", () => {
    expect(Object.keys(dictionaries).sort()).toEqual([...UI_LOCALES].sort());
  });

  // tsc already guarantees the keys match; this catches the other half —
  // a key present but left as an empty string, or accidentally duplicated.
  it.each(UI_LOCALES)("%s has a non-empty string for every key", (locale) => {
    const dict = dictionaries[locale] as Record<string, string>;
    const missing = keys.filter((k) => !dict[k]?.trim());
    expect(missing).toEqual([]);
  });

  // A placeholder dropped in translation is a silently broken sentence
  // ("Reconnect before ." instead of a date), which no type can catch.
  it.each(UI_LOCALES)("%s keeps every placeholder from the source", (locale) => {
    const dict = dictionaries[locale] as Record<string, string>;
    const source = en as Record<string, string>;
    const placeholders = (s: string) => (s.match(/\{(\w+)\}/g) ?? []).sort();

    const broken = keys.filter(
      (k) =>
        placeholders(dict[k]).join() !== placeholders(source[k]).join(),
    );
    expect(broken).toEqual([]);
  });

  // Every `<base>.one` needs its `<base>.other`, or t.plural() renders a key.
  it.each(UI_LOCALES)("%s pairs every plural form", (locale) => {
    const dict = dictionaries[locale] as Record<string, string>;
    const unpaired = Object.keys(dict)
      .filter((k) => k.endsWith(".one"))
      .filter((k) => !dict[`${k.slice(0, -4)}.other`]);
    expect(unpaired).toEqual([]);
  });
});
