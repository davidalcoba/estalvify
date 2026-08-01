// Connection-status maintenance helpers.

import { prisma } from "@/lib/prisma";
import type { Prisma } from "@/app/generated/prisma";

/**
 * Mark ACTIVE connections whose PSD2 consent has already expired as EXPIRED.
 * This surfaces the Reconnect flow in the UI proactively (without waiting for a
 * sync to 401) and keeps the daily cron from re-syncing dead consents.
 *
 * Pass a `where` narrowing (e.g. `{ userId }`) to scope it; omit for all users.
 * Returns the number of connections transitioned.
 */
export async function expireStaleConsents(
  where: Prisma.BankConnectionWhereInput = {}
): Promise<number> {
  const { count } = await prisma.bankConnection.updateMany({
    where: {
      ...where,
      status: "ACTIVE",
      consentExpiresAt: { not: null, lt: new Date() },
    },
    data: { status: "EXPIRED" },
  });
  return count;
}
