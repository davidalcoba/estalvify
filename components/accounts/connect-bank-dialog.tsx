"use client";

// Dialog for connecting a new bank account via Enable Banking OAuth2
// User searches for their bank, clicks Connect, gets redirected to bank auth page

import { useState, useTransition } from "react";
import { Plus, Search, Loader2, Building2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { useHydrated } from "@/lib/use-hydrated";

// Spanish banks available via Enable Banking
// In the future this list can be fetched from /api/banking/banks
const SUPPORTED_BANKS = [
  { name: "Banco Santander", country: "ES", aspspName: "Santander" },
  { name: "BBVA", country: "ES", aspspName: "BBVA" },
  { name: "CaixaBank", country: "ES", aspspName: "CaixaBank" },
  { name: "Banco Sabadell", country: "ES", aspspName: "Sabadell" },
  { name: "Bankinter", country: "ES", aspspName: "Bankinter" },
  { name: "ING España", country: "ES", aspspName: "ING" },
  { name: "Unicaja", country: "ES", aspspName: "Unicaja" },
  { name: "Abanca", country: "ES", aspspName: "Abanca" },
  { name: "Kutxabank", country: "ES", aspspName: "Kutxabank" },
  { name: "Ibercaja", country: "ES", aspspName: "Ibercaja" },
  { name: "N26", country: "ES", aspspName: "N26" },
  { name: "Revolut", country: "ES", aspspName: "Revolut" },
  { name: "Wise", country: "ES", aspspName: "Wise" },
];

export function ConnectBankDialog() {
  const hydrated = useHydrated();
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [isPending, startTransition] = useTransition();
  const [connectingBank, setConnectingBank] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const filtered = SUPPORTED_BANKS.filter((b) =>
    b.name.toLowerCase().includes(search.toLowerCase())
  );

  async function handleConnect(bank: (typeof SUPPORTED_BANKS)[0]) {
    setConnectingBank(bank.aspspName);
    setError(null);

    startTransition(async () => {
      try {
        const response = await fetch("/api/banking/connect", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            aspspName: bank.aspspName,
            aspspCountry: bank.country,
          }),
        });

        const data = await response.json();

        if (!response.ok) {
          setError(data.error ?? "Failed to connect bank");
          setConnectingBank(null);
          return;
        }

        // Redirect user to bank authentication page
        window.location.href = data.url;
      } catch {
        setError("Network error. Please try again.");
        setConnectingBank(null);
      }
    });
  }

  if (!hydrated) {
    return (
      <Button disabled>
        <Plus className="mr-2 h-4 w-4" />
        Connect bank
      </Button>
    );
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <Plus className="mr-2 h-4 w-4" />
          Connect bank
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Connect a bank account</DialogTitle>
          <DialogDescription>
            Search for your bank and you&apos;ll be redirected to authenticate securely.
            We only get read-only access.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Search */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search your bank..."
              className="pl-9"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              autoFocus
            />
          </div>

          {/* Error */}
          {error && (
            <p className="text-sm text-red-600 bg-red-50 rounded-md px-3 py-2">{error}</p>
          )}

          {/* Bank list */}
          <div className="space-y-1 max-h-72 overflow-y-auto">
            {filtered.length === 0 ? (
              <div className="text-center py-8 text-sm text-muted-foreground">
                No banks found for &quot;{search}&quot;
              </div>
            ) : (
              filtered.map((bank) => (
                <button
                  key={bank.aspspName}
                  onClick={() => handleConnect(bank)}
                  disabled={isPending}
                  className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-accent transition-colors text-left disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <div className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center shrink-0">
                    <Building2 className="h-4 w-4 text-slate-500" />
                  </div>
                  <span className="text-sm font-medium">{bank.name}</span>
                  {connectingBank === bank.aspspName && (
                    <Loader2 className="ml-auto h-4 w-4 animate-spin text-indigo-600" />
                  )}
                </button>
              ))
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
