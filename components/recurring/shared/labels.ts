import type { Cadence } from "@/lib/recurring/detect";
import type { RecurringCadence } from "@/app/generated/prisma";

// Display labels for cadences. Detection only emits the four regular buckets;
// the wider RecurringCadence type (incl. IRREGULAR) is covered for completeness.
export const cadenceLabel: Record<RecurringCadence, string> = {
  WEEKLY: "Weekly",
  MONTHLY: "Monthly",
  QUARTERLY: "Quarterly",
  YEARLY: "Yearly",
  IRREGULAR: "Irregular",
};

export function cadenceAdverb(cadence: Cadence): string {
  return cadenceLabel[cadence].toLowerCase();
}
