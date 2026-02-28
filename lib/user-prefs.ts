import { cache } from "react";
import { prisma } from "@/lib/prisma";

export interface UserPrefs {
  locale: string;
  currency: string;
  timezone: string;
}

const DEFAULTS: UserPrefs = {
  locale: "es-ES",
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
    select: { locale: true, currency: true, timezone: true },
  });

  return {
    locale: user?.locale ?? DEFAULTS.locale,
    currency: user?.currency ?? DEFAULTS.currency,
    timezone: user?.timezone ?? DEFAULTS.timezone,
  };
});

/** Format a currency amount using the user's locale. */
export function formatCurrency(
  amount: number | string | { toString(): string },
  currency: string,
  locale: string
): string {
  return Number(amount).toLocaleString(locale, {
    style: "currency",
    currency,
  });
}

/** Format a date using the user's locale and timezone. */
export function formatDate(
  date: Date | string,
  locale: string,
  timezone: string,
  options?: Intl.DateTimeFormatOptions
): string {
  return new Date(date).toLocaleDateString(locale, {
    timeZone: timezone,
    ...options,
  });
}
