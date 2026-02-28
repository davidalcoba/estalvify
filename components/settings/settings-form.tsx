"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { updatePreferences } from "@/app/(app)/settings/actions";
import { Check } from "lucide-react";

const TIMEZONES = [
  { value: "UTC", label: "UTC" },
  { value: "Europe/Madrid", label: "Europe/Madrid" },
  { value: "Europe/London", label: "Europe/London" },
  { value: "Europe/Paris", label: "Europe/Paris" },
  { value: "Europe/Berlin", label: "Europe/Berlin" },
  { value: "Europe/Rome", label: "Europe/Rome" },
  { value: "Europe/Lisbon", label: "Europe/Lisbon" },
  { value: "Europe/Amsterdam", label: "Europe/Amsterdam" },
  { value: "Europe/Stockholm", label: "Europe/Stockholm" },
  { value: "America/New_York", label: "America/New York" },
  { value: "America/Chicago", label: "America/Chicago" },
  { value: "America/Denver", label: "America/Denver" },
  { value: "America/Los_Angeles", label: "America/Los Angeles" },
  { value: "America/Sao_Paulo", label: "America/São Paulo" },
  { value: "America/Mexico_City", label: "America/Mexico City" },
  { value: "Asia/Tokyo", label: "Asia/Tokyo" },
  { value: "Asia/Shanghai", label: "Asia/Shanghai" },
  { value: "Asia/Dubai", label: "Asia/Dubai" },
  { value: "Australia/Sydney", label: "Australia/Sydney" },
];

const CURRENCIES = [
  { value: "EUR", label: "EUR — Euro" },
  { value: "USD", label: "USD — US Dollar" },
  { value: "GBP", label: "GBP — British Pound" },
  { value: "CHF", label: "CHF — Swiss Franc" },
  { value: "JPY", label: "JPY — Japanese Yen" },
  { value: "CAD", label: "CAD — Canadian Dollar" },
  { value: "AUD", label: "AUD — Australian Dollar" },
  { value: "BRL", label: "BRL — Brazilian Real" },
  { value: "CNY", label: "CNY — Chinese Yuan" },
  { value: "MXN", label: "MXN — Mexican Peso" },
  { value: "SEK", label: "SEK — Swedish Krona" },
  { value: "NOK", label: "NOK — Norwegian Krone" },
  { value: "DKK", label: "DKK — Danish Krone" },
  { value: "PLN", label: "PLN — Polish Złoty" },
  { value: "CZK", label: "CZK — Czech Koruna" },
];

const LOCALES = [
  { value: "es-ES", label: "Español (España) — 1.234,56 €" },
  { value: "ca-ES", label: "Català (Espanya) — 1.234,56 €" },
  { value: "es-MX", label: "Español (México) — $1,234.56" },
  { value: "en-US", label: "English (US) — $1,234.56" },
  { value: "en-GB", label: "English (UK) — £1,234.56" },
  { value: "fr-FR", label: "Français (France) — 1 234,56 €" },
  { value: "de-DE", label: "Deutsch (Deutschland) — 1.234,56 €" },
  { value: "it-IT", label: "Italiano (Italia) — 1.234,56 €" },
  { value: "pt-PT", label: "Português (Portugal) — 1 234,56 €" },
  { value: "pt-BR", label: "Português (Brasil) — R$ 1.234,56" },
];

interface SettingsFormProps {
  timezone: string;
  currency: string;
  locale: string;
}

export function SettingsForm({ timezone, currency, locale }: SettingsFormProps) {
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);

    setError(null);
    setSaved(false);

    startTransition(async () => {
      try {
        await updatePreferences({
          timezone: fd.get("timezone") as string,
          currency: fd.get("currency") as string,
          locale: fd.get("locale") as string,
        });
        setSaved(true);
        setTimeout(() => setSaved(false), 3000);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to save");
      }
    });
  }

  const selectClass =
    "h-9 w-full rounded-md border border-input bg-background px-3 text-sm text-foreground shadow-sm focus:outline-none focus:ring-1 focus:ring-ring";

  return (
    <Card>
      <CardHeader>
        <CardTitle>Regional preferences</CardTitle>
        <CardDescription>
          Controls how dates, times, and amounts are displayed throughout the app.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-5">
          <div className="space-y-1.5">
            <Label htmlFor="timezone">Timezone</Label>
            <select id="timezone" name="timezone" defaultValue={timezone} className={selectClass}>
              {TIMEZONES.map((tz) => (
                <option key={tz.value} value={tz.value}>
                  {tz.label}
                </option>
              ))}
            </select>
            <p className="text-xs text-muted-foreground">Used to display transaction booking dates correctly.</p>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="currency">Default currency</Label>
            <select id="currency" name="currency" defaultValue={currency} className={selectClass}>
              {CURRENCIES.map((c) => (
                <option key={c.value} value={c.value}>
                  {c.label}
                </option>
              ))}
            </select>
            <p className="text-xs text-muted-foreground">Used for totals and summaries. Individual transactions always show in their own currency.</p>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="locale">Number format</Label>
            <select id="locale" name="locale" defaultValue={locale} className={selectClass}>
              {LOCALES.map((l) => (
                <option key={l.value} value={l.value}>
                  {l.label}
                </option>
              ))}
            </select>
            <p className="text-xs text-muted-foreground">Controls decimal separators and thousands grouping.</p>
          </div>

          <div className="flex items-center gap-3 pt-2">
            <Button type="submit" disabled={isPending}>
              {isPending ? "Saving…" : "Save preferences"}
            </Button>
            {saved && (
              <span className="flex items-center gap-1 text-sm text-green-600">
                <Check className="h-4 w-4" />
                Saved
              </span>
            )}
            {error && <span className="text-sm text-destructive">{error}</span>}
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
