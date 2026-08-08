"use client";

// Route-level error boundary for the authenticated app shell. Without it, any
// thrown server-action or page error fell through to Next's default error
// screen. Logs the error and offers a retry.

import { useEffect } from "react";
import { TriangleAlert } from "lucide-react";
import { EmptyState } from "@/components/ui/empty-state";
import { Button } from "@/components/ui/button";
import { useT } from "@/components/i18n/i18n-provider";

export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const t = useT();

  useEffect(() => {
    console.error("[app] route error:", error);
  }, [error]);

  return (
    <div className="space-y-6">
      <EmptyState
        icon={TriangleAlert}
        title={t("error.title")}
        description={t("error.pageBody")}
      >
        <Button onClick={reset}>{t("common.retry")}</Button>
      </EmptyState>
    </div>
  );
}
