// Shared sync logic — used by both the daily cron job and the initial post-connect sync.

import { createHash } from "crypto";
import { prisma } from "@/lib/prisma";
import { getBalances, getTransactions } from "./enable-banking";
import type { EnableBankingTransaction } from "./enable-banking";
import type { BankAccount, BankConnection } from "@/app/generated/prisma";

interface ConnectionWithAccounts extends BankConnection {
  bankAccounts: BankAccount[];
}

export interface SyncResult {
  accountsSynced: number;
  transactionsFetched: number;
  transactionsSkipped: number;
  balancesFetched: number;
  errors: string[];
}

/**
 * Build a deterministic external ID for a transaction.
 * Uses explicit IDs when available; falls back to a hash of core fields
 * for banks (e.g. BBVA) that don't always provide them.
 */
function buildExternalId(tx: EnableBankingTransaction): string | null {
  if (tx.transaction_id) return tx.transaction_id;
  if (tx.entry_reference) return tx.entry_reference;

  // Fallback: hash of date + amount + direction + description
  const date = tx.booking_date ?? tx.value_date;
  if (!date) return null; // no date → can't create a stable ID

  const key = [
    date,
    tx.transaction_amount.amount,
    tx.transaction_amount.currency,
    tx.credit_debit_indicator,
    tx.remittance_information?.[0] ?? tx.bank_transaction_code?.description ?? tx.note ?? "",
  ].join("|");

  return createHash("sha256").update(key).digest("hex").slice(0, 32);
}

/**
 * Sync balances and transactions for all accounts in a connection.
 *
 * `dateFrom` / `dateTo` are YYYY-MM-DD strings. Callers are responsible for
 * computing the right range (e.g. from lastSyncAt for incremental syncs, or
 * yesterday for the initial sync).
 *
 * Transactions are fetched exhaustively: the API may paginate via
 * `continuation_key` and we loop until there are no more pages.
 *
 * On success, `connection.lastSyncAt` is updated in the DB.
 */
export async function syncConnection(
  connection: ConnectionWithAccounts,
  dateFrom: string,
  dateTo: string
): Promise<SyncResult> {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  let transactionsFetched = 0;
  let transactionsSkipped = 0;
  let balancesFetched = 0;
  const errors: string[] = [];

  for (const account of connection.bankAccounts) {
    const accountErrors: string[] = [];

    // ── Balances ────────────────────────────────────────────────────────
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
      const isRateLimit = msg.includes("429") || msg.includes("ASPSP_RATE_LIMIT") || msg.includes("HUB046");
      accountErrors.push(`${isRateLimit ? "RATE_LIMIT:" : ""}balances: ${msg}`);
    }

    // ── Transactions (with automatic pagination) ─────────────────────────
    // The Enable Banking API may return a `continuation_key` when there are
    // more records beyond the current page. We loop until it stops coming.
    // Some account types (CARD, LOAN, etc.) may not support the transactions
    // endpoint — a 404 is logged as a warning but does not fail the sync.
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

        for (const tx of page.transactions) {
          const externalId = buildExternalId(tx);
          if (!externalId) {
            transactionsSkipped++;
            console.warn("[sync] Skipping transaction with no stable ID:", JSON.stringify(tx));
            continue;
          }

          await prisma.transaction.upsert({
            where: {
              bankAccountId_externalTransactionId: {
                bankAccountId: account.id,
                externalTransactionId: externalId,
              },
            },
            create: {
              userId: connection.userId,
              bankAccountId: account.id,
              externalTransactionId: externalId,
              amount: tx.transaction_amount.amount,
              currency: tx.transaction_amount.currency,
              direction: tx.credit_debit_indicator === "CRDT" ? "CREDIT" : "DEBIT",
              bookingDate: tx.booking_date ? new Date(tx.booking_date) : today,
              valueDate: tx.value_date ? new Date(tx.value_date) : null,
              description:
                tx.bank_transaction_code?.description ??
                tx.remittance_information?.join(" | ") ??
                tx.note ??
                null,
              creditorName: tx.creditor?.name ?? null,
              debtorName: tx.debtor?.name ?? null,
              creditorIban: tx.creditor_account?.iban ?? null,
              debtorIban: tx.debtor_account?.iban ?? null,
              remittanceInfo: tx.remittance_information?.join(" | ") ?? null,
              merchantCategoryCode: tx.merchant_category_code ?? null,
              rawData: tx as object,
            },
            update: {}, // transactions are immutable once stored
          });

          transactionsFetched++;
        }
      } while (continuationKey);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Unknown error";
      const is404 = msg.includes("404");

      if (is404) {
        // Account type does not support transaction history via PSD2 — not an error.
        console.warn(
          `[sync] Account ${account.externalAccountId} has no transaction endpoint (404) — skipping transactions`
        );
      } else {
        console.error(`[sync] Account ${account.externalAccountId} transactions error:`, msg);
        const isRateLimit = msg.includes("429") || msg.includes("ASPSP_RATE_LIMIT") || msg.includes("HUB046");
        accountErrors.push(`${isRateLimit ? "RATE_LIMIT:" : ""}transactions: ${msg}`);
      }
    }

    // ── Update per-account sync status ────────────────────────────────────
    // Write the outcome immediately so the UI reflects partial progress even
    // when other accounts in the same connection are still pending or fail.
    if (accountErrors.length === 0) {
      await prisma.bankAccount
        .update({ where: { id: account.id }, data: { lastSyncAt: new Date(), lastSyncError: null } })
        .catch(() => {});
    } else {
      await prisma.bankAccount
        .update({ where: { id: account.id }, data: { lastSyncError: accountErrors.join(" | ") } })
        .catch(() => {});
      // Propagate tagged errors to the connection-level result so the
      // queue consumer can decide whether to retry or acknowledge.
      errors.push(...accountErrors.map((e) => `Account ${account.externalAccountId} ${e}`));
    }
  }

  return {
    accountsSynced: connection.bankAccounts.length,
    transactionsFetched,
    transactionsSkipped,
    balancesFetched,
    errors,
  };
}

/** Format a date as YYYY-MM-DD */
export function toDateString(date: Date): string {
  return date.toISOString().split("T")[0];
}
