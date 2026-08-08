import type { UiLocale } from "@/lib/i18n/locales";
import type { LegalContent } from "../types";
import { en } from "./en";
import { es } from "./es";
import { ca } from "./ca";

export const legalContent: Record<UiLocale, LegalContent> = { en, es, ca };
