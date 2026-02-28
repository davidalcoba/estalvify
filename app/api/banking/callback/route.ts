// GET /api/banking/callback
// Enable Banking redirects here after user authenticates with their bank.
// Fetches accounts and stores them in the database.

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { getAccounts } from "@/lib/banking/enable-banking";

export async function GET(request: NextRequest) {
  const session = await auth();

  if (!session?.user) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  const { searchParams } = new URL(request.url);
  const sessionId = searchParams.get("session_id");
  const error = searchParams.get("error");

  if (error || !sessionId) {
    const errorMsg = error ?? "missing_session_id";
    console.error("Banking callback error:", errorMsg);
    return NextResponse.redirect(
      new URL(`/accounts?error=${encodeURIComponent(errorMsg)}`, request.url)
    );
  }

  try {
    // Find the bank connection we created when initiating the flow
    const bankConnection = await prisma.bankConnection.findFirst({
      where: {
        userId: session.user.id,
        sessionId,
      },
    });

    if (!bankConnection) {
      return NextResponse.redirect(
        new URL("/accounts?error=connection_not_found", request.url)
      );
    }

    // Fetch the user's accounts from Enable Banking
    const { accounts } = await getAccounts(sessionId);

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
