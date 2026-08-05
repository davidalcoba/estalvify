"use server";

import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import {
  createSeriesForUser,
  updateSeriesForUser,
  deleteSeriesForUser,
  type SeriesFields,
} from "@/lib/mcp/manage";

async function requireUserId(): Promise<string> {
  const session = await auth();
  if (!session?.user) throw new Error("Unauthorized");
  return session.user.id;
}

function revalidate(): void {
  revalidatePath("/recurring");
  revalidatePath("/forecast");
  revalidatePath("/plan");
  revalidatePath("/dashboard");
}

export type { SeriesFields };

// Every mutation returns its failure instead of throwing: production masks
// thrown server-action messages, so a thrown validation error (e.g. the
// matcher audit) reads as a generic haunted-UI failure.
export type ActionResult = { ok: true } | { ok: false; error: string };

function failure(err: unknown): ActionResult {
  return { ok: false, error: err instanceof Error ? err.message : "Unknown error" };
}

export async function createSeries(fields: SeriesFields): Promise<ActionResult> {
  try {
    const userId = await requireUserId();
    await createSeriesForUser(userId, fields);
    revalidate();
    return { ok: true };
  } catch (err) {
    return failure(err);
  }
}

export async function updateSeries(id: string, fields: SeriesFields): Promise<ActionResult> {
  try {
    const userId = await requireUserId();
    await updateSeriesForUser(userId, id, fields);
    revalidate();
    return { ok: true };
  } catch (err) {
    return failure(err);
  }
}

export async function deleteSeries(id: string): Promise<ActionResult> {
  try {
    const userId = await requireUserId();
    await deleteSeriesForUser(userId, id);
    revalidate();
    return { ok: true };
  } catch (err) {
    return failure(err);
  }
}

// Rejecting a detection proposal — remembered so it never resurfaces.
export async function dismissRecurringSuggestion(merchantKey: string): Promise<ActionResult> {
  try {
    const userId = await requireUserId();
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
