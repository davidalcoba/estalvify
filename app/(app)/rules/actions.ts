"use server";

import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import type { RuleCondition } from "@/lib/rules/rule-dto";
import { buildRuleWhereClause } from "@/lib/rules/rule-evaluator";
import { toTransactionListItemDTO } from "@/lib/transactions/transaction-dto";
import type { TransactionListItemDTO } from "@/lib/transactions/transaction-dto";

const PREVIEW_LIMIT = 50;

// ─────────────────────────────────────────────
// Preview: find transactions matching rule conditions
// ─────────────────────────────────────────────

export async function previewRuleTransactions(
  conditions: RuleCondition[],
  sourceCategoryId: string | null
): Promise<{ transactions: TransactionListItemDTO[]; total: number }> {
  const session = await auth();
  if (!session?.user) throw new Error("Unauthorized");
  const userId = session.user.id;

  const where = buildRuleWhereClause(userId, conditions, sourceCategoryId);

  const [total, transactions] = await Promise.all([
    prisma.transaction.count({ where }),
    prisma.transaction.findMany({
      where,
      include: {
        bankAccount: { select: { id: true, name: true } },
        categorization: { include: { category: { select: { name: true, color: true } } } },
      },
      orderBy: [{ bookingDate: "desc" }, { id: "asc" }],
      take: PREVIEW_LIMIT,
    }),
  ]);

  return {
    transactions: transactions.map(toTransactionListItemDTO),
    total,
  };
}

// ─────────────────────────────────────────────
// Save a rule
// ─────────────────────────────────────────────

export async function saveRule(input: {
  name: string;
  conditions: RuleCondition[];
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
      conditions: input.conditions,
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
    select: {
      userId: true,
      categoryId: true,
      conditions: true,
      sourceCategoryId: true,
    },
  });

  if (!rule || rule.userId !== userId) throw new Error("Rule not found");

  return applyRuleConditions(
    userId,
    ruleId,
    rule.conditions as RuleCondition[],
    rule.sourceCategoryId,
    rule.categoryId
  );
}

// ─────────────────────────────────────────────
// Execute rule conditions without saving (one-off)
// ─────────────────────────────────────────────

export async function executeRuleOnce(input: {
  conditions: RuleCondition[];
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

  // Optionally save the rule if a name is provided
  let savedRuleId: string | null = null;
  if (input.ruleName?.trim()) {
    const rule = await prisma.categoryRule.create({
      data: {
        userId,
        name: input.ruleName.trim(),
        conditions: input.conditions,
        sourceCategoryId: input.sourceCategoryId,
        categoryId: input.categoryId,
        isActive: true,
      },
      select: { id: true },
    });
    savedRuleId = rule.id;
    revalidatePath("/rules");
  }

  const result = await applyRuleConditions(
    userId,
    savedRuleId,
    input.conditions,
    input.sourceCategoryId,
    input.categoryId
  );

  return { categorized: result.categorized, savedRuleId };
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
  const userId = session.user.id;

  const rule = await prisma.categoryRule.findUnique({
    where: { id: ruleId },
    select: { userId: true },
  });
  if (!rule || rule.userId !== userId) throw new Error("Rule not found");

  await prisma.categoryRule.delete({ where: { id: ruleId } });
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

async function applyRuleConditions(
  userId: string,
  ruleId: string | null,
  conditions: RuleCondition[],
  sourceCategoryId: string | null,
  categoryId: string
): Promise<{ categorized: number }> {
  const where = buildRuleWhereClause(userId, conditions, sourceCategoryId);
  const transactions = await prisma.transaction.findMany({
    where,
    select: { id: true },
  });

  if (transactions.length === 0) return { categorized: 0 };

  const now = new Date();
  await prisma.$transaction(
    transactions.map((tx) =>
      prisma.transactionCategorization.upsert({
        where: { transactionId: tx.id },
        create: {
          transactionId: tx.id,
          categoryId,
          source: "RULE",
          status: "APPROVED",
          categoryRuleId: ruleId,
          approvedAt: now,
        },
        update: {
          categoryId,
          source: "RULE",
          status: "APPROVED",
          categoryRuleId: ruleId,
          approvedAt: now,
          rejectedAt: null,
          note: null,
        },
      })
    )
  );

  revalidatePath("/categorize");
  revalidatePath("/transactions");
  revalidatePath("/dashboard");

  return { categorized: transactions.length };
}
