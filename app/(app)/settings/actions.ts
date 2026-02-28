"use server";

import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";

export async function updatePreferences(data: {
  timezone: string;
  currency: string;
  locale: string;
}) {
  const session = await auth();
  if (!session?.user) throw new Error("Unauthorized");

  const { timezone, currency, locale } = data;

  // Basic validation
  if (!timezone || !currency || !locale) throw new Error("Missing fields");

  await prisma.user.update({
    where: { id: session.user.id },
    data: { timezone, currency, locale },
  });

  revalidatePath("/settings");
  revalidatePath("/transactions");
  revalidatePath("/dashboard");
}
