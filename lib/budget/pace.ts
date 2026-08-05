// Pace → color tone for the Budget bars. Relative to the month, not
// absolute: a bar is judged against how much of the month has elapsed, with
// slack so being 1 point ahead never cries wolf.
//
// Charges: success on pace, warning ahead of the month, destructive over the
// objective (regardless of the day). Income has inverted polarity and no
// intra-month judgement — salaries land when they land: neutral while
// arriving, success when complete, warning only when the month closed short.
//
// No Prisma — unit-tested in isolation.

export const PACE_SLACK_PCT = 5;

export type ChargeTone = "success" | "warning" | "destructive";
export type IncomeTone = "neutral" | "success" | "warning";

export function chargeTone(
  consumed: number,
  assigned: number,
  elapsedPct: number
): ChargeTone {
  if (consumed > assigned && consumed > 0) return "destructive";
  const consumedPct = assigned > 0 ? (consumed / assigned) * 100 : 0;
  if (consumedPct > elapsedPct + PACE_SLACK_PCT) return "warning";
  return "success";
}

export function incomeTone(
  received: number,
  expected: number,
  /** 0–1 as in MonthStatus.monthElapsed. */
  monthElapsed: number
): IncomeTone {
  if (expected <= 0) return "neutral";
  if (received >= expected - 0.005) return "success";
  if (monthElapsed >= 1) return "warning";
  return "neutral";
}
