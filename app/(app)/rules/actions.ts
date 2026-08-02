"use server";

import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import type { Prisma } from "@/app/generated/prisma";
import { parseConditions } from "@/lib/rules/rule-dto";
import type { ConditionGroup, RuleCondition } from "@/lib/rules/rule-dto";
import { deleteRuleForUser, evaluateConditions, runRules } from "@/lib/rules/apply";
import { toTransactionListItemDTO } from "@/lib/transactions/transaction-dto";
import type { TransactionListItemDTO } from "@/lib/transactions/transaction-dto";

const PREVIEW_LIMIT = 50;

// ─────────────────────────────────────────────
// Preview: find transactions matching rule conditions
// ─────────────────────────────────────────────

export async function previewRuleTransactions(
  conditions: ConditionGroup,
  sourceCategoryId: string | null
): Promise<{ transactions: TransactionListItemDTO[]; total: number }> {
  const session = await auth();
  if (!session?.user) throw new Error("Unauthorized");

  const { matched, transactions } = await evaluateConditions(
    session.user.id,
    conditions,
    sourceCategoryId,
    PREVIEW_LIMIT
  );

  return {
    transactions: transactions.map(toTransactionListItemDTO),
    total: matched,
  };
}

// ─────────────────────────────────────────────
// Save a rule
// ─────────────────────────────────────────────

export async function saveRule(input: {
  name: string;
  conditions: ConditionGroup;
  sourceCategoryId: string | null;
  categoryId: string;
  priority: number;
}): Promise<{ id: string }> {
  const session = await auth();
  if (!session?.user) throw new Error("Unauthorized");
  const userId = session.user.id;

  await validateCategoryAccess(userId, input.categoryId);
  if (input.sourceCategoryId) {
    await validateCategoryAccess(userId, input.sourceCategoryId);
  }

  const rule = await prisma.categoryRule.create({
    data: {
      userId,
      name: input.name.trim(),
      conditions: input.conditions as unknown as Prisma.InputJsonValue,
      sourceCategoryId: input.sourceCategoryId,
      categoryId: input.categoryId,
      priority: input.priority,
      isActive: true,
    },
    select: { id: true },
  });

  revalidatePath("/rules");
  return { id: rule.id };
}

// ─────────────────────────────────────────────
// Execute a rule: categorize all matching transactions
// ─────────────────────────────────────────────

export async function executeRule(
  ruleId: string
): Promise<{ categorized: number }> {
  const session = await auth();
  if (!session?.user) throw new Error("Unauthorized");
  const userId = session.user.id;

  const rule = await prisma.categoryRule.findUnique({
    where: { id: ruleId },
    select: { userId: true },
  });
  if (!rule || rule.userId !== userId) throw new Error("Rule not found");

  const report = await runRules(userId, { ruleIds: [ruleId] });
  revalidateAfterCategorization();
  return { categorized: report.totalMatched };
}

// ─────────────────────────────────────────────
// Execute rule conditions without saving (one-off)
// ─────────────────────────────────────────────

export async function executeRuleOnce(input: {
  conditions: ConditionGroup;
  sourceCategoryId: string | null;
  categoryId: string;
  ruleName: string | null;
}): Promise<{ categorized: number; savedRuleId: string | null }> {
  const session = await auth();
  if (!session?.user) throw new Error("Unauthorized");
  const userId = session.user.id;

  await validateCategoryAccess(userId, input.categoryId);
  if (input.sourceCategoryId) {
    await validateCategoryAccess(userId, input.sourceCategoryId);
  }

  // The engine only runs saved rules, so an unnamed one-off is persisted as an
  // inactive rule, run, and then removed. That keeps a single execution path
  // (precedence, first-match-wins, undo trail) instead of a parallel one.
  const rule = await prisma.categoryRule.create({
    data: {
      userId,
      name: input.ruleName?.trim() || "Untitled rule",
      conditions: input.conditions as unknown as Prisma.InputJsonValue,
      sourceCategoryId: input.sourceCategoryId,
      categoryId: input.categoryId,
      isActive: true,
    },
    select: { id: true },
  });

  const keep = Boolean(input.ruleName?.trim());
  try {
    const report = await runRules(userId, { ruleIds: [rule.id] });
    if (!keep) {
      // Detach the categorizations before deleting, so the rows survive and
      // stay attributable to nothing rather than cascading away.
      await prisma.transactionCategorization.updateMany({
        where: { categoryRuleId: rule.id },
        data: { categoryRuleId: null },
      });
      await prisma.categoryRule.delete({ where: { id: rule.id } });
    }
    revalidatePath("/rules");
    revalidateAfterCategorization();
    return {
      categorized: report.totalMatched,
      savedRuleId: keep ? rule.id : null,
    };
  } catch (err) {
    if (!keep) {
      await prisma.categoryRule.delete({ where: { id: rule.id } }).catch(() => {});
    }
    throw err;
  }
}

