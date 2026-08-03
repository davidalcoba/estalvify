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
      where: {
        id: reconnectConnectionId,
        userId: session.user.id,
        // Allow re-auth for EXPIRED and ACTIVE connections.
        // ACTIVE connections may also need a fresh consent to reset PSD2 rate limits.
        status: { in: ["EXPIRED", "ACTIVE"] },
      },
    });
    if (!existing) {
      return NextResponse.json({ error: "Connection not found" }, { status: 400 });
    }
  }

  const psuIpAddress =
    request.headers.get("x-forwarded-for")?.split(",")[0].trim() ??
    request.headers.get("x-real-ip") ??
    "127.0.0.1";

  try {
    const state = crypto.randomUUID();

    // Enable Banking requires the redirect_url to exactly match one registered
    // in the app config. Vercel preview deployments have per-deploy origins
    // (ts-<hash>.vercel.app) that will never be registered, so prefer a fixed
    // ENABLE_BANKING_REDIRECT_URI when set and only fall back to the request
    // origin (e.g. localhost in dev, where that origin is the registered one).
    //
    // The flow can therefore only *complete* where the deployment's own origin is
    // the registered URI: the callback looks the `state` up in its own database,
    // and production and preview are different Neon branches. Hence a per-branch
    // value for `preview` (see .env.example) — and hence a reconnect started on a
    // feature-branch preview lands on production and dies there with
    // `connection_not_found`.
    const redirectUri =
      process.env.ENABLE_BANKING_REDIRECT_URI ??
      `${request.nextUrl.origin}/api/banking/callback`;

    const { url } = await createBankingSession({
      aspspName,
      aspspCountry,
      psuIpAddress,
      state,
      redirectUri,
    });

    await prisma.bankConnection.create({
      data: {
        userId: session.user.id,
        bankId: aspspName,
        bankName: aspspName,
        country: aspspCountry,
        sessionId: state,
        status: "PENDING_REAUTH",
        // Set when re-authing an existing connection — callback will restore it
        reconnectConnectionId: reconnectConnectionId ?? null,
      },
    });

    return NextResponse.json({ url });
  } catch (error) {
    // Log the full upstream error server-side, but never return the third-party
    // body to the client — it can carry provider internals, and it would land in
    // the browser and any error surface. Return a stable, generic message.
    console.error("Banking connect error:", error);
    return NextResponse.json(
      { error: "Could not start the bank connection. Please try again." },
      { status: 500 }
    );
  }
}
