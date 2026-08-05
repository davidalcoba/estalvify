// Guards the schema→handler→query wiring for list_planned_items' filters: a
// declared parameter that never reaches the where clause is the recurring
// MCP-vs-handler mismatch (offset, dateFrom, categoryId, scope — and status,
// which silently returned every status when asked for PENDING).

import { describe, it, expect, vi, beforeEach } from "vitest";

const { findMany } = vi.hoisted(() => ({
  findMany: vi.fn(async (_args: { where: Record<string, unknown> }) => [] as unknown[]),
}));
vi.mock("@/lib/prisma", () => ({ prisma: { plannedItem: { findMany } } }));

import { listPlannedItemsForUser } from "./manage";

function lastWhere(): Record<string, unknown> {
  const call = findMany.mock.calls.at(-1);
  return (call?.[0]?.where ?? {}) as Record<string, unknown>;
}

describe("listPlannedItemsForUser filters reach the query", () => {
  beforeEach(() => findMany.mockClear());

  it("passes status/year/month into the where clause", async () => {
    await listPlannedItemsForUser("u1", { year: 2026, month: 8, status: "PENDING" });
    expect(lastWhere()).toMatchObject({ userId: "u1", year: 2026, month: 8, status: "PENDING" });
  });

  it("omits a filter that was not provided (no status key)", async () => {
    await listPlannedItemsForUser("u1", { month: 8 });
    const where = lastWhere();
    expect(where.status).toBeUndefined();
    expect(where).toMatchObject({ userId: "u1", month: 8 });
  });
});
