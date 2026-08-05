// Legal pages layout: public, readable prose column, no app shell.
// Used for /privacy and /terms (listed as public paths in proxy.ts).

import Link from "next/link";
import { LogoMark } from "@/components/brand/logo";

export default function LegalLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto max-w-2xl px-6 py-12">
        <Link href="/login" className="mb-8 inline-flex items-center gap-2">
          <LogoMark className="size-8 rounded-lg" />
          <span className="font-semibold tracking-tight">Estalvify</span>
        </Link>
        {children}
      </div>
    </div>
  );
}
