// GET /api/banking/callback
// Enable Banking redirects here after user authenticates with their bank.
// Exchanges the authorization code for a session, stores accounts, then
// runs an initial 90-day sync so the user has data immediately.
//
// NOTE: No session auth required — the `state` UUID is the security mechanism.

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  exchangeCodeForSession,
  type EnableBankingAccount,
} from "@/lib/banking/enable-banking";
import { syncConnection, toDateString } from "@/lib/banking/sync";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get("code");
  const state = searchParams.get("state");
  const error = searchParams.get("error");

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? request.nextUrl.origin;

  if (error || !code || !state) {
    const errorMsg = error ?? "missing_code_or_state";
    console.error("Banking callback error:", errorMsg);

    if (state) {
      await prisma.bankConnection
        .deleteMany({ where: { sessionId: state, status: "PENDING_REAUTH" } })
        .catch(() => {});
    }

    const isCancelled = error === "access_denied" || error === "user_cancelled";
    if (isCancelled) return NextResponse.redirect(`${appUrl}/accounts`);

    return NextResponse.redirect(
      `${appUrl}/accounts?error=${encodeURIComponent(errorMsg)}`
    );
  }

  try {
    const bankConnection = await prisma.bankConnection.findFirst({
      where: { sessionId: state, status: "PENDING_REAUTH" },
    });

    if (!bankConnection) {
      return NextResponse.redirect(`${appUrl}/accounts?error=connection_not_found`);
    }

    const { session_id, accounts, access } = await exchangeCodeForSession(code);

    await prisma.bankConnection.update({
      where: { id: bankConnection.id },
      data: {
        sessionId: session_id,
        status: "ACTIVE",
        consentExpiresAt: access?.valid_until ? new Date(access.valid_until) : null,
      },
    });

    // Store accounts — use IBAN suffix as display name (bank returns holder name)
    const savedAccounts = await Promise.all(
      accounts.map((account) =>
        prisma.bankAccount.upsert({
          where: { externalAccountId: account.uid },
          create: {
            userId: bankConnection.userId,
            bankConnectionId: bankConnection.id,
            externalAccountId: account.uid,
            iban: account.iban,
            name: buildAccountName(account),
            currency: account.currency,
            type: mapAccountType(account.account_type),
            isActive: true,
          },
          update: { isActive: true },
          // Don't overwrite a name the user may have customised
        })
      )
    );

    // Initial sync: fetch last 90 days so the user has data immediately
    const dateTo = toDateString(new Date());
    const dateFrom = toDateString(new Date(Date.now() - 90 * 24 * 60 * 60 * 1000));

    await syncConnection(
      { ...bankConnection, sessionId: session_id, bankAccounts: savedAccounts },
      dateFrom,
      dateTo
    ).catch((err) =>
      console.error("Initial sync failed (non-fatal):", err)
    );

    return NextResponse.redirect(`${appUrl}/accounts?connected=true`);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("Banking callback processing error:", error);

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

/** Use IBAN last-4 as default name — the bank returns the holder's name, not a useful label. */
function buildAccountName(account: EnableBankingAccount): string {
  if (account.iban) return `···${account.iban.slice(-4)}`;
  return account.uid.slice(0, 8);
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
