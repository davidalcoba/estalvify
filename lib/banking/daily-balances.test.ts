import { describe, it, expect } from "vitest";
import { dailyClosingBalances } from "./daily-balances";
import type { EnableBankingTransaction } from "./enable-banking";

function tx(
  bookingDate: string,
  amount: string,
  after?: string
): EnableBankingTransaction {
  return {
    transaction_amount: { amount, currency: "EUR" },
    credit_debit_indicator: "DBIT",
    status: "BOOK",
    booking_date: bookingDate,
    ...(after ? { balance_after_transaction: { amount: after, currency: "EUR" } } : {}),
  } as EnableBankingTransaction;
}

describe("dailyClosingBalances", () => {
  it("takes the day's LAST transaction, which the API lists first", () => {
    // Newest-first, as Enable Banking returns a page. The 3rd of August closed
    // at 2029.07 — the balance after the last movement of that day, not after
    // the earlier ones.
    const out = dailyClosingBalances([
      tx("2026-08-03", "20.00", "2029.07"),
      tx("2026-08-03", "34.70", "2049.07"),
      tx("2026-08-03", "1389.17", "2083.77"),
    ]);
    expect(out).toEqual([{ date: "2026-08-03", balance: "2029.07", currency: "EUR" }]);
  });

  it("returns one row per day, oldest first", () => {
    const out = dailyClosingBalances([
      tx("2026-08-05", "40.00", "1465.55"),
      tx("2026-08-03", "20.00", "2029.07"),
      tx("2026-07-31", "562.48", "2600.00"),
    ]);
    expect(out.map((b) => b.date)).toEqual(["2026-07-31", "2026-08-03", "2026-08-05"]);
  });

  it("skips transactions with no balance_after_transaction", () => {
    // The field is optional in the API. A bank that omits it must leave the
    // previous behaviour alone rather than have a balance invented for it.
    expect(dailyClosingBalances([tx("2026-08-03", "20.00")])).toEqual([]);
  });

  it("uses a day's balance even when only some of its transactions carry one", () => {
    const out = dailyClosingBalances([
      tx("2026-08-03", "20.00"),
      tx("2026-08-03", "34.70", "2049.07"),
    ]);
    expect(out).toEqual([{ date: "2026-08-03", balance: "2049.07", currency: "EUR" }]);
  });

  it("falls back to value_date when there is no booking_date", () => {
    const t = {
      transaction_amount: { amount: "10.00", currency: "EUR" },
      credit_debit_indicator: "DBIT",
      status: "BOOK",
      value_date: "2026-08-04",
      balance_after_transaction: { amount: "1500.00", currency: "EUR" },
    } as EnableBankingTransaction;
    expect(dailyClosingBalances([t])[0].date).toBe("2026-08-04");
  });

  it("ignores a transaction with no date at all", () => {
    const t = {
      transaction_amount: { amount: "10.00", currency: "EUR" },
      credit_debit_indicator: "DBIT",
      status: "BOOK",
      balance_after_transaction: { amount: "1500.00", currency: "EUR" },
    } as EnableBankingTransaction;
    expect(dailyClosingBalances([t])).toEqual([]);
  });
});
