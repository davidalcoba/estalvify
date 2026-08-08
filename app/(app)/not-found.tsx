// Not-found boundary for the authenticated app shell.

import Link from "next/link";
import { Home } from "lucide-react";
import { EmptyState } from "@/components/ui/empty-state";
import { Button } from "@/components/ui/button";
import { getT } from "@/lib/i18n/server";

export default async function NotFound() {
  const t = await getT();

  return (
    <div className="space-y-6">
      <EmptyState
        icon={Home}
        title={t("notFound.title")}
        description={t("notFound.body")}
      >
        <Button asChild>
          <Link href="/dashboard">{t("error.backToDashboard")}</Link>
        </Button>
      </EmptyState>
    </div>
  );
}
