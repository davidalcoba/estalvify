export type TransactionDirection = "DEBIT" | "CREDIT";

export interface TransactionListItemDTO {
  id: string;
  amount: number;
  currency: string;
  direction: TransactionDirection;
  bookingDate: string;
  description: string | null;
  creditorName: string | null;
  debtorName: string | null;
  remittanceInfo: string | null;
  categoryName: string | null;
  categoryColor: string | null;
  bankAccount: {
    id?: string;
    name: string;
  };
}

interface TxAmountLike {
  toString(): string;
}

interface TransactionRecordLike {
  id: string;
  amount: TxAmountLike;
  currency: string;
  direction: TransactionDirection;
  bookingDate: Date;
  description: string | null;
  creditorName: string | null;
  debtorName: string | null;
  remittanceInfo?: string | null;
  categorization?: {
    category?: {
      name: string;
      color?: string | null;
    } | null;
  } | null;
  bankAccount: {
    id?: string;
    name: string;
  };
}

export function toTransactionListItemDTO(tx: TransactionRecordLike): TransactionListItemDTO {
  return {
    id: tx.id,
    amount: Number(tx.amount.toString()),
    currency: tx.currency,
    direction: tx.direction,
    bookingDate: tx.bookingDate.toISOString(),
    description: tx.description,
    creditorName: tx.creditorName,
    debtorName: tx.debtorName,
    remittanceInfo: tx.remittanceInfo ?? null,
    categoryName: tx.categorization?.category?.name ?? null,
    categoryColor: tx.categorization?.category?.color ?? null,
    bankAccount: {
      id: tx.bankAccount.id,
      name: tx.bankAccount.name,
    },
  };
}

export function transactionLabel(tx: TransactionListItemDTO): string {
  return tx.description ?? (tx.direction === "CREDIT" ? tx.debtorName : tx.creditorName) ?? "Transaction";
}

export function transactionCounterparty(tx: TransactionListItemDTO): string | null {
  return tx.direction === "CREDIT" ? tx.debtorName : tx.creditorName;
}

function normalizeChunk(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

export function splitDescriptionChunks(description: string | null): string[] {
  if (!description) return [];
  return description
    .split("//")
    .map(normalizeChunk)
    .filter(Boolean);
}

export function transactionOperationType(tx: TransactionListItemDTO): string {
  const chunks = splitDescriptionChunks(tx.description);
  if (chunks[0]) return chunks[0];
  return tx.direction === "CREDIT" ? "INCOME" : "EXPENSE";
}

export function transactionMerchant(tx: TransactionListItemDTO): string {
  const counterparty = normalizeChunk(transactionCounterparty(tx) ?? "");
  if (counterparty) return counterparty;

  const chunks = splitDescriptionChunks(tx.description);
  if (chunks[2]) return chunks[2];
  if (chunks[1]) return chunks[1];
  if (chunks[0]) return chunks[0];

  return "Unknown merchant";
}

export function groupTransactionsByDate(transactions: TransactionListItemDTO[]): Array<{ dateKey: string; items: TransactionListItemDTO[] }> {
  const grouped = new Map<string, TransactionListItemDTO[]>();

  for (const tx of transactions) {
    const dateKey = tx.bookingDate.split("T")[0];
    const bucket = grouped.get(dateKey);
    if (bucket) {
      bucket.push(tx);
    } else {
      grouped.set(dateKey, [tx]);
    }
  }

  return Array.from(grouped.entries()).map(([dateKey, items]) => ({ dateKey, items }));
}
