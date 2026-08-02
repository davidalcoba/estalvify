import "server-only";
import { cache } from "react";
import { prisma } from "@/lib/prisma";

export interface UserPrefs {
  /** Number format (decimal/thousands separators) for formatCurrency. */
  locale: string;
  /** Language used for date rendering (formatDate), decoupled from number format. */
  language: string;
  currency: string;
  timezone: string;
}

const DEFAULTS: UserPrefs = {
  locale: "es-ES",
  language: "en-GB",
  currency: "EUR",
  timezone: "Europe/Madrid",
};

/**
 * Fetches the current user's regional preferences.
 * Wrapped in React `cache()` so it deduplicates within a single request.
 */
export const getUserPrefs = cache(async (userId: string): Promise<UserPrefs> => {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { locale: true, language: true, currency: true, timezone: true },
  });

  return {
    locale: user?.locale ?? DEFAULTS.locale,
    language: user?.language ?? DEFAULTS.language,
    currency: user?.currency ?? DEFAULTS.currency,
    timezone: user?.timezone ?? DEFAULTS.timezone,
  };
});
