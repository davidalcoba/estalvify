import { describe, it, expect } from "vitest";
import {
  upcomingRecurringNotifications,
  consentExpiringNotifications,
  staleTransactionNotifications,
  isoYearWeek,
} from "./generators";

describe("upcomingRecurringNotifications", () => {
  const series = [
    {
      merchantKey: "NETFLIX",
      displayName: "Netflix",
      direction: "DEBIT" as const,
      averageAmount: 13.99,
      nextExpectedDate: "2026-08-05",
    },
  ];

  it("alerts when a charge is within the horizon", () => {
    const specs = upcomingRecurringNotifications(series, "2026-08-02", "EUR", "en-US", 5);
    expect(specs).toHaveLength(1);
    expect(specs[0]).toMatchObject({
      type: "RECURRING_UPCOMING",
      dedupeKey: "recurring-due:NETFLIX:2026-08-05",
    });
    expect(specs[0].body).toContain("in 3 days");
  });

  it("says 'today' / 'tomorrow' at the boundaries", () => {
    expect(
      upcomingRecurringNotifications(series, "2026-08-05", "EUR", "en-US")[0].body
    ).toContain("today");
    expect(
      upcomingRecurringNotifications(series, "2026-08-04", "EUR", "en-US")[0].body
    ).toContain("tomorrow");
  });

  it("skips charges outside the horizon or already past", () => {
    expect(upcomingRecurringNotifications(series, "2026-07-01", "EUR", "en-US", 5)).toEqual([]);
    expect(upcomingRecurringNotifications(series, "2026-08-10", "EUR", "en-US", 5)).toEqual([]);
  });

  it("skips series without a next expected date", () => {
    const noDate = [{ ...series[0], nextExpectedDate: null }];
    expect(upcomingRecurringNotifications(noDate, "2026-08-02", "EUR", "en-US")).toEqual([]);
  });
});

describe("consentExpiringNotifications", () => {
  const conn = [
    { connectionId: "c1", bankName: "BBVA", consentExpiresAt: "2026-08-09" },
  ];

  it("warns at the 14/7/3-day steps with rising severity", () => {
    const at = (today: string) => consentExpiringNotifications(conn, today, "en-GB")[0];

    expect(at("2026-07-27")).toMatchObject({
      type: "CONSENT_EXPIRING",
      severity: "INFO",
      dedupeKey: "consent-expiring:c1:14",
    });
    expect(at("2026-08-03")).toMatchObject({
      severity: "WARNING",
      dedupeKey: "consent-expiring:c1:7",
    });
    expect(at("2026-08-07")).toMatchObject({
      severity: "ALERT",
      dedupeKey: "consent-expiring:c1:3",
    });
  });

  it("stays quiet before the first step", () => {
    expect(consentExpiringNotifications(conn, "2026-07-25", "en-GB")).toEqual([]);
  });

  it("fires once per step, so a whole week shares one key", () => {
    const keys = ["2026-08-03", "2026-08-04", "2026-08-05"].map(
      (d) => consentExpiringNotifications(conn, d, "en-GB")[0].dedupeKey
    );
    expect(new Set(keys).size).toBe(1);
  });

  it("leaves an already-lapsed consent to the stale-transaction alert", () => {
    expect(consentExpiringNotifications(conn, "2026-08-10", "en-GB")).toEqual([]);
  });

  it("skips a connection with no known expiry", () => {
    const unknown = [{ ...conn[0], consentExpiresAt: null }];
    expect(consentExpiringNotifications(unknown, "2026-08-02", "en-GB")).toEqual([]);
  });
});

describe("staleTransactionNotifications", () => {
  const account = (lastTransactionDate: string | null) => [
    { accountId: "a1", accountName: "Despeses", lastTransactionDate },
  ];

  it("alerts once the newest transaction is past the threshold", () => {
    const specs = staleTransactionNotifications(account("2026-07-30"), "2026-08-02");
    expect(specs).toHaveLength(1);
    expect(specs[0]).toMatchObject({ type: "NO_TRANSACTIONS", severity: "WARNING" });
    expect(specs[0].body).toContain("3 days old");
  });

  it("stays quiet one day short of the threshold", () => {
    expect(staleTransactionNotifications(account("2026-07-31"), "2026-08-02")).toEqual([]);
  });

  it("escalates to ALERT once well past the threshold", () => {
    // The outage this was written for: 8 weeks with nothing.
    const specs = staleTransactionNotifications(account("2026-06-08"), "2026-08-02");
    expect(specs[0].severity).toBe("ALERT");
    expect(specs[0].body).toContain("55 days old");
  });

  it("skips an account that has never had a transaction", () => {
    expect(staleTransactionNotifications(account(null), "2026-08-02")).toEqual([]);
  });

  it("re-alerts weekly, not daily", () => {
    // A daily key would have produced 56 notifications during that outage.
    const keyOn = (today: string) =>
      staleTransactionNotifications(account("2026-06-08"), today)[0].dedupeKey;

    expect(keyOn("2026-08-03")).toBe(keyOn("2026-08-07"));
    expect(keyOn("2026-08-03")).not.toBe(keyOn("2026-08-11"));
  });
});

describe("isoYearWeek", () => {
  it("is stable Monday to Sunday and rolls over on the next Monday", () => {
    expect(isoYearWeek("2026-08-03")).toBe(isoYearWeek("2026-08-09"));
    expect(isoYearWeek("2026-08-03")).not.toBe(isoYearWeek("2026-08-10"));
  });

  it("keeps a year-end week in one bucket across the year boundary", () => {
    expect(isoYearWeek("2025-12-29")).toBe(isoYearWeek("2026-01-04"));
  });
});
