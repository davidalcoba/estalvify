// Server-side entry point: `const t = await getT()` in any server component,
// server action, route handler or `generateMetadata`.
//
// The locale comes from the SIGNED-IN member's `language`, not the household
// owner's — it is a personal preference, exactly like the date and number
// formats it already drives (lib/user-prefs.ts). Deliberately resolved from
// the session rather than from `getScope()`, so the auth and legal routes —
// which have no household scope, and where `getScope()` would redirect — can
// use the same call.
//
// Wrapped in React `cache()`, so layout + page + every nested component in one
// request share a single lookup.

import "server-only";
import { cache } from "react";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { dictionaries } from "./dictionaries";
import { DEFAULT_UI_LOCALE, resolveUiLocale, type UiLocale } from "./locales";
import { createTranslator, type Translator } from "./translate";

export const getUiLocale = cache(async (): Promise<UiLocale> => {
  // Never throws. This runs in the ROOT layout, so a database hiccup here
  // would take down /login, /offline and the legal pages — the exact screens
  // that have to keep working when the rest does not. An English shell is a
  // far better failure than no shell.
  try {
    const session = await auth();
    const userId = session?.user?.id;
    if (!userId) return DEFAULT_UI_LOCALE;

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { language: true },
    });

    return resolveUiLocale(user?.language);
  } catch {
    return DEFAULT_UI_LOCALE;
  }
});

export const getT = cache(async (): Promise<Translator> => {
  const locale = await getUiLocale();
  return createTranslator(locale, dictionaries[locale]);
});

/** The messages to hand to the client provider for a given locale. */
export function messagesFor(locale: UiLocale): Record<string, string> {
  return dictionaries[locale];
}

/**
 * A translator for a user who is NOT the request's actor — the household
 * owner when generating notifications from the cron, for instance. Takes the
 * raw `language` value so callers that already loaded the row do not query
 * again.
 */
export function translatorForLanguage(language: string | null | undefined): Translator {
  const locale = resolveUiLocale(language);
  return createTranslator(locale, dictionaries[locale]);
}
