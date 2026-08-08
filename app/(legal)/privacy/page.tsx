// Privacy policy (GDPR arts. 13–14 transparency).
//
// NOTE FOR THE OPERATOR: the text is a working draft written to match what the
// code actually does — review it (ideally with counsel) and fill in the
// controller identity and contact address before opening the app to third
// parties. Keep it in sync with the code: if data handling changes, the
// document changes in the same PR, in ALL THREE languages.
//
// The prose lives in lib/legal/content/<locale>.ts and is rendered by
// components/legal/legal-doc.tsx — see lib/legal/types.ts for why it is not in
// the message dictionaries.

import type { Metadata } from "next";
import { getUiLocale } from "@/lib/i18n/server";
import { legalContent } from "@/lib/legal/content";
import { LegalDocument } from "@/components/legal/legal-doc";

export async function generateMetadata(): Promise<Metadata> {
  const locale = await getUiLocale();
  return { title: legalContent[locale].privacy.title };
}

export default async function PrivacyPage() {
  const locale = await getUiLocale();
  return <LegalDocument doc={legalContent[locale].privacy} />;
}
