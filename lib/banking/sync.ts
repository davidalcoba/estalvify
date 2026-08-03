// Shared sync logic — used by both the daily cron job and the initial post-connect sync.

import { prisma } from "@/lib/prisma";
import { getBalances, getTransactions } from "./enable-banking";
import type { EnableBankingTransaction } from "./enable-banking";
import { buildExternalId, parseRemittanceFields } from "./transaction-parse";
import {
  isAuthError,
  isRateLimitError,
  RATE_LIMIT_PREFIX,
  AUTH_ERROR_PREFIX,
  UNSUPPORTED_PREFIX,
} from "./sync-errors";
import type { BankAccount } from "@/app/generated/prisma";

export interface AccountSyncResult {
  errors: string[];
  transactionsFetched: number;
  transactionsSkipped: number;
  balancesFetched: number;
}

/**
 * `dateFrom` / `dateTo` are YYYY-MM-DD strings. Callers are responsible for
 * computing the right range (e.g. from lastSyncAt for incremental syncs, or
 * 90 days back for the initial sync).
 *
 * Updates bankAccount.lastSyncAt / lastSyncError in the DB before returning.
 */
export async function syncAccount(
  account: BankAccount,
  userId: string,
  dateFrom: string,
  dateTo: string
): Promise<AccountSyncResult> {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const errors: string[] = [];
  let rateLimitReached = false;
  let authErrorReached = false;
  let transactionsFetched = 0;
  let transactionsSkipped = 0;
  let balancesFetched = 0;
  // Recorded on the account but kept out of `errors` — see UNSUPPORTED_PREFIX.
  let unsupportedNote: string | null = null;

  // ── Balances ────────────────────────────────────────────────────────────────
  try {
    // Skip the API call if a balance was already stored today — PSD2
    // consent access is limited (some banks enforce ≤4/day) so we
    // avoid burning quota on a value we already have.
    const cachedBalance = await prisma.accountBalance.findFirst({
      where: { bankAccountId: account.id, date: today },
      select: { id: true },
    });

    if (cachedBalance) {
      console.log(`[sync] Account ${account.externalAccountId} balance already cached for today — skipping API call`);
    } else {
      const { balances } = await getBalances(account.externalAccountId);

      for (const balance of balances) {
        await prisma.accountBalance.upsert({
          where: {
            bankAccountId_date_balanceType: {
              bankAccountId: account.id,
              date: today,
              balanceType: balance.balance_type ?? "unknown",
            },
          },
          create: {
            bankAccountId: account.id,
            date: today,
            balance: balance.balance_amount.amount,
            currency: balance.balance_amount.currency,
            balanceType: balance.balance_type ?? "unknown",
          },
          update: {
            balance: balance.balance_amount.amount,
          },
        });
        balancesFetched++;
      }
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    console.error(`[sync] Account ${account.externalAccountId} balances error:`, msg);
    const rateLimit = isRateLimitError(msg);
    const auth = !rateLimit && isAuthError(msg);
    errors.push(`${rateLimit ? RATE_LIMIT_PREFIX : auth ? AUTH_ERROR_PREFIX : ""}balances: ${msg}`);
    if (rateLimit) rateLimitReached = true;
    if (auth) authErrorReached = true;
  }

  // ── Transactions (with automatic pagination) ─────────────────────────────
  // Skip entirely if a rate limit or an auth/consent error was already hit on
  // balances — further calls would also fail and would only burn more of the
  // limited daily PSD2 quota (or hit the same 401).
  // The Enable Banking API may return a `continuation_key` when there are
  // more records beyond the current page. We loop until it stops coming.
  // Some account types (CARD, LOAN, etc.) may not support the transactions
  // endpoint — a 404 is logged as a warning but does not fail the sync.
  if (!rateLimitReached && !authErrorReached) {
    try {
      let continuationKey: string | undefined;
      let pageCount = 0;

      do {
        const page = await getTransactions(account.externalAccountId, {
          dateFrom,
          dateTo,
          continuationKey,
        });

        pageCount++;
        continuationKey = page.continuation_key;

        console.log(
          `[sync] Account ${account.externalAccountId}: page ${pageCount}, ` +
            `${page.transactions.length} transactions (${dateFrom}→${dateTo})` +
            (continuationKey ? ", fetching next page…" : "")
        );

        // Collect valid transactions for this page, skipping those without
        // a stable ID. Use createMany+skipDuplicates instead of per-row
        // upserts to avoid N sequential round-trips that can timeout the
        // Vercel function on large initial syncs (90-day window).
        const validTxs: Array<{
          externalId: string;
          tx: EnableBankingTransaction;
        }> = [];

        for (const tx of page.transactions) {
          const externalId = buildExternalId(tx);
          if (!externalId) {
            transactionsSkipped++;
            // Never log the raw transaction — it carries counterparty IBANs and
            // names (the fields we deliberately truncate before storing). A
            // non-identifying hint is enough to debug a dedupe gap.
            console.warn(
              `[sync] Skipping transaction with no stable ID (${tx.transaction_amount?.currency ?? "?"}, booking ${tx.booking_date ?? "?"})`
            );
            continue;
          }
          validTxs.push({ externalId, tx });
        }

        if (validTxs.length > 0) {
          const { count } = await prisma.transaction.createMany({
            data: validTxs.map(({ externalId, tx }) => {
              const parsed = parseRemittanceFields(tx.remittance_information ?? []);
              return {
              userId,
              bankAccountId: account.id,
              externalTransactionId: externalId,
              amount: tx.transaction_amount.amount,
              currency: tx.transaction_amount.currency,
              direction: tx.credit_debit_indicator === "CRDT" ? "CREDIT" : "DEBIT",
              valueDate: tx.value_date ? new Date(tx.value_date) : (tx.booking_date ? new Date(tx.booking_date) : today),
              description: parsed.description ?? tx.note ?? null,
              // Store only the last 4 digits — full IBANs are personal data
              creditorIban: tx.creditor_account?.iban?.slice(-4) ?? null,
              debtorIban: tx.debtor_account?.iban?.slice(-4) ?? null,
              remittanceInfo: parsed.remittanceInfo,
              merchantCategoryCode: tx.merchant_category_code ?? null,
            };}),
            skipDuplicates: true,
          });
          transactionsFetched += count;
        }
      } while (continuationKey);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Unknown error";
      const is404 = msg.includes("404");

      if (is404) {
        // Account type does not support transaction history via PSD2 — not an
        // error, so it must not fail or retry the sync. But swallowing it
        // entirely left `lastSyncAt` fresh and `lastSyncError` null, making an
        // account that can never return transactions look perfectly healthy.
        console.warn(
          `[sync] Account ${account.externalAccountId} has no transaction endpoint (404) — skipping transactions`
        );
        unsupportedNote = `${UNSUPPORTED_PREFIX}this account provides no transaction history`;
      } else {
        console.error(`[sync] Account ${account.externalAccountId} transactions error:`, msg);
        const rateLimit = isRateLimitError(msg);
        const auth = !rateLimit && isAuthError(msg);
        errors.push(`${rateLimit ? RATE_LIMIT_PREFIX : auth ? AUTH_ERROR_PREFIX : ""}transactions: ${msg}`);
      }
    }
  }

  // ── Update per-account sync status ──────────────────────────────────────────
  // Success write is NOT silently caught — if it fails, the error propagates
  // so the queue retries the invocation and lastSyncAt eventually gets written.
  if (errors.length === 0) {
    await prisma.bankAccount
      .update({
        where: { id: account.id },
        data: { lastSyncAt: new Date(), lastSyncError: unsupportedNote },
      });
  } else {
    await prisma.bankAccount
      .update({ where: { id: account.id }, data: { lastSyncError: errors.join(" | ") } })
      .catch(() => {});
  }

  return { errors, transactionsFetched, transactionsSkipped, balancesFetched };
}

/** Format a date as YYYY-MM-DD */
export function toDateString(date: Date): string {
  return date.toISOString().split("T")[0];
}
