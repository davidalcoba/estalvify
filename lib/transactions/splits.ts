// Pure split-line validation and math. The action enforces these before
// writing; the dialog uses them to disable Save until the lines add up.

const round = (n: number) => Math.round(n * 100) / 100;

export interface SplitLineInput {
  amount: number; // absolute
  categoryId: string | null;
  note?: string | null;
  isExtraordinary?: boolean;
}

export const MAX_SPLIT_LINES = 20;

/**
 * Validate a set of split lines against the parent transaction's absolute
 * amount. Returns an error message, or null when valid. Cent-exact: the lines
 * must reconstruct the parent completely — a partial breakdown keeps its
 * remainder as an explicit uncategorized line, so nothing silently vanishes.
 */
export function validateSplitLines(
  parentAmount: number,
  lines: SplitLineInput[]
): string | null {
  if (lines.length < 2) return "A split needs at least 2 lines";
  if (lines.length > MAX_SPLIT_LINES) return `At most ${MAX_SPLIT_LINES} lines`;
  for (const line of lines) {
    if (!Number.isFinite(line.amount) || line.amount <= 0) {
      return "Every line needs a positive amount";
    }
  }
  const total = round(lines.reduce((sum, l) => sum + l.amount, 0));
  const parent = round(Math.abs(parentAmount));
  if (total !== parent) {
    return `Lines must add up to the transaction amount (${total} ≠ ${parent})`;
  }
  return null;
}

/** What is still unallocated while editing (never negative rounding dust). */
export function splitRemainder(parentAmount: number, lines: SplitLineInput[]): number {
  const total = lines.reduce(
    (sum, l) => sum + (Number.isFinite(l.amount) ? l.amount : 0),
    0
  );
  return round(Math.abs(parentAmount) - total);
}
