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
