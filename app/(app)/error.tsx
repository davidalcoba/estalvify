"use client";

// Route-level error boundary for the authenticated app shell. Without it, any
// thrown server-action or page error fell through to Next's default error
// screen. Logs the error and offers a retry.

import { useEffect } from "react";
import { TriangleAlert } from "lucide-react";
import { EmptyState } from "@/components/ui/empty-state";
import { Button } from "@/components/ui/button";

export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[app] route error:", error);
  }, [error]);

  return (
    <div className="space-y-6">
      <EmptyState
        icon={TriangleAlert}
        title="Something went wrong"
        description="This page hit an unexpected error. You can try again."
      >
        <Button onClick={reset}>Try again</Button>
      </EmptyState>
    </div>
  );
}
