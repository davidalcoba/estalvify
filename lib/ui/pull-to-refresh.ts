// Geometry of the pull-to-refresh gesture, kept apart from the hook that runs
// it (`hooks/use-pull-to-refresh.ts`) so the *feel* of the gesture — how far
// the sheet travels for a given finger movement, and when it arms — is plain
// arithmetic that a node test can pin down.

/** How far the sheet has to travel before releasing triggers a refresh. */
export const PULL_THRESHOLD = 64;

/** Where the sheet rests while the refresh is in flight. */
export const PULL_HOLD = 56;

/** Ceiling on the travel, however hard the finger pulls. */
export const PULL_MAX = 120;

/**
 * Finger movement (px) ignored before the pull starts, so a tap with a shaky
 * thumb, or the first pixels of a horizontal swipe, do not drag the page.
 */
export const PULL_SLOP = 8;

/**
 * Rubber band. The sheet follows the finger almost 1:1 at first and then gives
 * progressively less, approaching `max` asymptotically — the same easing a
 * native list bounces with. A linear mapping is the obvious alternative and
 * feels wrong both ways: stiff at the start, and it lets the content slide
 * halfway down the screen if you keep pulling.
 *
 * @param delta Vertical finger travel in px (already past the slop).
 */
export function pullDistance(delta: number, max: number = PULL_MAX): number {
  if (!Number.isFinite(delta) || delta <= 0) return 0;
  return max * (1 - Math.exp(-delta / max));
}

/**
 * 0 → 1 as the sheet travels from resting to armed. Drives the indicator's
 * opacity and the rotation of its arrow, so the gesture says what it is going
 * to do before the finger lifts.
 */
export function pullProgress(distance: number, threshold: number = PULL_THRESHOLD): number {
  if (!Number.isFinite(distance) || distance <= 0) return 0;
  return Math.min(1, distance / threshold);
}
