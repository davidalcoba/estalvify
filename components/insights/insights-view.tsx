"use client";

import { useState, useTransition } from "react";
import { Sparkles, Info, AlertTriangle, AlertCircle, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { generateInsights, type InsightsResult } from "@/app/(app)/insights/actions";
import type { RecommendationSeverity } from "@/lib/ai";

const severityIcon = {
  info: Info,
  warning: AlertTriangle,
  alert: AlertCircle,
} as const;

const severityColor: Record<RecommendationSeverity, string> = {
  info: "text-muted-foreground",
  warning: "text-warning",
  alert: "text-destructive",
};

export function InsightsView() {
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<InsightsResult | null>(null);

  function onGenerate() {
    startTransition(async () => {
      try {
        setResult(await generateInsights());
      } catch {
        setResult({ status: "error", message: "Couldn't generate insights right now." });
      }
    });
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="max-w-prose text-sm text-muted-foreground">
          Get personalized suggestions based on your spending, budgets, recurring payments
          and forecast. Only anonymized totals and category names are sent — never your raw
          transactions.
        </p>
        <Button onClick={onGenerate} disabled={pending}>
          <Sparkles className="mr-2 h-4 w-4" />
          {pending ? "Analyzing…" : result?.status === "ok" ? "Regenerate" : "Generate insights"}
        </Button>
      </div>

      {result === null && !pending && (
        <EmptyState
          icon={Sparkles}
          title="No insights yet"
          description="Generate AI recommendations tailored to your finances. You can regenerate anytime as your data changes."
        />
      )}

      {result?.status === "empty" && (
        <EmptyState
          icon={Sparkles}
          title="Not enough data yet"
          description="Connect a bank account and categorize some transactions, then come back to generate insights."
        />
      )}

      {result?.status === "not_configured" && (
        <EmptyState icon={ShieldCheck} title="AI insights not configured" description={result.message} />
      )}

      {result?.status === "error" && (
        <EmptyState icon={AlertCircle} title="Something went wrong" description={result.message} />
      )}

      {result?.status === "ok" && (
        <div className="grid gap-3 md:grid-cols-2">
          {result.recommendations.map((rec, i) => {
            const Icon = severityIcon[rec.severity];
            return (
              <Card key={i}>
                <CardContent className="space-y-2">
                  <div className="flex items-start gap-2">
                    <Icon className={`mt-0.5 h-4 w-4 shrink-0 ${severityColor[rec.severity]}`} />
                    <p className="flex-1 text-sm font-medium">{rec.title}</p>
                    {rec.category && (
                      <Badge variant="outline" className="shrink-0">
                        {rec.category}
                      </Badge>
                    )}
                  </div>
                  <p className="text-sm text-muted-foreground">{rec.body}</p>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
