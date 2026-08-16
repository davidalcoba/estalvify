// The one query behind the dashboard's "Next charges" card.
//
// Kept apart from `upcoming.ts` so the selection stays pure and node-testable:
// importing Prisma there would drag `DATABASE_URL` into the unit tests. Same
// split as `lib/analytics/cashflow.ts` vs `cashflow-data.ts`.

import "server-only";

import { prisma } from "@/lib/prisma";
import { resolveWindow, isoDate } from "./schedule";
import {
  addDays,
  selectUpcoming,
  type Upcoming,
  type UpcomingSource,
} from "./upcoming";

/** The (year, month) pairs a date range touches — usually two, never many. */
function monthsSpanned(from: string, to: string): { year: number; month: number }[] {
  const [fy, fm] = from.split("-").map(Number);
  const [ty, tm] = to.split("-").map(Number);
  const months: { year: number; month: number }[] = [];
  for (let zero = fy * 12 + (fm - 1); zero <= ty * 12 + (tm - 1); zero++) {
    months.push({ year: Math.floor(zero / 12), month: (zero % 12) + 1 });
  }
  return months;
}

export async function buildUpcoming(
  userId: string,
  today: string,
  options: { horizonDays?: number; missedGraceDays?: number; limit?: number } = {}
): Promise<Upcoming> {
  const horizonDays = options.horizonDays ?? 14;
  const missedGraceDays = options.missedGraceDays ?? 7;
  const months = monthsSpanned(addDays(today, -missedGraceDays), addDays(today, horizonDays));

  const planned = await prisma.plannedItem.findMany({
    where: { userId, OR: months.map((m) => ({ year: m.year, month: m.month })) },
    select: {
      id: true,
      description: true,
      direction: true,
      amount: true,
      matchedAmount: true,
      status: true,
      year: true,
      month: true,
      dueDay: true,
      windowFromDay: true,
      windowToDay: true,
      anchorMonthEnd: true,
      recurringSeriesId: true,
    },
  });

  const source: UpcomingSource[] = planned.map((p) => {
    const ym = { year: p.year, month: p.month };
    // A fixed due day is its own window; anything else resolves the series'.
    const window =
      p.dueDay != null && !p.anchorMonthEnd
        ? { fromDay: p.dueDay, toDay: p.dueDay }
        : resolveWindow(p, ym);
    return {
      id: p.id,
      description: p.description,
      direction: p.direction as UpcomingSource["direction"],
      amount: Number(p.amount.toString()),
      matchedAmount: p.matchedAmount ? Number(p.matchedAmount.toString()) : null,
      status: p.status as UpcomingSource["status"],
      date: isoDate(ym, window.fromDay),
      endDate: isoDate(ym, window.toDay),
      fromSeries: p.recurringSeriesId !== null,
    };
  });

  return selectUpcoming(source, today, { horizonDays, missedGraceDays, limit: options.limit });
}
