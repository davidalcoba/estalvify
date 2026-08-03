// Category & rule management for the MCP tools, parameterized by userId
// (the MCP layer authenticates via token, not an Auth.js session, so it can't
// call the server actions in app/(app)/**/actions.ts directly).
//
// Mirrors the semantics of those actions: user-owned scoping, and rule execution
// delegated to lib/rules/apply.ts so both entry points share one engine.

import { prisma } from "@/lib/prisma";
import type { Prisma } from "@/app/generated/prisma";
import type { CategoryKind } from "@/app/generated/prisma";
import { wouldCreateCycle, hasChildren, subtreeIds } from "@/lib/categories/hierarchy";
import type { ConditionGroup } from "@/lib/rules/rule-dto";
import { nextRulePriority, reorderRulesForUser, runRules } from "@/lib/rules/apply";
import type { RuleRunReport } from "@/lib/rules/apply";

async function assertOwnedCategory(userId: string, categoryId: string) {
  const cat = await prisma.category.findUnique({
    where: { id: categoryId },
    select: { userId: true, isActive: true },
  });
  // Own category or a system default (userId null), and active.
  if (!cat || (cat.userId !== null && cat.userId !== userId) || !cat.isActive) {
    throw new Error("Category not found");
  }
}

/** `categoryId → parentId` for every category the user can see. */
async function loadParentMap(userId: string): Promise<Map<string, string | null>> {
  const all = await prisma.category.findMany({
    where: { OR: [{ userId }, { userId: null }] },
    select: { id: true, parentId: true },
  });
  return new Map(all.map((c) => [c.id, c.parentId]));
}

// ── Categories ────────────────────────────────────────────────────────────────

export async function createCategoryForUser(
  userId: string,
  input: { name: string; color?: string; parentId?: string; kind?: CategoryKind },
) {
  const name = input.name.trim();
  if (!name) throw new Error("Name is required");

  if (input.parentId) {
    const parent = await prisma.category.findUnique({
      where: { id: input.parentId },
      select: { userId: true },
    });
    // Subcategory parent must be the user's own category.
    if (!parent || parent.userId !== userId) {
      throw new Error("Parent category not found");
    }
  }

  const last = await prisma.category.findFirst({
    where: { userId, parentId: input.parentId ?? null, isActive: true },
    orderBy: { sortOrder: "desc" },
    select: { sortOrder: true },
  });

  return prisma.category.create({
    data: {
      userId,
      name,
      color: input.color ?? "#6366f1",
      parentId: input.parentId ?? null,
      kind: input.kind ?? "EXPENSE",
      sortOrder: (last?.sortOrder ?? -1) + 1,
    },
    select: { id: true, name: true, color: true, parentId: true, kind: true },
  });
}

export async function updateCategoryForUser(
  userId: string,
  categoryId: string,
  input: {
    name?: string;
    color?: string;
    kind?: CategoryKind;
    /** `null` promotes the category to the top level. Omit to leave it where it is. */
    parentId?: string | null;
  },
) {
  const cat = await prisma.category.findUnique({
    where: { id: categoryId },
    select: { userId: true },
  });
  // Only the user's own categories are editable (system categories are shared).
  if (!cat || cat.userId !== userId) throw new Error("Category not found");

  const data: Prisma.CategoryUpdateInput = {};
  if (input.name !== undefined) {
    const n = input.name.trim();
    if (!n) throw new Error("Name cannot be empty");
    data.name = n;
  }
  if (input.color !== undefined) data.color = input.color;
  if (input.kind !== undefined) data.kind = input.kind;

  if (input.parentId !== undefined) {
    await applyMove(userId, categoryId, input.parentId, data);
  }

  return prisma.category.update({
    where: { id: categoryId },
    data,
    select: { id: true, name: true, color: true, parentId: true, kind: true },
  });
}

/**
 * Validate a re-parent and fold it into the update payload.
 *
 * The schema allows unlimited nesting and nothing used to check any of this,
 * because until now a category could only be parented at creation — where a
 * cycle is impossible. A move can produce one.
 */
