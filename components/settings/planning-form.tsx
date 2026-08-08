"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { updatePlanningSettings } from "@/app/(app)/settings/actions";
import { Check } from "lucide-react";
import { useT } from "@/components/i18n/i18n-provider";

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
  const t = useT();

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setSaved(false);

    const thresholdValue = Number(threshold);
    if (!Number.isFinite(thresholdValue)) {
      setError(t("settings.alerts.threshold.invalid"));
      return;
    }

    startTransition(async () => {
      try {
        await updatePlanningSettings({ lowBalanceThreshold: thresholdValue });
        setSaved(true);
        setTimeout(() => setSaved(false), 3000);
      } catch (err) {
        setError(err instanceof Error ? err.message : t("settings.saveFailed"));
      }
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("settings.alerts.title")}</CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-5">
          <div className="space-y-1.5">
            <Label htmlFor="low-balance-threshold">
              {t("settings.alerts.threshold.label", { currency })}
            </Label>
            <Input
              id="low-balance-threshold"
              type="number"
              step="any"
              value={threshold}
              onChange={(e) => setThreshold(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              {t("settings.alerts.threshold.help")}
            </p>
          </div>

          <div className="flex items-center gap-3 pt-2">
            <Button type="submit" disabled={isPending}>
              {isPending ? t("common.saving") : t("common.save")}
            </Button>
            {saved && (
              <span className="flex items-center gap-1 text-sm text-success">
                <Check className="h-4 w-4" />
                {t("common.saved")}
              </span>
            )}
            {error && <span className="text-sm text-destructive">{error}</span>}
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
