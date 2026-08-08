"use client";

// The Provisional badge, tappable. It existed before but explained nothing,
// and "provisional" is not self-evident: the reason is that last month's
// charges can still arrive and land in this month's books.
//
// A tooltip would not do — this screen is read on a phone, and Radix tooltips
// do not open on tap. A toggle keeps the explanation one tap away without
// leaving a permanent paragraph on a card that is mostly numbers.

import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { useT } from "@/components/i18n/i18n-provider";

export function ProvisionalBadge() {
  const [open, setOpen] = useState(false);
  const t = useT();
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="align-middle"
      >
        <Badge variant="secondary" className="cursor-pointer text-xs">
          {t("progress.provisional")}
        </Badge>
      </button>
      {open && (
        <p className="mt-2 text-xs font-normal text-muted-foreground">
          {t("progress.provisional.detail")}
        </p>
      )}
    </>
  );
}
