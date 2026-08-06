"use server";

import { requireScope } from "@/lib/auth/scope";
import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import {
  createSeriesForUser,
  updateSeriesForUser,
  deleteSeriesForUser,
  type SeriesFields,
} from "@/lib/mcp/manage";

// NOTE: a "use server" module may only export async functions. Re-exporting a
// type from here (`export type { SeriesFields }`) made Turbopack emit a runtime
// reference to the erased type, so the module threw `ReferenceError:
// SeriesFields is not defined` on evaluation in production — killing every
// action in the file. Consumers import the type straight from lib/mcp/manage.

async function requireWriteScope() {
  return requireScope("write");
}

function revalidate(): void {
  revalidatePath("/recurring");
  revalidatePath("/forecast");
  revalidatePath("/plan");
  revalidatePath("/dashboard");
}

// Every mutation returns its failure instead of throwing: production masks
// thrown server-action messages, so a thrown validation error (e.g. the
// matcher audit) reads as a generic haunted-UI failure.
export type ActionResult = { ok: true } | { ok: false; error: string };

function failure(err: unknown): ActionResult {
  return { ok: false, error: err instanceof Error ? err.message : "Unknown error" };
}

export async function createSeries(fields: SeriesFields): Promise<ActionResult> {
  try {
    const { dataUserId, actorUserId } = await requireWriteScope();
    await createSeriesForUser(dataUserId, fields, actorUserId);
    revalidate();
    return { ok: true };
  } catch (err) {
    return failure(err);
  }
}

export async function updateSeries(id: string, fields: SeriesFields): Promise<ActionResult> {
  try {
    const { dataUserId, actorUserId } = await requireWriteScope();
    await updateSeriesForUser(dataUserId, id, fields, actorUserId);
    revalidate();
    return { ok: true };
  } catch (err) {
    return failure(err);
  }
}

export async function deleteSeries(id: string): Promise<ActionResult> {
  try {
    const { dataUserId } = await requireWriteScope();
    await deleteSeriesForUser(dataUserId, id);
    revalidate();
    return { ok: true };
  } catch (err) {
    return failure(err);
  }
}

// Rejecting a detection proposal — remembered so it never resurfaces.
export async function dismissRecurringSuggestion(merchantKey: string): Promise<ActionResult> {
  try {
    const { dataUserId: userId } = await requireWriteScope();
    const key = merchantKey?.trim();
    if (!key) throw new Error("Missing suggestion key");
    await prisma.dismissedRecurringSuggestion.upsert({
      where: { userId_merchantKey: { userId, merchantKey: key } },
      create: { userId, merchantKey: key },
      update: {},
    });
    revalidatePath("/recurring");
    return { ok: true };
  } catch (err) {
    return failure(err);
  }
}
