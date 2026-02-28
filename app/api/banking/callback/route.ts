// GET /api/banking/callback
// Enable Banking redirects here after user authenticates with their bank.
// Exchanges the authorization code for a session, then stores accounts in the DB.

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { exchangeCodeForSession } from "@/lib/banking/enable-banking";

export async function GET(request: NextRequest) {
  const session = await auth();

  if (!session?.user) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  const { searchParams } = new URL(request.url);
  const code = searchParams.get("code");
  const state = searchParams.get("state");
  const error = searchParams.get("error");

  if (error || !code || !state) {
    const errorMsg = error ?? "missing_code_or_state";
    console.error("Banking callback error:", errorMsg);
    return NextResponse.redirect(
      new URL(`/accounts?error=${encodeURIComponent(errorMsg)}`, request.url)
    );
  }

  try {
    // Find the PENDING connection created in the connect route (state stored as sessionId)
    const bankConnection = await prisma.bankConnection.findFirst({
      where: {
        userId: session.user.id,
        sessionId: state,
        status: "PENDING_REAUTH",
      },
    });

    if (!bankConnection) {
      return NextResponse.redirect(
        new URL("/accounts?error=connection_not_found", request.url)
      );
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
          userId: session.user.id,
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

    return NextResponse.redirect(new URL("/accounts?connected=true", request.url));
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("Banking callback processing error:", error);
    return NextResponse.redirect(
      new URL(`/accounts?error=${encodeURIComponent(message)}`, request.url)
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
