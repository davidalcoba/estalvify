"use server";

import { auth } from "@/auth";
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

export async function createSeries(fields: SeriesFields): Promise<void> {
  const userId = await requireUserId();
  await createSeriesForUser(userId, fields);
  revalidate();
}

export async function updateSeries(id: string, fields: SeriesFields): Promise<void> {
  const userId = await requireUserId();
  await updateSeriesForUser(userId, id, fields);
  revalidate();
}

export async function deleteSeries(id: string): Promise<void> {
  const userId = await requireUserId();
  await deleteSeriesForUser(userId, id);
  revalidate();
}
