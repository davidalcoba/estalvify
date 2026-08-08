"use client";

// Count badge on a sidebar nav item, fed by a promise the shell has not
// awaited.
//
// The point is what does *not* happen: the app shell used to await three
// database queries before rendering anything, so opening the installed app on
// a cold start showed a blank screen until they all came back. The layout now
// hands the promise straight through and this suspends on its own, letting the
// sidebar paint immediately with the badge arriving a moment later.

import { use } from "react";
import { Badge } from "@/components/ui/badge";

export function PendingBadge({ count }: { count: Promise<number> }) {
  const pending = use(count);
  if (pending <= 0) return null;

  return (
    <Badge variant="brand" className="ml-auto h-5 min-w-5 px-1 text-xs">
      {pending > 99 ? "99+" : pending}
    </Badge>
  );
}
