// Builds Prisma where clauses from rule conditions for transaction matching

import type { Prisma } from "@/app/generated/prisma";
import type { RuleCondition, RuleConditionOperator } from "./rule-dto";

// ─────────────────────────────────────────────
// Single condition → Prisma filter
// ─────────────────────────────────────────────

function buildTextCondition(
  field: string,
  operator: RuleConditionOperator,
  value: string
): Record<string, unknown> {
  switch (operator) {
    case "contains":
      return { [field]: { contains: value, mode: "insensitive" } };
    case "equals":
      return { [field]: { equals: value, mode: "insensitive" } };
    case "startsWith":
      return { [field]: { startsWith: value, mode: "insensitive" } };
    case "endsWith":
      return { [field]: { endsWith: value, mode: "insensitive" } };
    default:
      return { [field]: { contains: value, mode: "insensitive" } };
  }
}

function conditionToWhereClause(
  condition: RuleCondition
): Record<string, unknown> {
  const { field, operator, value } = condition;
  if (!value.trim()) return {};
  return buildTextCondition(field, operator, value.trim());
}

// ─────────────────────────────────────────────
// Full rule → Prisma where clause
// ─────────────────────────────────────────────

export function buildRuleWhereClause(
  userId: string,
  conditions: RuleCondition[],
  sourceCategoryId: string | null
): Prisma.TransactionWhereInput {
  const clauses: Prisma.TransactionWhereInput[] = [{ userId }];

  // Source category filter: only match transactions already in that category
  if (sourceCategoryId) {
    clauses.push({
      categorization: {
        categoryId: sourceCategoryId,
        status: "APPROVED",
      },
    });
  }

  // Each condition narrows the match (AND logic)
  for (const condition of conditions) {
    const clause = conditionToWhereClause(condition);
    if (Object.keys(clause).length > 0) {
      clauses.push(clause as Prisma.TransactionWhereInput);
    }
  }

  return { AND: clauses };
}
