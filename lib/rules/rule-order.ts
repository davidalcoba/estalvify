// Pure list-order helpers for the rules list. A rule's position in the list *is*
// its precedence — the stored `priority` column is just how that position is
// persisted (0-based, contiguous), never something the user reads or types.
// No React, no Prisma, so both the drag hook and the reorder action share it.

/** Move one item, shifting the rest. Out-of-range or no-op moves return the input. */
export function moveItem<T>(items: readonly T[], from: number, to: number): T[] {
  if (
    from === to ||
    from < 0 ||
    to < 0 ||
    from >= items.length ||
    to >= items.length
  ) {
    return [...items];
  }
  const next = [...items];
  const [moved] = next.splice(from, 1);
  next.splice(to, 0, moved);
  return next;
}

export function isSameOrder(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((id, i) => id === b[i]);
}

/**
 * A reorder must list every rule the user owns exactly once. Anything else is a
 * stale client — a rule created or deleted in another tab — and renumbering from
 * it would silently drop or duplicate positions, so the action rejects it and
 * the UI falls back to the server order.
 */
export function isCompleteOrder(
  orderedIds: readonly string[],
  ownedIds: readonly string[]
): boolean {
  if (orderedIds.length !== ownedIds.length) return false;
  const owned = new Set(ownedIds);
  const seen = new Set<string>();
  for (const id of orderedIds) {
    if (!owned.has(id) || seen.has(id)) return false;
    seen.add(id);
  }
  return true;
}