async function applyMove(
  userId: string,
  categoryId: string,
  newParentId: string | null,
  data: Prisma.CategoryUpdateInput,
): Promise<void> {
  if (newParentId === categoryId) {
    throw new Error("A category cannot be its own parent");
  }

  const parentOf = await loadParentMap(userId);

  if (wouldCreateCycle(categoryId, newParentId, parentOf)) {
    throw new Error("A category cannot be moved under one of its own subcategories");
  }

  // Two levels is a hard limit in practice: category-select and the settings
  // manager only render parents and their children, so a third level would be
  // invisible in the UI while still counting in the data.
  if (newParentId !== null && hasChildren(categoryId, parentOf)) {
    throw new Error(
      "Move or delete this category's subcategories first — nesting is limited to two levels",
    );
  }

  if (newParentId === null) {
    data.parent = { disconnect: true };
  } else {
    const parent = await prisma.category.findUnique({
      where: { id: newParentId },
      select: { userId: true, parentId: true },
    });
    // Same strict ownership as createCategoryForUser: a subcategory's parent
    // must be the user's own, not a shared system category.
    if (!parent || parent.userId !== userId) {
      throw new Error("Parent category not found");
    }
    if (parent.parentId !== null) {
      throw new Error("Cannot nest under a subcategory — nesting is limited to two levels");
    }
    data.parent = { connect: { id: newParentId } };
  }

  // sortOrder is scoped to the parent, so a move needs the same max+1 the
  // creation path computes — otherwise the category inherits a position that
  // means nothing in its new siblings' ordering.
  const last = await prisma.category.findFirst({
    where: { userId, parentId: newParentId, isActive: true, NOT: { id: categoryId } },
    orderBy: { sortOrder: "desc" },
    select: { sortOrder: true },
  });
  data.sortOrder = (last?.sortOrder ?? -1) + 1;
}

/**
 * Resolve the category ids a `list_transactions` filter should match: the
 * category itself plus, unless the caller opts out, everything below it.
 *
 * Accepts an **inactive** category on purpose. `delete_category` is a soft
 * delete, so transactions keep pointing at a deleted category and are invisible
 * to the categorize inbox — filtering by it is the only way to find them again.
 */
export async function resolveCategoryFilter(
  userId: string,
  categoryId: string,
  includeSubcategories: boolean,
): Promise<{ ids: string[]; name: string; isActive: boolean }> {
  const cat = await prisma.category.findUnique({
    where: { id: categoryId },
    select: { id: true, name: true, userId: true, isActive: true },
  });
  // Own category or a system default (userId null).
  if (!cat || (cat.userId !== null && cat.userId !== userId)) {
    throw new Error("Category not found");
  }

  const ids = includeSubcategories
    ? subtreeIds(cat.id, await loadParentMap(userId))
    : [cat.id];

  return { ids, name: cat.name, isActive: cat.isActive };
}

/**
 * Per-category transaction counts over the same set `list_transactions` returns,
 * which is what makes the category tree auditable: an agent can see the empty
 * categories, the ones holding three rows that should be merged away, and any
 * soft-deleted category still holding transactions.
 *
 * Every visible category is listed, including those with a count of 0 — an empty
 * category is a finding, and it cannot be one if it is missing from the answer.
 */
export async function categoryCountsForUser(
  userId: string,
  transactionWhere: Prisma.TransactionWhereInput,
) {
  const [grouped, cats] = await Promise.all([
    prisma.transactionCategorization.groupBy({
      by: ["categoryId"],
      // A REJECTED categorization is one the user threw back, and the rest of
      // the app reads such a row as uncategorized (buildUncategorizedWhere), so
      // it must not be counted under its category here either.
      where: { transaction: transactionWhere, status: { not: "REJECTED" } },
      _count: { _all: true },
    }),
    prisma.category.findMany({
      where: { OR: [{ userId }, { userId: null }] },
      select: { id: true, name: true, parentId: true, kind: true, isActive: true },
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    }),
  ]);

  const countOf = new Map(grouped.map((g) => [g.categoryId, g._count._all]));
  const nameOf = new Map(cats.map((c) => [c.id, c.name]));

  // An inactive category is listed only while it still holds rows — that is the
  // stranded-transactions case worth seeing, not general noise.
  const rows = cats
    .filter((c) => c.isActive || countOf.has(c.id))
    .map((c) => ({
      categoryId: c.id,
      category: c.name,
      parentId: c.parentId,
      parent: c.parentId ? (nameOf.get(c.parentId) ?? null) : null,
      kind: c.kind,
      count: countOf.get(c.id) ?? 0,
      deleted: c.isActive ? undefined : true,
    }));

  rows.sort((a, b) => b.count - a.count || a.category.localeCompare(b.category));
  return rows;
}

