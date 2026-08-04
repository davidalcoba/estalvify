"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { updatePlanningSettings } from "@/app/(app)/settings/actions";
import { Check } from "lucide-react";

interface PlanningFormProps {
  lowBalanceThreshold: number;
  currency: string;
}

// Planning & alert settings. Under the v3 model income and charges live in
// planned items and savings is derived, so the only knob left here is the
// cash-flow alert threshold.
export function PlanningForm({ lowBalanceThreshold, currency }: PlanningFormProps) {
  const [threshold, setThreshold] = useState(String(lowBalanceThreshold));
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

    startTransition(async () => {
      try {
        await updatePlanningSettings({ lowBalanceThreshold: thresholdValue });
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
        <CardTitle>Alerts</CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-5">
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
