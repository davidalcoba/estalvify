// Offline fallback — served by the service worker when the network is gone.
//
// Deliberately outside the (app) and (auth) route groups: it must render with
// no session, no database and no data fetching, because the SW precaches it at
// install time and serves it while offline. It is also in the public path list
// in proxy.ts, otherwise the precache request would redirect to /login and the
// service worker install would fail.

import type { Metadata } from "next";
import { WifiOff } from "lucide-react";
import { EmptyState } from "@/components/ui/empty-state";

export const metadata: Metadata = {
  title: "Offline",
};

export default function OfflinePage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <EmptyState
        icon={WifiOff}
        title="You're offline"
        description="Estalvify needs a connection. Reconnect and try again."
        className="w-full max-w-md"
      />
    </div>
  );
}
