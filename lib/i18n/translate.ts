// The translator itself: pure, dictionary-agnostic, no imports of the
// dictionaries. That separation is what keeps the client bundle honest — the
// provider receives ONE locale's messages as a prop, so a Catalan session
// never ships the Spanish and English strings as well.

import type { MessageKey, PluralBase } from "./dictionaries/en";
import type { UiLocale } from "./locales";

export type MessageVars = Record<string, string | number>;

export interface Translator {
  /** Look up a message, substituting `{name}` placeholders. */
  (key: MessageKey, vars?: MessageVars): string;
  /**
   * Count-aware lookup: reads `<base>.one` or `<base>.other` and exposes the
   * count as `{count}`. English, Spanish and Catalan share the same one/other
   * split, so a two-form rule is the whole of it.
   */
  plural(base: PluralBase, count: number, vars?: MessageVars): string;
  locale: UiLocale;
}

const PLACEHOLDER = /\{(\w+)\}/g;

export function interpolate(template: string, vars?: MessageVars): string {
  if (!vars) return template;
  return template.replace(PLACEHOLDER, (match, name: string) =>
    name in vars ? String(vars[name]) : match,
  );
}

/**
 * Builds a translator over an already-resolved message map.
 *
 * A missing key returns the key itself rather than an empty string: a visible
 * `plan.title` in the UI is a bug report, a blank heading is a mystery. The
 * dictionaries are typed so this cannot happen at compile time; it only
 * guards a stale payload reaching a cached client bundle.
 */
export function createTranslator(
  locale: UiLocale,
  messages: Readonly<Record<string, string>>,
): Translator {
  const t = ((key: MessageKey, vars?: MessageVars) => {
    const template = messages[key];
    return template === undefined ? key : interpolate(template, vars);
  }) as Translator;

  t.plural = (base: PluralBase, count: number, vars?: MessageVars) => {
    const key = `${base}.${count === 1 ? "one" : "other"}`;
    const template = messages[key];
    return template === undefined
      ? key
      : interpolate(template, { count, ...vars });
  };

  t.locale = locale;

  return t;
}
