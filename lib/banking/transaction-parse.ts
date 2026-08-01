// Pure transaction-parsing helpers, extracted from sync.ts so they can be
// unit-tested in isolation without pulling in the Prisma client or env config.

import { createHash } from "crypto";
import type { EnableBankingTransaction } from "./enable-banking";

/**
 * Build a deterministic external ID for a transaction.
 * Uses explicit IDs when available; falls back to a hash of core fields
 * for banks (e.g. BBVA) that don't always provide them.
 * Returns null when there is no date to anchor a stable hash.
 */
export function buildExternalId(tx: EnableBankingTransaction): string | null {
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
 * Parse bank remittance_information array into two clean display fields.
 *
 * Banks encode remittance data in two common formats:
 *   a) A single string with "//" separators: "ADEUDO A SU CARGO//N 2026065 GC RE OCTOPUS"
 *   b) An array of separate strings: ["ADEUDO A SU CARGO", "N 2026065 GC RE OCTOPUS"]
 *
 * In both cases the convention (used by Spanish SEPA banks) is:
 *   chunks[0] = operation type / concept  → stored as remittanceInfo (subtitle)
 *   chunks[1+] = merchant / reference     → stored as description (title)
 */
export function parseRemittanceFields(
  info: string[]
): { description: string | null; remittanceInfo: string | null } {
  if (!info.length) return { description: null, remittanceInfo: null };

  // Normalize: join elements with "//" so both formats are handled uniformly
  const chunks = info
    .join("//")
    .split("//")
    .map((s) => s.replace(/\s+/g, " ").trim())
    .filter(Boolean);

  if (chunks.length === 0) return { description: null, remittanceInfo: null };
  if (chunks.length === 1) return { description: chunks[0], remittanceInfo: null };

  return {
    description: chunks.slice(1).join(" ").trim() || null, // title (merchant/reference)
    remittanceInfo: chunks[0],                             // subtitle (operation type)
  };
}
