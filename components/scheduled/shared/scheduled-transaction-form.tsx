"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { ScheduledTransactionDTO, RepeatRule } from "@/lib/scheduled/scheduled-dto";
import {
  createScheduledTransaction,
  updateScheduledTransaction,
} from "@/app/(app)/scheduled/actions";

interface BankAccountOption {
  id: string;
  name: string;
}

interface CategoryOption {
  id: string;
  name: string;
  parentId: string | null;
}

interface ScheduledTransactionFormProps {
  existing?: ScheduledTransactionDTO;
  bankAccounts: BankAccountOption[];
  categories: CategoryOption[];
  onSuccess: () => void;
  onCancel: () => void;
}

const REPEAT_LABELS: Record<RepeatRule, string> = {
  NONE: "One time",
  DAILY: "Daily",
  WEEKLY: "Weekly",
  MONTHLY: "Monthly",
  YEARLY: "Yearly",
  CUSTOM: "Custom interval",
};

export function ScheduledTransactionForm({
  existing,
  bankAccounts,
  categories,
  onSuccess,
  onCancel,
}: ScheduledTransactionFormProps) {
  const [payeeName, setPayeeName] = useState(existing?.payeeName ?? "");
  const [amount, setAmount] = useState(existing ? String(existing.amount) : "");
  const [direction, setDirection] = useState<"DEBIT" | "CREDIT">(
    existing?.direction ?? "DEBIT"
  );
  const [categoryId, setCategoryId] = useState<string>(existing?.categoryId ?? "");
  const [bankAccountId, setBankAccountId] = useState(
    existing?.bankAccountId ?? bankAccounts[0]?.id ?? ""
  );
  const [nextDate, setNextDate] = useState(existing?.nextDate ?? "");
  const [repeatRule, setRepeatRule] = useState<RepeatRule>(
    existing?.repeatRule ?? "MONTHLY"
  );
  const [repeatInterval, setRepeatInterval] = useState(
    existing?.repeatInterval ? String(existing.repeatInterval) : "7"
  );
  const [notes, setNotes] = useState(existing?.notes ?? "");

  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  // Group categories for optgroup rendering
  const parents = categories.filter((c) => !c.parentId);
  const childrenMap: Record<string, CategoryOption[]> = {};
  for (const cat of categories) {
    if (cat.parentId) {
      childrenMap[cat.parentId] ??= [];
      childrenMap[cat.parentId].push(cat);
    }
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const parsedAmount = parseFloat(amount.replace(",", "."));
    if (isNaN(parsedAmount) || parsedAmount <= 0) {
      setError("Enter a valid positive amount");
      return;
    }
    if (!payeeName.trim()) {
      setError("Payee name is required");
      return;
    }
    if (!nextDate) {
      setError("Next date is required");
      return;
    }
    if (!bankAccountId) {
      setError("Select an account");
      return;
    }

    setError(null);

    const input = {
      payeeName: payeeName.trim(),
      amount: parsedAmount,
      direction,
      categoryId: categoryId || null,
      bankAccountId,
      nextDate,
      repeatRule,
      repeatInterval: repeatRule === "CUSTOM" ? parseInt(repeatInterval) || 7 : null,
      notes: notes.trim() || null,
    };

    startTransition(async () => {
      try {
        if (existing) {
          await updateScheduledTransaction(existing.id, input);
        } else {
          await createScheduledTransaction(input);
        }
        onSuccess();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to save");
      }
    });
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {/* Direction toggle */}
      <div className="grid grid-cols-2 gap-2">
        <button
          type="button"
          onClick={() => setDirection("DEBIT")}
          className={`rounded-md border px-3 py-2 text-sm font-medium transition-colors ${
            direction === "DEBIT"
              ? "border-red-400 bg-red-50 text-red-700"
              : "border-border hover:bg-muted"
          }`}
        >
          Expense (−)
        </button>
        <button
          type="button"
          onClick={() => setDirection("CREDIT")}
          className={`rounded-md border px-3 py-2 text-sm font-medium transition-colors ${
            direction === "CREDIT"
              ? "border-green-400 bg-green-50 text-green-700"
              : "border-border hover:bg-muted"
          }`}
        >
          Income (+)
        </button>
      </div>

      <div>
        <label className="text-sm font-medium mb-1.5 block">Payee</label>
        <Input
          value={payeeName}
          onChange={(e) => setPayeeName(e.target.value)}
          placeholder="e.g. Rent, Salary, Netflix"
        />
      </div>

      <div>
        <label className="text-sm font-medium mb-1.5 block">Amount</label>
        <Input
          type="number"
          min="0.01"
          step="0.01"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          placeholder="0.00"
        />
      </div>

      <div>
        <label className="text-sm font-medium mb-1.5 block">
          Category{direction === "CREDIT" && " (leave empty for Ready to Assign)"}
        </label>
        <select
          value={categoryId}
          onChange={(e) => setCategoryId(e.target.value)}
          className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm shadow-sm focus:outline-none"
        >
          <option value="">
            {direction === "CREDIT" ? "Ready to Assign (income)" : "No category"}
          </option>
          {parents.map((parent) => {
            const children = childrenMap[parent.id] ?? [];
            if (children.length === 0) {
              return (
                <option key={parent.id} value={parent.id}>
                  {parent.name}
                </option>
              );
            }
            return (
              <optgroup key={parent.id} label={parent.name}>
                <option value={parent.id}>{parent.name}</option>
                {children.map((child) => (
                  <option key={child.id} value={child.id}>
                    {child.name}
                  </option>
                ))}
              </optgroup>
            );
          })}
        </select>
      </div>

      <div>
        <label className="text-sm font-medium mb-1.5 block">Account</label>
        <select
          value={bankAccountId}
          onChange={(e) => setBankAccountId(e.target.value)}
          className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm shadow-sm focus:outline-none"
        >
          {bankAccounts.map((acc) => (
            <option key={acc.id} value={acc.id}>
              {acc.name}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label className="text-sm font-medium mb-1.5 block">Next date</label>
        <Input
          type="date"
          value={nextDate}
          onChange={(e) => setNextDate(e.target.value)}
        />
      </div>

      <div>
        <label className="text-sm font-medium mb-1.5 block">Repeats</label>
        <select
          value={repeatRule}
          onChange={(e) => setRepeatRule(e.target.value as RepeatRule)}
          className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm shadow-sm focus:outline-none"
        >
          {(Object.keys(REPEAT_LABELS) as RepeatRule[]).map((rule) => (
            <option key={rule} value={rule}>
              {REPEAT_LABELS[rule]}
            </option>
          ))}
        </select>
      </div>

      {repeatRule === "CUSTOM" && (
        <div>
          <label className="text-sm font-medium mb-1.5 block">Every N days</label>
          <Input
            type="number"
            min="1"
            value={repeatInterval}
            onChange={(e) => setRepeatInterval(e.target.value)}
          />
        </div>
      )}

      <div>
        <label className="text-sm font-medium mb-1.5 block">Notes (optional)</label>
        <Input
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Optional note"
        />
      </div>

      {error && <p className="text-xs text-red-500">{error}</p>}

      <div className="flex gap-2 pt-1">
        <Button type="submit" disabled={isPending} className="flex-1">
          {isPending ? "Saving…" : existing ? "Update" : "Create"}
        </Button>
        <Button type="button" variant="outline" onClick={onCancel} disabled={isPending}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
