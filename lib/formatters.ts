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

/** Whole-euro variant for dense lists — decimals are noise at a glance. */
export function formatCurrencyRound(
  amount: number | string | { toString(): string },
  currency: string,
  locale: string
): string {
  return Number(amount).toLocaleString(locale, {
    style: "currency",
    currency,
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  });
}

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