// ─────────────────────────────────────────────
// Get user rules (for rule selector)
// ─────────────────────────────────────────────

export async function getUserRules(): Promise<
  { id: string; name: string; categoryId: string; categoryName: string }[]
> {
  const session = await auth();
  if (!session?.user) throw new Error("Unauthorized");
  const userId = session.user.id;

  const rules = await prisma.categoryRule.findMany({
    where: { userId, isActive: true },
    orderBy: [{ priority: "asc" }, { createdAt: "asc" }],
    select: {
      id: true,
      name: true,
      categoryId: true,
      category: { select: { name: true } },
    },
  });

  return rules.map((r) => ({
    id: r.id,
    name: r.name,
    categoryId: r.categoryId,
    categoryName: r.category.name,
  }));
}

// ─────────────────────────────────────────────
// Add a condition to an existing rule
// ─────────────────────────────────────────────

export async function addConditionToRule(input: {
  ruleId: string;
  condition: RuleCondition;
}): Promise<{ categorized: number }> {
  const session = await auth();
  if (!session?.user) throw new Error("Unauthorized");
  const userId = session.user.id;

  const rule = await prisma.categoryRule.findUnique({
    where: { id: input.ruleId },
    select: { userId: true, conditions: true },
  });
  if (!rule || rule.userId !== userId) throw new Error("Rule not found");

  // Appending widens an OR rule and narrows an AND rule — the group's own
  // operator decides, which is what the editor shows the user.
  const tree = parseConditions(rule.conditions);
  const updated: ConditionGroup = {
    op: tree.op,
    children: [...tree.children, input.condition],
  };

  await prisma.categoryRule.update({
    where: { id: input.ruleId },
    data: { conditions: updated as unknown as Prisma.InputJsonValue },
  });

  const report = await runRules(userId, { ruleIds: [input.ruleId] });

  revalidatePath("/rules");
  revalidateAfterCategorization();

  return { categorized: report.totalMatched };
}

// ─────────────────────────────────────────────
// Update a rule (name, conditions, target category, priority)
// ─────────────────────────────────────────────

export async function updateRule(input: {
  ruleId: string;
  name: string;
  conditions: ConditionGroup;
  categoryId: string;
  priority?: number;
}): Promise<void> {
  const session = await auth();
  if (!session?.user) throw new Error("Unauthorized");
  const userId = session.user.id;

  const rule = await prisma.categoryRule.findUnique({
    where: { id: input.ruleId },
    select: { userId: true },
  });
  if (!rule || rule.userId !== userId) throw new Error("Rule not found");

  await validateCategoryAccess(userId, input.categoryId);

  await prisma.categoryRule.update({
    where: { id: input.ruleId },
    data: {
      name: input.name.trim(),
      conditions: input.conditions as unknown as Prisma.InputJsonValue,
      categoryId: input.categoryId,
      ...(input.priority !== undefined ? { priority: input.priority } : {}),
    },
  });

  revalidatePath("/rules");
}

// ─────────────────────────────────────────────
// Toggle rule active/inactive
// ─────────────────────────────────────────────

export async function toggleRuleActive(
  ruleId: string,
  isActive: boolean
): Promise<void> {
  const session = await auth();
  if (!session?.user) throw new Error("Unauthorized");
  const userId = session.user.id;

  const rule = await prisma.categoryRule.findUnique({
    where: { id: ruleId },
    select: { userId: true },
  });
  if (!rule || rule.userId !== userId) throw new Error("Rule not found");

  await prisma.categoryRule.update({
    where: { id: ruleId },
    data: { isActive },
  });

  revalidatePath("/rules");
}

// ─────────────────────────────────────────────
// Delete a rule
// ─────────────────────────────────────────────

export async function deleteRule(ruleId: string): Promise<void> {
  const session = await auth();
  if (!session?.user) throw new Error("Unauthorized");

  await deleteRuleForUser(session.user.id, ruleId);
  revalidatePath("/rules");
}

// ─────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────

async function validateCategoryAccess(
  userId: string,
  categoryId: string
): Promise<void> {
  const cat = await prisma.category.findUnique({
    where: { id: categoryId },
    select: { userId: true, isActive: true },
  });
  if (!cat || (cat.userId !== null && cat.userId !== userId) || !cat.isActive) {
    throw new Error("Category not found");
  }
}

function revalidateAfterCategorization(): void {
  revalidatePath("/categorize");
  revalidatePath("/transactions");
  revalidatePath("/dashboard");
}