/**
 * Soft-delete one of the user's own categories and its subcategories, the same
 * way the settings UI does (`isActive: false`, rows keep their foreign keys).
 *
 * Two things the UI leaves dangling are handled here, because an agent deleting
 * a category cannot see the consequences the way a person clicking Delete can:
 *
 * - **Categorized transactions.** A soft-deleted category still holds them, and
 *   they are invisible in the app: the categorize inbox only shows rows with no
 *   categorization (or a REJECTED one). Deleting with transactions attached is
 *   therefore refused unless the caller says what should happen to them —
 *   `reassignToCategoryId` to move them, or `force` to strip the categorization
 *   so they return to the inbox.
 * - **Rules targeting it.** `runRules` filters on the rule's own `isActive`, not
 *   on its target category, so a rule pointing at a deleted category would keep
 *   quietly categorizing into it. Those rules are deactivated (reversible with
 *   `update_rule`).
 */
export async function deleteCategoryForUser(
  userId: string,
  categoryId: string,
  options: { reassignToCategoryId?: string; force?: boolean } = {},
) {
  const cat = await prisma.category.findUnique({
    where: { id: categoryId },
    select: { userId: true, name: true, isActive: true },
  });
  // Only the user's own categories are deletable (system defaults are shared).
  if (!cat || cat.userId !== userId) throw new Error("Category not found");
  if (!cat.isActive) throw new Error(`Category "${cat.name}" is already deleted`);

  const ids = subtreeIds(categoryId, await loadParentMap(userId));

  const { reassignToCategoryId, force } = options;
  if (reassignToCategoryId !== undefined) {
    if (ids.includes(reassignToCategoryId)) {
      throw new Error(
        "reassignToCategoryId is the category being deleted (or one of its subcategories)",
      );
    }
    await assertOwnedCategory(userId, reassignToCategoryId);
  }

  const categorizationWhere = {
    categoryId: { in: ids },
    transaction: { userId },
  } as const;

  const [categorized, targetingRules, sourceRules, planItems, recurringSeries, budgetItems] =
    await Promise.all([
      prisma.transactionCategorization.count({ where: categorizationWhere }),
      prisma.categoryRule.findMany({
        where: { userId, categoryId: { in: ids }, isActive: true },
        select: { id: true, name: true },
      }),
      prisma.categoryRule.count({
        where: { userId, sourceCategoryId: { in: ids }, isActive: true },
      }),
      prisma.planItem.count({ where: { userId, categoryId: { in: ids } } }),
      prisma.recurringSeries.count({ where: { userId, categoryId: { in: ids } } }),
      prisma.budgetItem.count({ where: { categoryId: { in: ids }, budget: { userId } } }),
    ]);

  if (categorized > 0 && reassignToCategoryId === undefined && !force) {
    throw new Error(
      `${categorized} transaction(s) are categorized under "${cat.name}"` +
        `${ids.length > 1 ? ` or its ${ids.length - 1} subcategory(ies)` : ""}. ` +
        "Deleting would leave them in a deleted category, where the app cannot show " +
        "them. Pass reassignToCategoryId to move them to another category, or " +
        "force: true to uncategorize them (they go back to the categorize inbox).",
    );
  }

  const moved = await prisma.$transaction(async (tx) => {
    let count = 0;
    if (categorized > 0 && reassignToCategoryId !== undefined) {
      // Same MANUAL/APPROVED semantics as bulkCategorizeForUser — the move is a
      // deliberate user decision, not a suggestion waiting for approval. The old
      // rule link would now point at a rule targeting a different category, so
      // it goes too (with the undo trail), the way deleteRuleForUser detaches.
      ({ count } = await tx.transactionCategorization.updateMany({
        where: categorizationWhere,
        data: {
          categoryId: reassignToCategoryId,
          source: "MANUAL",
          status: "APPROVED",
          approvedAt: new Date(),
          rejectedAt: null,
          categoryRuleId: null,
          previousCategoryId: null,
          previousSource: null,
        },
      }));
    } else if (categorized > 0) {
      ({ count } = await tx.transactionCategorization.deleteMany({
        where: categorizationWhere,
      }));
    }

    if (targetingRules.length > 0) {
      await tx.categoryRule.updateMany({
        where: { id: { in: targetingRules.map((r) => r.id) } },
        data: { isActive: false },
      });
    }

    // Scoped by userId as well: a child of an own category is always own, but
    // this keeps the write unable to touch a shared system category.
    await tx.category.updateMany({
      where: { id: { in: ids }, userId },
      data: { isActive: false },
    });

    return count;
  });

  return {
    id: categoryId,
    name: cat.name,
    deletedCategories: ids.length,
    deletedSubcategories: ids.length - 1,
    transactions:
      reassignToCategoryId !== undefined
        ? { reassignedTo: reassignToCategoryId, count: moved }
        : { uncategorized: moved },
    deactivatedRules: targetingRules,
    // Left alone: these keep referencing the deleted category, and a rule whose
    // source category is gone can no longer match anything (list_rules flags it
    // as neverMatched after its next run).
    stillReferencing: { rulesUsingAsSource: sourceRules, planItems, recurringSeries, budgetItems },
  };
}

