"use client";

// A warning is a FIGURE and an ACTION, not a paragraph.
//
// The first version of these notices spelled the whole thing out — "You have
// 1.045,93 € left to hand out. Give it to a category below, or raise your
// savings target." — which reads fine once and then costs three lines of the
// card forever. Two of them pushed the objectives list below the fold.
//
// So: the amount on the surface, the action next to it, and the sentence
// behind the ⓘ for the one time someone needs it.

import { useState, type ReactNode } from "react";
import { AlertTriangle, Info } from "lucide-react";
import { useT } from "@/components/i18n/i18n-provider";

export function InlineNotice({
  figure,
  detail,
  action,
}: {
  /** The one thing to read: "1.045,93 € unassigned". */
  figure: string;
  /** The explanation, hidden until asked for. */
  detail: string;
  action?: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const t = useT();
  return (
    <div className="rounded-md bg-warning/10 px-3 py-2 text-xs text-warning">
      <div className="flex items-center gap-2">
        <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
        <span className="min-w-0 flex-1 truncate font-semibold tabular-nums">
          {figure}
        </span>
        {action}
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          aria-label={t("notice.whatThisMeans")}
          className="shrink-0 rounded-sm p-0.5 hover:bg-warning/10"
        >
          <Info className="h-3.5 w-3.5" />
        </button>
      </div>
      {open && <p className="mt-1.5 pl-[22px] font-normal">{detail}</p>}
    </div>
  );
}

/** Opens the savings-target editor, which lives two rows up in the same card. */
export function RaiseSavingsAction() {
  const t = useT();
  return (
    <button
      type="button"
      className="shrink-0 font-medium underline underline-offset-2"
      onClick={() => document.getElementById("savings-target-trigger")?.click()}
    >
      {t("plan.adjustSavings")}
    </button>
  );
}
