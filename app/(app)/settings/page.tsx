import type { Metadata } from "next";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { SettingsForm } from "@/components/settings/settings-form";

export const metadata: Metadata = { title: "Settings" };

export default async function SettingsPage() {
  const session = await auth();

  const user = await prisma.user.findUnique({
    where: { id: session!.user.id },
    select: { name: true, email: true, timezone: true, currency: true, locale: true },
  });

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold tracking-tight">Settings</h2>
        <p className="text-muted-foreground">Manage your account and regional preferences.</p>
      </div>

      <div className="max-w-lg space-y-6">
        <SettingsForm
          timezone={user?.timezone ?? "Europe/London"}
          currency={user?.currency ?? "EUR"}
          locale={user?.locale ?? "es-ES"}
        />
      </div>
    </div>
  );
}
