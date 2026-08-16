// What is about to leave the account, for the daily screen.
//
// The dashboard's weekly figure is an allowance, and an allowance says nothing
// on its own: 47 € to spend until Sunday means one thing with the month's
// charges already paid and quite another with 600 € of them landing on Friday.
// This is the missing half — the next planned items, in order, with what is
// still to go out.
//
// The selection is pure and unit-tested; only `buildUpcoming` touches Prisma.
// It reads plannedItem rows, which the dashboard's own `syncPlannedState` call
// already generates and matches — the step that screen skips
// (`refreshSchedule`) writes RecurringSeries fields nothing here reads, so
// this card costs exactly one query and no extra sync.

const round = (n: number) => Math.round(n * 100) / 100;

export type UpcomingStatus = "PENDING" | "MATCHED" | "MISSED";
export type UpcomingDirection = "CREDIT" | "DEBIT";

export interface UpcomingSource {
  id: string;
  description: string;
  direction: UpcomingDirection;
  amount: number;
  matchedAmount: number | null;
  status: UpcomingStatus;
  /** The first day of the item's window, YYYY-MM-DD. */
  date: string;
  /** The last day of its window; equal to `date` for a fixed due day. */
  endDate: string;
  fromSeries: boolean;
}

export interface UpcomingRow extends UpcomingSource {
  /** Days from today. Negative for a window that has already closed. */
  daysAway: number;
  /** The amount to show: what actually arrived, once something has. */
  shownAmount: number;
}

export interface Upcoming {
  /** What is coming (and what has just settled), soonest first. */
  rows: UpcomingRow[];
  /**
   * Windows that closed with nothing matched. Kept OUT of `rows` rather than
   * sorted into them: the list is ordered future-first, which pushed the one
   * row that asks for an action down past the card's row limit and out of
   * sight. It gets its own line instead.
   */
  missed: UpcomingRow[];
  /** Σ of the DEBIT items still pending in the window — what is left to leave. */
  pendingOut: number;
  /** Σ of the CREDIT items still pending. */
  pendingIn: number;
  horizonDays: number;
  /** Last day covered, YYYY-MM-DD. */
  until: string;
}

const dayMs = 86_400_000;

/** Whole days between two YYYY-MM-DD dates, positive when `date` is later. */
export function daysBetween(from: string, date: string): number {
  return Math.round((Date.parse(date) - Date.parse(from)) / dayMs);
}

export function addDays(date: string, days: number): string {
  return new Date(Date.parse(date) + days * dayMs).toISOString().slice(0, 10);
}

/**
 * The window is forward-looking, with one exception: an item whose window has
 * already closed unmatched (MISSED) stays for a few days, because it is the
 * one row on the card that asks for an action. A charge that simply arrived is
 * kept while its window is still open — seeing it settled is what tells you it
 * is off the list — and drops out once the window passes.
 */
export function selectUpcoming(
  source: UpcomingSource[],
  today: string,
  options: { horizonDays?: number; missedGraceDays?: number; limit?: number } = {}
): Upcoming {
  const horizonDays = options.horizonDays ?? 14;
  const missedGraceDays = options.missedGraceDays ?? 7;
  const until = addDays(today, horizonDays);
  const missedFrom = addDays(today, -missedGraceDays);

  const rows = source
    .filter((item) => {
      if (item.status === "MISSED") return item.endDate >= missedFrom && item.date <= until;
      // Everything else is judged on its window: still open, or yet to open.
      return item.endDate >= today && item.date <= until;
    })
    .map((item) => ({
      ...item,
      daysAway: daysBetween(today, item.date),
      shownAmount:
        item.status === "MATCHED" && item.matchedAmount != null
          ? item.matchedAmount
          : item.amount,
    }))
    // The future is the card; the past is a footnote. Sorting by date alone
    // opened the card on a charge already paid days ago, which is the one
    // thing on it that needs no attention — so anything whose day has gone
    // sinks below what is still to come, and only then by date.
    .sort(
      (a, b) =>
        Number(a.daysAway < 0) - Number(b.daysAway < 0) ||
        a.date.localeCompare(b.date) ||
        a.description.localeCompare(b.description)
    );

  let pendingOut = 0;
  let pendingIn = 0;
  for (const row of rows) {
    if (row.status !== "PENDING") continue;
    if (row.direction === "DEBIT") pendingOut += row.amount;
    else pendingIn += row.amount;
  }

  const coming = rows.filter((r) => r.status !== "MISSED");

  return {
    rows: options.limit ? coming.slice(0, options.limit) : coming,
    missed: rows.filter((r) => r.status === "MISSED"),
    pendingOut: round(pendingOut),
    pendingIn: round(pendingIn),
    horizonDays,
    until,
  };
}
