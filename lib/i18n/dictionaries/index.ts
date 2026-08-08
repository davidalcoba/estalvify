// The locale → messages map. Imported by SERVER code only (and by the one
// server component that mounts the client provider), so a client bundle never
// pulls in all three dictionaries: the provider receives the active locale's
// messages as a serialized prop instead.

import type { UiLocale } from "../locales";
import { en, type Dictionary } from "./en";
import { es } from "./es";
import { ca } from "./ca";

export const dictionaries: Record<UiLocale, Dictionary> = { en, es, ca };

export type { Dictionary, MessageKey, PluralBase } from "./en";
export { en, es, ca };
