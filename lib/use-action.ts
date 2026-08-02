"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
import { beginActivity } from "@/lib/pending-activity";

const NONE: ReadonlySet<string> = new Set<string>();

export interface ActionRunner {
  /** Runs `action` in a transition, tagged with `key` so its control can react. */
  run: (key: string, action: () => Promise<unknown> | void) => void;
  /** True while any action started through this runner is in flight. */
  pending: boolean;
  /** True while the action started under `key` is in flight. */
  busy: (key: string) => boolean;
}

/**
 * Runs server actions with feedback attached, so a write is never silent.
 *
 * Two things happen on every call:
 * - the shell's progress bar moves for as long as the work lasts, and
 * - the control that started it can show a spinner, matched by its `key`.
 *
 * The transition — not the promise — decides when the work is over, so the
 * feedback also covers the `router.refresh()` that usually follows a write.
 * That refresh is exactly the stretch where the app used to look frozen.
 *
 * Keys are caller-chosen and only need to be unique within one component, e.g.
 * `` `${item.id}:confirm` ``.
 */
export function useAction(): ActionRunner {
  const [pending, startTransition] = useTransition();
  const [keys, setKeys] = useState<ReadonlySet<string>>(NONE);

  // Safety net: never leave a control spinning once the transition settles.
  useEffect(() => {
    if (!pending) setKeys((prev) => (prev.size === 0 ? prev : NONE));
  }, [pending]);

  useEffect(() => {
    if (!pending) return;
    return beginActivity();
  }, [pending]);

  const run = useCallback<ActionRunner["run"]>((key, action) => {
    setKeys((prev) => new Set(prev).add(key));
    startTransition(async () => {
      try {
        await action();
      } finally {
        // Cleared inside the transition, so the key drops when the refreshed
        // UI commits rather than the moment the promise resolves.
        setKeys((prev) => {
          if (!prev.has(key)) return prev;
          const next = new Set(prev);
          next.delete(key);
          return next;
        });
      }
    });
  }, []);

  const busy = useCallback((key: string) => keys.has(key), [keys]);

  return { run, pending, busy };
}
