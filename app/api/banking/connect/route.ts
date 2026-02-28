// POST /api/banking/connect
// Initiates the Enable Banking OAuth flow for a specific bank.
// Creates a pending BankConnection record and returns the bank auth URL.

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
    // Create Enable Banking session → get redirect URL
    const bankingSession = await createBankingSession({
      aspspName,
      aspspCountry,
      psuIpAddress,
    });

    // Store pending connection in DB
    // We'll update it with the real session_id in the callback
    await prisma.bankConnection.create({
      data: {
        userId: session.user.id,
        bankId: aspspName,
        bankName: aspspName,
        country: aspspCountry,
        sessionId: bankingSession.session_id,
        status: "ACTIVE",
        consentExpiresAt: new Date(bankingSession.valid_until),
      },
    });

    return NextResponse.json({ url: bankingSession.url });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("Banking connect error:", error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
