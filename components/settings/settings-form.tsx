"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { SimpleSelect } from "@/components/ui/simple-select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  updatePreferences,
  updatePersonalPreferences,
} from "@/app/(app)/settings/actions";
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

// Language used to render dates (month/day names), independent of number format.
const LANGUAGES = [
  { value: "en-GB", label: "English (UK) — 2 August 2026" },
  { value: "en-US", label: "English (US) — August 2, 2026" },
  { value: "es-ES", label: "Español — 2 de agosto de 2026" },
  { value: "ca-ES", label: "Català — 2 d’agost de 2026" },
  { value: "fr-FR", label: "Français — 2 août 2026" },
  { value: "de-DE", label: "Deutsch — 2. August 2026" },
  { value: "it-IT", label: "Italiano — 2 agosto 2026" },
  { value: "pt-PT", label: "Português — 2 de agosto de 2026" },
];

interface SettingsFormProps {
  timezone: string;
  currency: string;
  locale: string;
  language: string;
  /**
   * Personal prefs only (timezone/language/number format — the acting
   * member's own): hides the household currency and submits through the
   * personal action, which any member — including a VIEWER — may call.
   */
  personalOnly?: boolean;
}

export function SettingsForm({
  timezone,
  currency,
  locale,
  language,
  personalOnly = false,
}: SettingsFormProps) {
  const [tz, setTz] = useState(timezone);
  const [curr, setCurr] = useState(currency);
  const [loc, setLoc] = useState(locale);
  const [lang, setLang] = useState(language);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();

    setError(null);
    setSaved(false);

    startTransition(async () => {
      try {
        if (personalOnly) {
          await updatePersonalPreferences({ timezone: tz, locale: loc, language: lang });
        } else {
          await updatePreferences({ timezone: tz, currency: curr, locale: loc, language: lang });
        }
        setSaved(true);
        setTimeout(() => setSaved(false), 3000);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to save");
      }
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Regional preferences</CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-5">
          <div className="space-y-1.5">
            <Label>Timezone</Label>
            <SimpleSelect
              value={tz}
              onValueChange={setTz}
              options={TIMEZONES}
              ariaLabel="Timezone"
              className="w-full"
            />
            <p className="text-xs text-muted-foreground">For transaction dates.</p>
          </div>

          {!personalOnly && (
            <div className="space-y-1.5">
              <Label>Default currency</Label>
              <SimpleSelect
                value={curr}
                onValueChange={setCurr}
                options={CURRENCIES}
                ariaLabel="Default currency"
                className="w-full"
              />
              <p className="text-xs text-muted-foreground">
                For totals; transactions keep their own currency. Shared by the
                whole household.
              </p>
            </div>
          )}

          <div className="space-y-1.5">
            <Label>Language</Label>
            <SimpleSelect
              value={lang}
              onValueChange={setLang}
              options={LANGUAGES}
              ariaLabel="Language"
              className="w-full"
            />
            <p className="text-xs text-muted-foreground">For dates (e.g. 2 August 2026).</p>
          </div>

          <div className="space-y-1.5">
            <Label>Number format</Label>
            <SimpleSelect
              value={loc}
              onValueChange={setLoc}
              options={LOCALES}
              ariaLabel="Number format"
              className="w-full"
            />
            <p className="text-xs text-muted-foreground">Decimal and thousands separators.</p>
          </div>

          <div className="flex items-center gap-3 pt-2">
            <Button type="submit" disabled={isPending}>
              {isPending ? "Saving…" : "Save preferences"}
            </Button>
            {saved && (
              <span className="flex items-center gap-1 text-sm text-success">
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
