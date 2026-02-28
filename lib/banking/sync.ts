// Shared sync logic — used by both the daily cron job and the initial post-connect sync.

import { prisma } from "@/lib/prisma";
import { getBalances, getTransactions } from "./enable-banking";
import type { BankAccount, BankConnection } from "@/app/generated/prisma";

interface ConnectionWithAccounts extends BankConnection {
  bankAccounts: BankAccount[];
}

export interface SyncResult {
  accountsSynced: number;
  transactionsFetched: number;
  errors: string[];
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
  const errors: string[] = [];

  for (const account of connection.bankAccounts) {
    try {
      // ── Balances ──────────────────────────────────────────────────────────
      const { balances } = await getBalances(
        connection.sessionId,
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
      }

      // ── Transactions ──────────────────────────────────────────────────────
      const { transactions } = await getTransactions(
        connection.sessionId,
        account.externalAccountId,
        { dateFrom, dateTo }
      );

      for (const tx of transactions) {
        const externalId = tx.transaction_id ?? tx.entry_reference;
        if (!externalId) continue;

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
              tx.transaction_information ??
              tx.remittance_information_unstructured ??
              null,
            creditorName: tx.creditor_name ?? null,
            debtorName: tx.debtor_name ?? null,
            creditorIban: tx.creditor_account?.iban ?? null,
            debtorIban: tx.debtor_account?.iban ?? null,
            remittanceInfo: tx.remittance_information_unstructured ?? null,
            merchantCategoryCode: tx.merchant_category_code ?? null,
            rawData: tx as object,
          },
          update: {}, // transactions are immutable once stored
        });

        transactionsFetched++;
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Unknown error";
      errors.push(`Account ${account.externalAccountId}: ${msg}`);
    }
  }

  return {
    accountsSynced: connection.bankAccounts.length,
    transactionsFetched,
    errors,
  };
}

/** Format a date as YYYY-MM-DD */
export function toDateString(date: Date): string {
  return date.toISOString().split("T")[0];
}
