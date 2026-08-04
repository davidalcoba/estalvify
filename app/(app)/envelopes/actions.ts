"use server";

import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";

async function requireUserId(): Promise<string> {
  const session = await auth();
  if (!session?.user) throw new Error("Unauthorized");
  return session.user.id;
}

export interface EnvelopeFields {
  name: string;
  amount: number;
  locked: boolean;
}

export async function createEnvelope(fields: EnvelopeFields): Promise<void> {
  const userId = await requireUserId();
  const name = fields.name?.trim();
  if (!name) throw new Error("Name is required");
  if (!Number.isFinite(fields.amount) || fields.amount < 0) throw new Error("Invalid amount");
  const last = await prisma.stockEnvelope.findFirst({
    where: { userId },
    orderBy: { sortOrder: "desc" },
    select: { sortOrder: true },
  });
  await prisma.stockEnvelope.create({
    data: {
      userId,
      name: name.slice(0, 80),
      amount: fields.amount,
      locked: fields.locked,
      sortOrder: (last?.sortOrder ?? -1) + 1,
    },
  });
  revalidatePath("/envelopes");
}

export async function updateEnvelope(id: string, fields: EnvelopeFields): Promise<void> {
  const userId = await requireUserId();
  const name = fields.name?.trim();
  if (!name) throw new Error("Name is required");
  if (!Number.isFinite(fields.amount) || fields.amount < 0) throw new Error("Invalid amount");
  const { count } = await prisma.stockEnvelope.updateMany({
    where: { id, userId },
    data: { name: name.slice(0, 80), amount: fields.amount, locked: fields.locked },
  });
  if (count === 0) throw new Error("Envelope not found");
  revalidatePath("/envelopes");
}

export async function deleteEnvelope(id: string): Promise<void> {
  const userId = await requireUserId();
  await prisma.stockEnvelope.deleteMany({ where: { id, userId } });
  revalidatePath("/envelopes");
}
