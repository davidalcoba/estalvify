// What Estalvify does, for someone standing at the door.
//
// Every line here is a claim about a real, shipped capability and is written
// from `ai-instructions/context/PROJECT_OVERVIEW.md` — the read-only PSD2 sync
// through Enable Banking, the user's own categorization rules, and the 60-day
// balance projection. Nothing aspirational, no certifications we do not hold,
// no numbers we cannot stand behind: this is the screen where a person decides
// whether to hand us their bank data.

import { Landmark, Tags, TrendingUp } from "lucide-react";
import { cn } from "@/lib/utils";
import { getT } from "@/lib/i18n/server";
import type { MessageKey } from "@/lib/i18n/dictionaries/en";

const POINTS: { icon: typeof Landmark; title: MessageKey; body: MessageKey }[] = [
  { icon: Landmark, title: "auth.login.point.banks.title", body: "auth.login.point.banks.body" },
  { icon: Tags, title: "auth.login.point.rules.title", body: "auth.login.point.rules.body" },
  { icon: TrendingUp, title: "auth.login.point.plan.title", body: "auth.login.point.plan.body" },
];

export async function ProductPoints({ className }: { className?: string }) {
  const t = await getT();

  return (
    <ul className={cn("grid gap-5", className)}>
      {POINTS.map(({ icon: Icon, title, body }) => (
        <li key={title} className="flex gap-3">
          <span className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-lg bg-brand/10 text-brand">
            <Icon className="size-[18px]" />
          </span>
          <div className="min-w-0 space-y-0.5">
            <p className="text-sm font-medium text-foreground">{t(title)}</p>
            <p className="text-sm text-muted-foreground">{t(body)}</p>
          </div>
        </li>
      ))}
    </ul>
  );
}
