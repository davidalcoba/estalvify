// Which greeting the daily screen opens with.
//
// It used to be one fixed string, so the app said "Buenos días" at 16:03 —
// which is how this was found: a user screenshotted their own dashboard to
// complain about something else. A greeting that is wrong two thirds of the
// day is the first thing on the screen and the first thing that reads as
// unmaintained.
//
// Three bands, cut where SPANISH and CATALAN cut them — they are the
// languages with hard boundaries here: `tarde` starts at lunch, not at noon,
// and `noche` around 21h. English has no equally sharp lines, so it takes the
// same cuts ("Good afternoon" at 14h and "Good evening" from 21h are both
// natural), and the small hours fold into `evening` because "Good night" in
// English is a farewell, not a greeting.
//
// Pure, so the bands are unit-tested instead of discovered in production.

export type GreetingBand = "morning" | "afternoon" | "evening";

/** `hour` is 0–23 in the member's own timezone. */
export function greetingBand(hour: number): GreetingBand {
  // The night band is tested FIRST because it is the one that wraps midnight;
  // written as a fallthrough it swallowed 00:00–05:59 into the afternoon.
  if (hour >= 21 || hour < 6) return "evening";
  if (hour < 14) return "morning";
  return "afternoon";
}

/**
 * The hour (0–23) it is right now where the member lives. Their timezone, not
 * the server's and not the browser's — it is a stored preference, so the
 * greeting matches the clock the rest of the app already dates things by.
 */
export function hourInTimezone(timezone: string, now: Date = new Date()): number {
  return Number(
    new Intl.DateTimeFormat("en-GB", {
      timeZone: timezone,
      hour: "2-digit",
      // h23 rather than `hour12: false`: some ICU builds render midnight as
      // "24" under the latter, which would land in the wrong band.
      hourCycle: "h23",
    }).format(now)
  );
}
