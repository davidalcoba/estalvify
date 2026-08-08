// Terms of service.
//
// NOTE FOR THE OPERATOR: working draft — review with counsel and fill in the
// operator identity before opening the app to third parties. The prose lives
// in lib/legal/content/<locale>.ts; keep all three languages in step.

import type { Metadata } from "next";
import { getUiLocale } from "@/lib/i18n/server";
import { legalContent } from "@/lib/legal/content";
import { LegalDocument } from "@/components/legal/legal-doc";

export async function generateMetadata(): Promise<Metadata> {
  const locale = await getUiLocale();
  return { title: legalContent[locale].terms.title };
}

export default async function TermsPage() {
  const locale = await getUiLocale();
  return <LegalDocument doc={legalContent[locale].terms} />;
}
