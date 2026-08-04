"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { SimpleSelect } from "@/components/ui/simple-select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { updatePlanningSettings } from "@/app/(app)/settings/actions";
import { Check } from "lucide-react";

type GoalType = "none" | "amount" | "percent";

interface PlanningFormProps {
  lowBalanceThreshold: number;
  savingsGoalAmount: number | null;
  savingsGoalPercent: number | null;
  savingsAccountId: string | null;
  accounts: { id: string; name: string }[];
  currency: string;
}

// Planning & alert settings: the cash-flow cushion and the savings-first goal.
// Separate card from regional preferences — these change money behaviour, not
// formatting.
export function PlanningForm({
  lowBalanceThreshold,
  savingsGoalAmount,
  savingsGoalPercent,
  savingsAccountId,
  accounts,
  currency,
}: PlanningFormProps) {
  const initialType: GoalType =
    savingsGoalAmount != null ? "amount" : savingsGoalPercent != null ? "percent" : "none";
  const [threshold, setThreshold] = useState(String(lowBalanceThreshold));
  const [goalType, setGoalType] = useState<GoalType>(initialType);
  const [goalValue, setGoalValue] = useState(
    savingsGoalAmount != null
      ? String(savingsGoalAmount)
      : savingsGoalPercent != null
        ? String(savingsGoalPercent)
        : ""
  );
  const [accountId, setAccountId] = useState(savingsAccountId ?? "none");
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setSaved(false);

    const thresholdValue = Number(threshold);
    if (!Number.isFinite(thresholdValue)) {
      setError("Threshold must be a number");
      return;
    }
    const parsedGoal = goalType === "none" ? null : Number(goalValue);
    if (goalType !== "none" && !Number.isFinite(parsedGoal)) {
      setError("Savings goal must be a number");
      return;
    }

    startTransition(async () => {
      try {
        await updatePlanningSettings({
          lowBalanceThreshold: thresholdValue,
          savingsGoalType: goalType,
          savingsGoalValue: parsedGoal,
          savingsAccountId: accountId === "none" ? null : accountId,
        });
        setSaved(true);
        setTimeout(() => setSaved(false), 3000);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to save");
      }
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Savings &amp; alerts</CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-5">
          <div className="space-y-1.5">
            <Label>Monthly savings goal</Label>
            <div className="flex gap-2">
              <SimpleSelect
                value={goalType}
                onValueChange={(v) => setGoalType(v as GoalType)}
                options={[
                  { value: "none", label: "No goal" },
                  { value: "amount", label: `Fixed amount (${currency})` },
                  { value: "percent", label: "% of fixed income" },
                ]}
                ariaLabel="Savings goal type"
                className="w-44 shrink-0"
              />
              {goalType !== "none" && (
                <Input
                  type="number"
                  step="any"
                  min="0"
                  value={goalValue}
                  onChange={(e) => setGoalValue(e.target.value)}
                  placeholder={goalType === "amount" ? "500" : "15"}
                  aria-label="Savings goal value"
                />
              )}
            </div>
            <p className="text-xs text-muted-foreground">
              Counted as a commitment next to rent — the variable budget is
              what&apos;s left after it, not the other way round.
            </p>
          </div>

          <div className="space-y-1.5">
            <Label>Savings account</Label>
            <SimpleSelect
              value={accountId}
              onValueChange={setAccountId}
              options={[
                { value: "none", label: "Not tracked" },
                ...accounts.map((a) => ({ value: a.id, label: a.name })),
              ]}
              ariaLabel="Savings account"
              className="w-full"
            />
            <p className="text-xs text-muted-foreground">
              Real savings is measured as this account&apos;s net balance change
              — a transfer that bounces back to cover rent doesn&apos;t count.
            </p>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="low-balance-threshold">
              Low balance threshold ({currency})
            </Label>
            <Input
              id="low-balance-threshold"
              type="number"
              step="any"
              value={threshold}
              onChange={(e) => setThreshold(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              Warn when an account&apos;s projected balance is set to dip below
              this over the next 60 days. 0 means &quot;don&apos;t go
              negative&quot;; raise it to keep a cushion.
            </p>
          </div>

          <div className="flex items-center gap-3 pt-2">
            <Button type="submit" disabled={isPending}>
              {isPending ? "Saving…" : "Save"}
            </Button>
            {saved && (
              <span className="flex items-center gap-1 text-sm text-success">
                <Check className="h-4 w-4" />
                Saved
              </span>
            )}
            {error && <span className="text-sm text-destructive">{error}</span>}
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
