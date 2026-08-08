"use client";

import { useState, useTransition } from "react";
import { Sparkles, Info, AlertTriangle, AlertCircle, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { generateInsights, type InsightsResult } from "@/app/(app)/insights/actions";
import type { RecommendationSeverity } from "@/lib/ai";
import { useT } from "@/components/i18n/i18n-provider";

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
  const t = useT();
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<InsightsResult | null>(null);

  function onGenerate() {
    startTransition(async () => {
      try {
        setResult(await generateInsights());
      } catch {
        setResult({ status: "error", message: t("insights.failed") });
      }
    });
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="max-w-prose text-sm text-muted-foreground">{t("insights.intro")}</p>
        <Button onClick={onGenerate} disabled={pending}>
          <Sparkles className="mr-2 h-4 w-4" />
          {pending
            ? t("insights.analyzing")
            : result?.status === "ok"
              ? t("insights.regenerate")
              : t("insights.generate")}
        </Button>
      </div>

      {result === null && !pending && (
        <EmptyState
          icon={Sparkles}
          title={t("insights.empty.title")}
          description={t("insights.empty.body")}
        />
      )}

      {result?.status === "empty" && (
        <EmptyState
          icon={Sparkles}
          title={t("insights.notEnough.title")}
          description={t("insights.notEnough.body")}
        />
      )}

      {result?.status === "not_configured" && (
        <EmptyState
          icon={ShieldCheck}
          title={t("insights.notConfigured")}
          description={result.message}
        />
      )}

      {result?.status === "error" && (
        <EmptyState
          icon={AlertCircle}
          title={t("common.error")}
          description={result.message}
        />
      )}

      {result?.status === "ok" && (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
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
