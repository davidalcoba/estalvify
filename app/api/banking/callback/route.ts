// GET /api/banking/callback
// Enable Banking redirects here after user authenticates with their bank.
// Exchanges the authorization code for a session, then stores accounts in the DB.
//
// NOTE: No session auth required here — the `state` UUID is the security
// mechanism (generated server-side, stored in DB). This allows the callback
// to work even when the user initiated the flow from a different origin
// (e.g. localhost redirecting to the Vercel callback URL).

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { exchangeCodeForSession } from "@/lib/banking/enable-banking";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get("code");
  const state = searchParams.get("state");
  const error = searchParams.get("error");

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? request.nextUrl.origin;

  if (error || !code || !state) {
    const errorMsg = error ?? "missing_code_or_state";
    console.error("Banking callback error:", errorMsg);

    // Clean up the dangling PENDING connection (user cancelled or error)
    if (state) {
      await prisma.bankConnection
        .deleteMany({ where: { sessionId: state, status: "PENDING_REAUTH" } })
        .catch(() => {}); // best effort
    }

    // Don't show an error page on user-initiated cancellation
    const isCancelled = error === "access_denied" || error === "user_cancelled";
    if (isCancelled) {
      return NextResponse.redirect(`${appUrl}/accounts`);
    }

    return NextResponse.redirect(
      `${appUrl}/accounts?error=${encodeURIComponent(errorMsg)}`
    );
  }

  try {
    // Look up the PENDING connection by state alone — state is a UUID secret
    const bankConnection = await prisma.bankConnection.findFirst({
      where: {
        sessionId: state,
        status: "PENDING_REAUTH",
      },
    });

    if (!bankConnection) {
      return NextResponse.redirect(`${appUrl}/accounts?error=connection_not_found`);
    }

    // Exchange authorization code → real session_id + accounts
    const { session_id, accounts, access } = await exchangeCodeForSession(code);

    // Update connection with real session_id and mark active
    await prisma.bankConnection.update({
      where: { id: bankConnection.id },
      data: {
        sessionId: session_id,
        status: "ACTIVE",
        consentExpiresAt: access?.valid_until ? new Date(access.valid_until) : null,
      },
    });

    // Store each account in the database
    for (const account of accounts) {
      await prisma.bankAccount.upsert({
        where: { externalAccountId: account.uid },
        create: {
          userId: bankConnection.userId,
          bankConnectionId: bankConnection.id,
          externalAccountId: account.uid,
          iban: account.iban,
          name: account.name ?? account.iban ?? account.uid,
          currency: account.currency,
          type: mapAccountType(account.account_type),
          isActive: true,
        },
        update: {
          name: account.name ?? account.iban ?? account.uid,
          isActive: true,
        },
      });
    }

    return NextResponse.redirect(`${appUrl}/accounts?connected=true`);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("Banking callback processing error:", error);

    // Clean up the PENDING connection if exchange or DB write failed
    if (state) {
      await prisma.bankConnection
        .deleteMany({ where: { sessionId: state, status: "PENDING_REAUTH" } })
        .catch(() => {});
    }

    return NextResponse.redirect(
      `${appUrl}/accounts?error=${encodeURIComponent(message)}`
    );
  }
}

function mapAccountType(type?: string): "CHECKING" | "SAVINGS" | "CREDIT" | "INVESTMENT" | "OTHER" {
  if (!type) return "CHECKING";
  const t = type.toLowerCase();
  if (t.includes("saving")) return "SAVINGS";
  if (t.includes("credit")) return "CREDIT";
  if (t.includes("invest") || t.includes("pension")) return "INVESTMENT";
  if (t.includes("current") || t.includes("checking")) return "CHECKING";
  return "OTHER";
}
