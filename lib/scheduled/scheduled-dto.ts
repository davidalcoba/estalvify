// Scheduled transaction DTOs — plain objects safe for server→client boundary

export type RepeatRule = "NONE" | "DAILY" | "WEEKLY" | "MONTHLY" | "YEARLY" | "CUSTOM";

export interface ScheduledTransactionDTO {
  id: string;
  payeeName: string;
  amount: number;
  currency: string;
  direction: "DEBIT" | "CREDIT";
  /** null = Ready to Assign (income) */
  categoryId: string | null;
  categoryName: string | null;
  categoryColor: string | null;
  bankAccountId: string;
  bankAccountName: string;
  /** ISO date string (YYYY-MM-DD) */
  nextDate: string;
  repeatRule: RepeatRule;
  repeatInterval: number | null;
  notes: string | null;
  isActive: boolean;
}

export function toScheduledTransactionDTO(raw: {
  id: string;
  payeeName: string;
  amount: { toString(): string };
  currency: string;
  direction: "DEBIT" | "CREDIT";
  categoryId: string | null;
  category: { name: string; color: string } | null;
  bankAccountId: string;
  bankAccount: { name: string };
  nextDate: Date;
  repeatRule: string;
  repeatInterval: number | null;
  notes: string | null;
  isActive: boolean;
}): ScheduledTransactionDTO {
  return {
    id: raw.id,
    payeeName: raw.payeeName,
    amount: Number(raw.amount),
    currency: raw.currency,
    direction: raw.direction as "DEBIT" | "CREDIT",
    categoryId: raw.categoryId,
    categoryName: raw.category?.name ?? null,
    categoryColor: raw.category?.color ?? null,
    bankAccountId: raw.bankAccountId,
    bankAccountName: raw.bankAccount.name,
    nextDate: raw.nextDate.toISOString().split("T")[0],
    repeatRule: raw.repeatRule as RepeatRule,
    repeatInterval: raw.repeatInterval,
    notes: raw.notes,
    isActive: raw.isActive,
  };
}
