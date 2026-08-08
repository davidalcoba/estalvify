"use client";

// Client-side translations. Mounted once per layout by a server component,
// which passes the ACTIVE locale's messages down as a prop — the dictionaries
// themselves are never imported from client code, so a Catalan session does
// not also download the English and Spanish strings.
//
// Usage in a client component:
//
//   const t = useT();
//   <Button>{t("common.save")}</Button>
//
// `useT` throws outside the provider rather than falling back to English: a
// silently-untranslated subtree is much harder to notice than a crash in dev.

import { createContext, useContext, useMemo } from "react";
import { createTranslator, type Translator } from "@/lib/i18n/translate";
import type { UiLocale } from "@/lib/i18n/locales";

interface I18nValue {
  locale: UiLocale;
  messages: Record<string, string>;
}

const I18nContext = createContext<I18nValue | null>(null);

export function I18nProvider({
  locale,
  messages,
  children,
}: I18nValue & { children: React.ReactNode }) {
  // The identity has to be stable or every consumer re-renders on each parent
  // render; `messages` is a fresh object per RSC payload, so key the memo on
  // the locale plus the object identity we were actually given.
  const value = useMemo(() => ({ locale, messages }), [locale, messages]);
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useT(): Translator {
  const ctx = useContext(I18nContext);
  if (!ctx) {
    throw new Error("useT must be used inside <I18nProvider>");
  }
  return useMemo(
    () => createTranslator(ctx.locale, ctx.messages),
    [ctx.locale, ctx.messages],
  );
}

/** The active UI locale, for the rare component that branches on it. */
export function useUiLocale(): UiLocale {
  const ctx = useContext(I18nContext);
  if (!ctx) {
    throw new Error("useUiLocale must be used inside <I18nProvider>");
  }
  return ctx.locale;
}
