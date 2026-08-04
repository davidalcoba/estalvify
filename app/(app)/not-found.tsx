// Not-found boundary for the authenticated app shell.

import Link from "next/link";
import { Home } from "lucide-react";
import { EmptyState } from "@/components/ui/empty-state";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <div className="space-y-6">
      <EmptyState
        icon={Home}
        title="Page not found"
        description="That page doesn't exist or has moved."
      >
        <Button asChild>
          <Link href="/dashboard">Back to dashboard</Link>
        </Button>
      </EmptyState>
    </div>
  );
}
