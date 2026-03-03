// Builds Prisma where clauses from rule conditions for transaction matching

import type { Prisma } from "@/app/generated/prisma";
import type { RuleCondition, RuleConditionField, RuleConditionOperator } from "./rule-dto";

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

function buildAmountCondition(
  operator: RuleConditionOperator,
  value: string
): Record<string, unknown> {
  const num = parseFloat(value);
  if (isNaN(num)) return {};
  switch (operator) {
    case "equals":
      return { amount: num };
    case "greaterThan":
      return { amount: { gt: num } };
    case "lessThan":
      return { amount: { lt: num } };
    default:
      return { amount: num };
  }
}

function buildDirectionCondition(value: string): Record<string, unknown> {
  const normalized = value.toUpperCase();
  if (normalized === "DEBIT" || normalized === "CREDIT") {
    return { direction: normalized };
  }
  return {};
}

function conditionToWhereClause(
  condition: RuleCondition
): Record<string, unknown> {
  const { field, operator, value } = condition;
  if (!value.trim()) return {};

  const textFields: RuleConditionField[] = [
    "description",
    "creditorName",
    "debtorName",
    "remittanceInfo",
  ];

  if (textFields.includes(field)) {
    return buildTextCondition(field, operator, value.trim());
  }

  if (field === "amount") {
    return buildAmountCondition(operator, value.trim());
  }

  if (field === "direction") {
    return buildDirectionCondition(value.trim());
  }

  return {};
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
