// POST /api/banking/connect
// Initiates the Enable Banking OAuth flow for a specific bank.
// Creates a PENDING BankConnection and returns the bank auth URL.

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { createBankingSession } from "@/lib/banking/enable-banking";
import { z } from "zod";

const connectSchema = z.object({
  aspspName: z.string().min(1),
  aspspCountry: z.string().length(2).default("ES"),
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

  const { aspspName, aspspCountry } = parsed.data;

  // Get user's IP for PSD2 compliance
  const psuIpAddress =
    request.headers.get("x-forwarded-for")?.split(",")[0].trim() ??
    request.headers.get("x-real-ip") ??
    "127.0.0.1";

  try {
    // Generate a state UUID for CSRF protection.
    // Stored as the temporary sessionId on the PENDING connection —
    // replaced with the real session_id after the callback.
    const state = crypto.randomUUID();

    // Create PENDING connection — no session_id yet
    await prisma.bankConnection.create({
      data: {
        userId: session.user.id,
        bankId: aspspName,
        bankName: aspspName,
        country: aspspCountry,
        sessionId: state, // temporary until callback
        status: "PENDING_REAUTH",
      },
    });

    // Call POST /auth → returns redirect URL
    const { url } = await createBankingSession({
      aspspName,
      aspspCountry,
      psuIpAddress,
      state,
    });

    return NextResponse.json({ url });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("Banking connect error:", error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
