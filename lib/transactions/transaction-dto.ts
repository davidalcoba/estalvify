export type TransactionDirection = "DEBIT" | "CREDIT";

export interface TransactionListItemDTO {
  id: string;
  amount: number;
  currency: string;
  direction: TransactionDirection;
  valueDate: string;
  description: string | null;
  remittanceInfo: string | null;
  categoryId: string | null;
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
  valueDate: Date;
  description: string | null;
  remittanceInfo?: string | null;
  categorization?: {
    categoryId?: string;
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
    valueDate: tx.valueDate.toISOString(),
    description: tx.description,
    remittanceInfo: tx.remittanceInfo ?? null,
    categoryId: tx.categorization?.categoryId ?? null,
    categoryName: tx.categorization?.category?.name ?? null,
    categoryColor: tx.categorization?.category?.color ?? null,
    bankAccount: {
      id: tx.bankAccount.id,
      name: tx.bankAccount.name,
    },
  };
}

export function transactionLabel(tx: TransactionListItemDTO): string {
  return tx.description ?? tx.remittanceInfo ?? "Transaction";
}

export function transactionCounterparty(_tx: TransactionListItemDTO): string | null {
  return null;
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
  const chunks = splitDescriptionChunks(tx.description);
  if (chunks[2]) return chunks[2];
  if (chunks[1]) return chunks[1];
  if (chunks[0]) return chunks[0];

  return "Unknown merchant";
}

export function groupTransactionsByDate(transactions: TransactionListItemDTO[]): Array<{ dateKey: string; items: TransactionListItemDTO[] }> {
  const grouped = new Map<string, TransactionListItemDTO[]>();

  for (const tx of transactions) {
    const dateKey = tx.valueDate.split("T")[0];
    const bucket = grouped.get(dateKey);
    if (bucket) {
      bucket.push(tx);
    } else {
      grouped.set(dateKey, [tx]);
    }
  }

  return Array.from(grouped.entries()).map(([dateKey, items]) => ({ dateKey, items }));
}
