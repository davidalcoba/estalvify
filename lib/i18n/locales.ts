// The set of languages the INTERFACE is translated into, and the pure mapping
// from the user's `language` preference onto one of them.
//
// There is deliberately no second "app language" column. `User.language`
// already exists as a personal preference (it drives date rendering — see
// lib/user-prefs.ts) and a member who reads dates in Catalan wants the app in
// Catalan; splitting them would give Settings two selects both labelled
// "Language". So `language` is THE language setting, and this module decides
// which translation it resolves to.
//
// A tag we do not translate (fr-FR, de-DE, …) resolves to English rather than
// failing: dates still render in that language, the chrome falls back. That is
// also what keeps this change backwards compatible — the default `en-GB` maps
// to `en`, so nobody's app changes language without asking.

export const UI_LOCALES = ["en", "es", "ca"] as const;

export type UiLocale = (typeof UI_LOCALES)[number];

export const DEFAULT_UI_LOCALE: UiLocale = "en";

function isUiLocale(value: string): value is UiLocale {
  return (UI_LOCALES as readonly string[]).includes(value);
}

/**
 * Maps a BCP-47 language tag (`User.language`) onto a translated UI locale.
 *
 * Only the primary subtag matters: `es-ES`, `es-MX` and `es` are all Spanish.
 * Anything unknown, empty or malformed falls back to English.
 */
export function resolveUiLocale(language: string | null | undefined): UiLocale {
  if (!language) return DEFAULT_UI_LOCALE;
  const primary = language.trim().toLowerCase().split(/[-_]/)[0];
  return isUiLocale(primary) ? primary : DEFAULT_UI_LOCALE;
}

/**
 * The language tag to hand to `Intl` when only the UI locale is known (push
 * payloads, `<html lang>`). Regional preferences own the real tag; this is the
 * sensible default for each translation.
 */
export const UI_LOCALE_TAGS: Record<UiLocale, string> = {
  en: "en-GB",
  es: "es-ES",
  ca: "ca-ES",
};
