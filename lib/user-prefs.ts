import "server-only";
import { cache } from "react";
import { prisma } from "@/lib/prisma";

export interface UserPrefs {
  /** Number format (decimal/thousands separators) for formatCurrency. */
  locale: string;
  /** Language used for date rendering (formatDate), decoupled from number format. */
  language: string;
  currency: string;
  timezone: string;
}

const DEFAULTS: UserPrefs = {
  locale: "es-ES",
  language: "en-GB",
  currency: "EUR",
  timezone: "Europe/Madrid",
};

/**
 * Fetches the regional preferences for a request. This module is THE place
 * that decides which prefs are personal and which are the household's
 * (PLAN_MULTIUSER.md §8):
 *
 *  - `locale`, `language`, `timezone` are PERSONAL — read from the acting
 *    member's row (`actorUserId`), so each member sees dates and numbers
 *    their way.
 *  - `currency` is the HOUSEHOLD's — read from the owner's row
 *    (`dataUserId`); totals must not change currency per member.
 *
 * Callers without a member context (cron, MCP tools) pass only `dataUserId`
 * and get the owner's bundle, which is also the pre-household behavior.
 * Wrapped in React `cache()` so it deduplicates within a single request.
 */
export const getUserPrefs = cache(
  async (dataUserId: string, actorUserId?: string): Promise<UserPrefs> => {
    const personalId = actorUserId ?? dataUserId;
    const ids = personalId === dataUserId ? [dataUserId] : [dataUserId, personalId];
    const rows = await prisma.user.findMany({
      where: { id: { in: ids } },
      select: { id: true, locale: true, language: true, currency: true, timezone: true },
    });
    const owner = rows.find((r) => r.id === dataUserId);
    const actor = rows.find((r) => r.id === personalId);

    return {
      locale: actor?.locale ?? DEFAULTS.locale,
      language: actor?.language ?? DEFAULTS.language,
      currency: owner?.currency ?? DEFAULTS.currency,
      timezone: actor?.timezone ?? DEFAULTS.timezone,
    };
  },
);