// ── Rules ─────────────────────────────────────────────────────────────────────

export async function listRulesForUser(userId: string) {
  // Listed in evaluation order: first in the list runs first.
  const rules = await prisma.categoryRule.findMany({
    where: { userId },
    orderBy: [{ priority: "asc" }, { createdAt: "asc" }],
    select: {
      id: true,
      name: true,
      isActive: true,
      priority: true,
      conditions: true,
      categoryId: true,
      category: { select: { name: true } },
      sourceCategoryId: true,
      sourceCategory: { select: { name: true } },
      matchCount: true,
      lastRunAt: true,
      lastMatchAt: true,
    },
  });
  return rules.map((r) => ({
    id: r.id,
    name: r.name,
    isActive: r.isActive,
    priority: r.priority,
    conditions: r.conditions,
    targetCategoryId: r.categoryId,
    targetCategory: r.category.name,
    sourceCategoryId: r.sourceCategoryId,
    sourceCategory: r.sourceCategory?.name ?? null,
    matchCount: r.matchCount,
    lastRunAt: r.lastRunAt?.toISOString() ?? null,
    lastMatchAt: r.lastMatchAt?.toISOString() ?? null,
    // Surfaces the rule that quietly does nothing.
    neverMatched: r.lastRunAt !== null && r.matchCount === 0,
  }));
}

export async function createRuleForUser(
  userId: string,
  input: {
    name: string;
    conditions: ConditionGroup;
    categoryId: string;
    sourceCategoryId?: string;
    priority?: number;
  },
) {
  await assertOwnedCategory(userId, input.categoryId);
  if (input.sourceCategoryId) await assertOwnedCategory(userId, input.sourceCategoryId);

  return prisma.categoryRule.create({
    data: {
      userId,
      name: input.name.trim(),
      conditions: input.conditions as unknown as Prisma.InputJsonValue,
      categoryId: input.categoryId,
      sourceCategoryId: input.sourceCategoryId ?? null,
      // Default to last, matching the UI: a new rule must not outrank the
      // existing ones just because it was created later.
      priority: input.priority ?? (await nextRulePriority(userId)),
      isActive: true,
    },
    select: { id: true },
  });
}

// Reordering is the same operation the /rules drag-and-drop performs, so the MCP
// layer re-exports the shared helper instead of renumbering on its own.
export { reorderRulesForUser };

export async function updateRuleForUser(
  userId: string,
  ruleId: string,
  input: {
    name?: string;
    conditions?: ConditionGroup;
    categoryId?: string;
    isActive?: boolean;
  },
) {
  const rule = await prisma.categoryRule.findUnique({
    where: { id: ruleId },
    select: { userId: true },
  });
  if (!rule || rule.userId !== userId) throw new Error("Rule not found");
  if (input.categoryId) await assertOwnedCategory(userId, input.categoryId);

  const data: Prisma.CategoryRuleUpdateInput = {};
  if (input.name !== undefined) data.name = input.name.trim();
  if (input.conditions !== undefined)
    data.conditions = input.conditions as unknown as Prisma.InputJsonValue;
  if (input.categoryId !== undefined)
    data.category = { connect: { id: input.categoryId } };
  if (input.isActive !== undefined) data.isActive = input.isActive;
  // Position is not updated here — reorderRulesForUser owns the whole ordering.

  await prisma.categoryRule.update({ where: { id: ruleId }, data });
  return { id: ruleId };
}

/**
 * Execute one rule now. Delegates to the shared engine so MCP and the /rules
 * server actions can't drift apart on precedence or ordering.
 */
export async function runRuleForUser(
  userId: string,
  ruleId: string,
  options: { dryRun?: boolean; force?: boolean } = {},
): Promise<RuleRunReport> {
  const rule = await prisma.categoryRule.findUnique({
    where: { id: ruleId },
    select: { userId: true },
  });
  if (!rule || rule.userId !== userId) throw new Error("Rule not found");
  return runRules(userId, { ruleIds: [ruleId], ...options });
}

export async function runAllRulesForUser(
  userId: string,
  options: { dryRun?: boolean; force?: boolean } = {},
): Promise<RuleRunReport> {
  return runRules(userId, options);
}
