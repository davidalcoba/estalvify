"use client";

import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SimpleSelect } from "@/components/ui/simple-select";
import { CategorySelect } from "@/components/categorize/category-select";
import type { CategoryOption, PlanEntryVM } from "@/lib/plan/plan-dto";
import type { PlanCadence, PlanDirection } from "@/lib/plan/plan-item";
import type { PlanItemFields } from "@/app/(app)/plan/actions";
import { CADENCE_OPTIONS, DAY_ANCHOR_CADENCES } from "./shared/cadence";

export interface PlanDialogTarget {
  mode: "add" | "edit";
  direction: PlanDirection;
  categoryId?: string;
  item?: PlanEntryVM;
}

// Add or edit a plan item (income or expense) with a cadence. Expenses require a
// category; one-off items require a date; monthly/quarterly/yearly accept an
// optional day-of-month anchor.
export function PlanItemDialog({
  target,
  categories,
  onClose,
  onSubmit,
  pending,
}: {
  target: PlanDialogTarget | null;
  categories: CategoryOption[];
  onClose: () => void;
  onSubmit: (fields: PlanItemFields) => void;
  pending: boolean;
}) {
  return (
    <Dialog open={target !== null} onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="sm:max-w-md">
        {target && (
          <PlanForm
            key={`${target.mode}-${target.item?.id ?? target.categoryId ?? "new"}`}
            target={target}
            categories={categories}
            onClose={onClose}
            onSubmit={onSubmit}
            pending={pending}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

function PlanForm({
  target,
  categories,
  onClose,
  onSubmit,
  pending,
}: {
  target: PlanDialogTarget;
  categories: CategoryOption[];
  onClose: () => void;
  onSubmit: (fields: PlanItemFields) => void;
  pending: boolean;
}) {
  const isIncome = target.direction === "CREDIT";
  const item = target.item;

  const [categoryId, setCategoryId] = useState(item?.categoryId ?? target.categoryId ?? "");
  const [label, setLabel] = useState(item?.label ?? "");
  const [amount, setAmount] = useState(item?.amount != null ? String(item.amount) : "");
  const [cadence, setCadence] = useState<PlanCadence>(item?.cadence ?? "MONTHLY");
  const [dayOfMonth, setDayOfMonth] = useState(item?.dayOfMonth != null ? String(item.dayOfMonth) : "");
  const [onDate, setOnDate] = useState(item?.onDate ?? "");

  const parsedAmount = Number(amount);
  const amountOk = amount !== "" && Number.isFinite(parsedAmount) && parsedAmount >= 0;
  const categoryOk = isIncome || categoryId !== "";
  const dateOk = cadence !== "ONE_OFF" || /^\d{4}-\d{2}-\d{2}$/.test(onDate);
  const canSave = amountOk && categoryOk && dateOk;

  const showDayAnchor = DAY_ANCHOR_CADENCES.includes(cadence);
  const noun = isIncome ? "income" : "expense";

  function handleSave() {
    if (!canSave) return;
    const day = dayOfMonth.trim() === "" ? null : Math.trunc(Number(dayOfMonth));
    onSubmit({
      direction: target.direction,
      categoryId: isIncome ? categoryId || null : categoryId,
      label: label.trim() || null,
      amount: parsedAmount,
      cadence,
      dayOfMonth: cadence === "ONE_OFF" ? null : Number.isFinite(day as number) ? day : null,
      onDate: cadence === "ONE_OFF" ? onDate : null,
    });
  }

  return (
    <>
      <DialogHeader>
        <DialogTitle>
          {target.mode === "edit" ? `Edit ${noun}` : `Add ${noun}`}
        </DialogTitle>
        <DialogDescription>
          {isIncome
            ? "Money you expect to receive, and how often."
            : "Money you expect to spend, and how often."}
        </DialogDescription>
      </DialogHeader>

      <div className="space-y-4">
        {!isIncome && (
          <div className="space-y-1.5">
            <Label>Category</Label>
            <CategorySelect
              value={categoryId}
              onValueChange={setCategoryId}
              categories={categories}
              placeholder="Pick a category…"
              ariaLabel="Category"
              className="w-full"
            />
          </div>
        )}

        <div className="space-y-1.5">
          <Label>Label (optional)</Label>
          <Input
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder={isIncome ? "e.g. Salary" : "e.g. Rent"}
            aria-label="Label"
            maxLength={60}
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label>Amount</Label>
            <Input
              type="number"
              inputMode="decimal"
              min={0}
              step="0.01"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="0.00"
              aria-label="Amount"
              autoFocus
            />
          </div>
          <div className="space-y-1.5">
            <Label>Frequency</Label>
            <SimpleSelect
              value={cadence}
              onValueChange={(v) => setCadence(v as PlanCadence)}
              options={CADENCE_OPTIONS}
              ariaLabel="Frequency"
              className="w-full"
            />
          </div>
        </div>

        {cadence === "ONE_OFF" ? (
          <div className="space-y-1.5">
            <Label>Date</Label>
            <Input
              type="date"
              value={onDate}
              onChange={(e) => setOnDate(e.target.value)}
              aria-label="Date"
            />
          </div>
        ) : (
          showDayAnchor && (
            <div className="space-y-1.5">
              <Label>Day of month (optional)</Label>
              <Input
                type="number"
                inputMode="numeric"
                min={1}
                max={31}
                value={dayOfMonth}
                onChange={(e) => setDayOfMonth(e.target.value)}
                placeholder="e.g. 1"
                aria-label="Day of month"
              />
            </div>
          )
        )}
      </div>

      <DialogFooter>
        <Button variant="outline" onClick={onClose} disabled={pending}>
          Cancel
        </Button>
        <Button onClick={handleSave} disabled={!canSave} loading={pending}>
          Save
        </Button>
      </DialogFooter>
    </>
  );
}
