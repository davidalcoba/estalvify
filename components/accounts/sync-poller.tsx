"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

interface SyncPollerProps {
  /** Pass true whenever at least one connection is in SYNCING status. */
  active: boolean;
  /** Polling interval in ms. Default 3000. */
  intervalMs?: number;
}

/**
 * Invisible client component — polls the server every `intervalMs` by calling
 * router.refresh() while `active` is true. Used to keep the accounts page
 * up-to-date while a bank sync is in progress.
 */
export function SyncPoller({ active, intervalMs = 3000 }: SyncPollerProps) {
  const router = useRouter();

  useEffect(() => {
    if (!active) return;

    const id = setInterval(() => {
      router.refresh();
    }, intervalMs);

    return () => clearInterval(id);
  }, [active, intervalMs, router]);

  return null;
}
