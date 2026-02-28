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
 * `dateFrom` / `dateTo` are YYYY-MM-DD strings.
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
    try {
      // ── Balances ──────────────────────────────────────────────────────────
      const { balances } = await getBalances(
        account.externalAccountId
      );

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

      // ── Transactions ──────────────────────────────────────────────────────
      const { transactions } = await getTransactions(
        account.externalAccountId,
        { dateFrom, dateTo }
      );

      console.log(
        `[sync] Account ${account.externalAccountId}: ${transactions.length} raw transactions from ${dateFrom} to ${dateTo}`
      );

      for (const tx of transactions) {
        const externalId = buildExternalId(tx);
        if (!externalId) {
          transactionsSkipped++;
          console.warn("[sync] Skipping transaction with no stable ID:", JSON.stringify(tx));
          continue;
        }

        await prisma.transaction.upsert({
          where: { externalTransactionId: externalId },
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
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Unknown error";
      console.error(`[sync] Account ${account.externalAccountId} error:`, msg);
      errors.push(`Account ${account.externalAccountId}: ${msg}`);
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
