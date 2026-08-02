// Category & rule management for the MCP tools, parameterized by userId
// (the MCP layer authenticates via token, not an Auth.js session, so it can't
// call the server actions in app/(app)/**/actions.ts directly).
//
// Mirrors the semantics of those actions: user-owned scoping, rule conditions
// applied via buildRuleWhereClause, categorizations written as RULE/APPROVED.

import { prisma } from "@/lib/prisma";
import type { Prisma } from "@/app/generated/prisma";
import type { RuleCondition } from "@/lib/rules/rule-dto";
import { buildRuleWhereClause } from "@/lib/rules/rule-evaluator";

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

// ── Categories ────────────────────────────────────────────────────────────────

export async function createCategoryForUser(
  userId: string,
  input: { name: string; color?: string; parentId?: string },
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
      sortOrder: (last?.sortOrder ?? -1) + 1,
    },
    select: { id: true, name: true, color: true, parentId: true },
  });
}

export async function updateCategoryForUser(
  userId: string,
  categoryId: string,
  input: { name?: string; color?: string },
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

  return prisma.category.update({
    where: { id: categoryId },
    data,
    select: { id: true, name: true, color: true },
  });
}

// ── Rules ─────────────────────────────────────────────────────────────────────

export async function listRulesForUser(userId: string) {
  const rules = await prisma.categoryRule.findMany({
    where: { userId },
    orderBy: [{ priority: "desc" }, { createdAt: "desc" }],
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
  }));
}

export async function createRuleForUser(
  userId: string,
  input: {
    name: string;
    conditions: RuleCondition[];
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
      priority: input.priority ?? 0,
      isActive: true,
    },
    select: { id: true },
  });
}

export async function updateRuleForUser(
  userId: string,
  ruleId: string,
  input: {
    name?: string;
    conditions?: RuleCondition[];
    categoryId?: string;
    isActive?: boolean;
    priority?: number;
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
  if (input.priority !== undefined) data.priority = input.priority;

  await prisma.categoryRule.update({ where: { id: ruleId }, data });
  return { id: ruleId };
}

/** Apply a set of conditions, categorizing all matching transactions (RULE/APPROVED). */
async function applyRule(
  ruleId: string | null,
  userId: string,
  conditions: RuleCondition[],
  sourceCategoryId: string | null,
  categoryId: string,
): Promise<number> {
  const where = buildRuleWhereClause(userId, conditions, sourceCategoryId);
  const txs = await prisma.transaction.findMany({ where, select: { id: true } });
  if (txs.length === 0) return 0;

  const allIds = txs.map((t) => t.id);
  const now = new Date();
  const existing = await prisma.transactionCategorization.findMany({
    where: { transactionId: { in: allIds } },
    select: { transactionId: true },
  });
  const existingIds = new Set(existing.map((e) => e.transactionId));
  const newIds = allIds.filter((id) => !existingIds.has(id));

  await Promise.all([
    existingIds.size > 0
      ? prisma.transactionCategorization.updateMany({
          where: { transactionId: { in: [...existingIds] } },
          data: {
            categoryId,
            source: "RULE",
            status: "APPROVED",
            categoryRuleId: ruleId,
            approvedAt: now,
            rejectedAt: null,
            note: null,
          },
        })
      : Promise.resolve(),
    newIds.length > 0
      ? prisma.transactionCategorization.createMany({
          data: newIds.map((id) => ({
            transactionId: id,
            categoryId,
            source: "RULE" as const,
            status: "APPROVED" as const,
            categoryRuleId: ruleId,
            approvedAt: now,
          })),
          skipDuplicates: true,
        })
      : Promise.resolve(),
  ]);

  return txs.length;
}

export async function runRuleForUser(
  userId: string,
  ruleId: string,
): Promise<number> {
  const rule = await prisma.categoryRule.findUnique({
    where: { id: ruleId },
    select: {
      userId: true,
      categoryId: true,
      conditions: true,
      sourceCategoryId: true,
    },
  });
  if (!rule || rule.userId !== userId) throw new Error("Rule not found");
  return applyRule(
    ruleId,
    userId,
    rule.conditions as unknown as RuleCondition[],
    rule.sourceCategoryId,
    rule.categoryId,
  );
}

export async function runAllRulesForUser(userId: string) {
  const rules = await prisma.categoryRule.findMany({
    where: { userId, isActive: true },
    orderBy: [{ priority: "desc" }, { createdAt: "asc" }],
    select: {
      id: true,
      name: true,
      categoryId: true,
      conditions: true,
      sourceCategoryId: true,
    },
  });
  const results: { ruleId: string; name: string; categorized: number }[] = [];
  for (const r of rules) {
    const categorized = await applyRule(
      r.id,
      userId,
      r.conditions as unknown as RuleCondition[],
      r.sourceCategoryId,
      r.categoryId,
    );
    results.push({ ruleId: r.id, name: r.name, categorized });
  }
  return results;
}
