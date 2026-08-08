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
import { useT } from "@/components/i18n/i18n-provider";

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

// THE language setting: it picks the interface language AND the language dates
// are rendered in (lib/i18n/locales.ts maps the tag onto a translation).
//
// `translated: false` marks the tags the app itself is not translated into.
// They stay on the list because they still change how dates read, and dropping
// them would silently reformat the dates of anyone who had chosen one — but the
// option says so, rather than letting the user pick "Français" and wonder why
// the buttons are still English.
const LANGUAGES = [
  { value: "en-GB", label: "English (UK) — 2 August 2026", translated: true },
  { value: "en-US", label: "English (US) — August 2, 2026", translated: true },
  { value: "es-ES", label: "Español — 2 de agosto de 2026", translated: true },
  { value: "ca-ES", label: "Català — 2 d’agost de 2026", translated: true },
  { value: "fr-FR", label: "Français — 2 août 2026", translated: false },
  { value: "de-DE", label: "Deutsch — 2. August 2026", translated: false },
  { value: "it-IT", label: "Italiano — 2 agosto 2026", translated: false },
  { value: "pt-PT", label: "Português — 2 de agosto de 2026", translated: false },
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
  const t = useT();

  // The language options are literal endonyms — "Català" is Català in every
  // language — so only the "not translated" note follows the UI locale.
  const languageOptions = LANGUAGES.map((l) => ({
    value: l.value,
    label: l.translated ? l.label : `${l.label} (${t("settings.language.datesOnly")})`,
  }));

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
        setError(err instanceof Error ? err.message : t("settings.saveFailed"));
      }
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("settings.regional.title")}</CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-5">
          <div className="space-y-1.5">
            <Label>{t("settings.timezone.label")}</Label>
            <SimpleSelect
              value={tz}
              onValueChange={setTz}
              options={TIMEZONES}
              ariaLabel={t("settings.timezone.label")}
              className="w-full"
            />
            <p className="text-xs text-muted-foreground">{t("settings.timezone.help")}</p>
          </div>

          {!personalOnly && (
            <div className="space-y-1.5">
              <Label>{t("settings.currency.label")}</Label>
              <SimpleSelect
                value={curr}
                onValueChange={setCurr}
                options={CURRENCIES}
                ariaLabel={t("settings.currency.label")}
                className="w-full"
              />
              <p className="text-xs text-muted-foreground">
                {t("settings.currency.help")}
              </p>
            </div>
          )}

          <div className="space-y-1.5">
            <Label>{t("settings.language.label")}</Label>
            <SimpleSelect
              value={lang}
              onValueChange={setLang}
              options={languageOptions}
              ariaLabel={t("settings.language.label")}
              className="w-full"
            />
            <p className="text-xs text-muted-foreground">{t("settings.language.help")}</p>
          </div>

          <div className="space-y-1.5">
            <Label>{t("settings.numberFormat.label")}</Label>
            <SimpleSelect
              value={loc}
              onValueChange={setLoc}
              options={LOCALES}
              ariaLabel={t("settings.numberFormat.label")}
              className="w-full"
            />
            <p className="text-xs text-muted-foreground">{t("settings.numberFormat.help")}</p>
          </div>

          <div className="flex items-center gap-3 pt-2">
            <Button type="submit" disabled={isPending}>
              {isPending ? t("common.saving") : t("settings.savePreferences")}
            </Button>
            {saved && (
              <span className="flex items-center gap-1 text-sm text-success">
                <Check className="h-4 w-4" />
                {t("common.saved")}
              </span>
            )}
            {error && <span className="text-sm text-destructive">{error}</span>}
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
