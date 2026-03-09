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

export function transactionOperationType(tx: TransactionListItemDTO): string {
  if (tx.remittanceInfo) return tx.remittanceInfo;
  return tx.direction === "CREDIT" ? "INCOME" : "EXPENSE";
}

const BBVA_DESCRIPTION_PREFIXES = [
  "PAGO DE ADEUDO DIRECTO SEPA ",
  "PAGO DE ADEUDO SEPA ",
  "ADEUDO DIRECTO SEPA ",
  "PAGO CON TARJETA ",
  "PAGO CON VISA ",
];

export function transactionMerchant(tx: TransactionListItemDTO): string {
  const raw = tx.description ?? tx.remittanceInfo ?? "Unknown";
  for (const prefix of BBVA_DESCRIPTION_PREFIXES) {
    if (raw.toUpperCase().startsWith(prefix)) {
      return raw.slice(prefix.length).trim() || raw;
    }
  }
  return raw;
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
