// Pure category-tree checks. No Prisma — the caller loads the parent map and
// this decides, so the rules are unit-testable without a database (same split as
// lib/rules/rule-plan.ts).

/** `categoryId → parentId`, for every category the user can see. */
export type ParentMap = ReadonlyMap<string, string | null>;

/**
 * Would re-parenting `categoryId` under `newParentId` create a cycle?
 *
 * Walks up from the proposed parent; if the moved category appears on that path,
 * the move would detach the subtree from the root and make it unreachable.
 * Moving to the root (`null`) can never cycle.
 *
 * The walk is bounded by the map size so a pre-existing cycle in the data can't
 * hang the request.
 */
export function wouldCreateCycle(
  categoryId: string,
  newParentId: string | null,
  parentOf: ParentMap
): boolean {
  if (newParentId === null) return false;
  if (newParentId === categoryId) return true;

  let cursor: string | null = newParentId;
  for (let steps = 0; cursor !== null && steps <= parentOf.size; steps++) {
    if (cursor === categoryId) return true;
    cursor = parentOf.get(cursor) ?? null;
  }
  return false;
}

/** Depth of a category, counting from 0 at the root. */
export function depthOf(categoryId: string, parentOf: ParentMap): number {
  let depth = 0;
  let cursor = parentOf.get(categoryId) ?? null;
  while (cursor !== null && depth <= parentOf.size) {
    depth++;
    cursor = parentOf.get(cursor) ?? null;
  }
  return depth;
}

/**
 * Does `categoryId` have children?
 *
 * The schema allows unlimited nesting but the pickers and the settings manager
 * only render two levels, so a category with children may not be nested under
 * another — the grandchildren would become invisible.
 */
export function hasChildren(categoryId: string, parentOf: ParentMap): boolean {
  for (const parentId of parentOf.values()) {
    if (parentId === categoryId) return true;
  }
  return false;
}
