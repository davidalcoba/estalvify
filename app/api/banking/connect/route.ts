// POST /api/banking/connect
// Initiates the Enable Banking OAuth flow for a specific bank.
// Creates a PENDING BankConnection and returns the bank auth URL.
// When `reconnectConnectionId` is provided, this is a re-auth for an expired
// connection — the callback will restore that connection instead of creating new accounts.

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { createBankingSession } from "@/lib/banking/enable-banking";
import { z } from "zod";

const connectSchema = z.object({
  aspspName: z.string().min(1),
  aspspCountry: z.string().length(2).default("ES"),
  // Present when re-authing an expired connection — skips account setup on callback
  reconnectConnectionId: z.string().optional(),
});

export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const parsed = connectSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const { aspspName, aspspCountry, reconnectConnectionId } = parsed.data;

  // Verify the target connection exists and belongs to this user
  if (reconnectConnectionId) {
    const existing = await prisma.bankConnection.findFirst({
      where: { id: reconnectConnectionId, userId: session.user.id, status: "EXPIRED" },
    });
    if (!existing) {
      return NextResponse.json({ error: "Connection not found or not expired" }, { status: 400 });
    }
  }

  const psuIpAddress =
    request.headers.get("x-forwarded-for")?.split(",")[0].trim() ??
    request.headers.get("x-real-ip") ??
    "127.0.0.1";

  try {
    const state = crypto.randomUUID();

    const { url } = await createBankingSession({
      aspspName,
      aspspCountry,
      psuIpAddress,
      state,
    });

    await prisma.bankConnection.create({
      data: {
        userId: session.user.id,
        bankId: aspspName,
        bankName: aspspName,
        country: aspspCountry,
        sessionId: state,
        status: "PENDING_REAUTH",
        // Store reconnect target so the callback can restore the existing connection
        sessionData: reconnectConnectionId
          ? JSON.parse(JSON.stringify({ reconnectConnectionId }))
          : undefined,
      },
    });

    return NextResponse.json({ url });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("Banking connect error:", error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
