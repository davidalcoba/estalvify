// GET /api/banking/callback
// Enable Banking redirects here after user authenticates with their bank.
//
// Two flows:
//   NEW connection: move to PENDING_SETUP → redirect to setup page (accounts fetched live)
//   RE-AUTH (reconnectConnectionId present): restore the existing connection
//     with the new session, skip setup, accounts are untouched.
//
// NOTE: No session auth required — the `state` UUID is the security mechanism.

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { exchangeCodeForSession } from "@/lib/banking/enable-banking";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get("code");
  const state = searchParams.get("state");
  const error = searchParams.get("error");

  const appUrl = request.nextUrl.origin;

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

  // Find the pending connection created when the user started the OAuth flow
  const bankConnection = await prisma.bankConnection.findFirst({
    where: { sessionId: state, status: "PENDING_REAUTH" },
  });

  if (!bankConnection) {
    return NextResponse.redirect(`${appUrl}/accounts?error=connection_not_found`);
  }

  // Check if this is a re-auth for an existing expired connection
  const reconnectConnectionId = bankConnection.reconnectConnectionId;

  try {
    const { session_id, accounts, access } = await exchangeCodeForSession(code);

    console.log("[callback] accounts from API:", JSON.stringify(
      accounts.map((a) => ({ uid: a.uid, name: a.name, product: a.product, details: a.details, ibanSuffix: a.account_id?.iban?.slice(-4) })),
      null, 2
    ));

    const consentExpiresAt = access?.valid_until ? new Date(access.valid_until) : null;

    // ── RE-AUTH FLOW ───────────────────────────────────────────────────────
    // Restore the existing connection with the new Enable Banking session.
    if (reconnectConnectionId) {
      // Update the connection and remove the placeholder atomically.
      await prisma.$transaction(async (tx) => {
        await tx.bankConnection.update({
          where: { id: reconnectConnectionId },
          data: {
            sessionId: session_id,
            status: "ACTIVE",
            consentExpiresAt,
          },
        });
        await tx.bankConnection.delete({ where: { id: bankConnection.id } });
      });

      // Reset per-account sync state to match the fresh connection state.
      await prisma.bankAccount
        .updateMany({
          where: { bankConnectionId: reconnectConnectionId },
          data: { lastSyncError: null, lastSyncAt: null },
        })
        .catch((err) => console.warn("[callback] Could not reset account sync state:", err));

      // Enable Banking assigns new UIDs per session, so the stored
      // externalAccountId values are now stale. Update them outside the
      // transaction — individual failures are non-fatal (the connection is
      // already restored) and we log them for debugging.
      for (const newAccount of accounts) {
        const ibanSuffix = newAccount.account_id?.iban?.slice(-4);
        if (!ibanSuffix || !newAccount.uid) continue;
        try {
          // iban column stores only the last 4 digits — match on that
          await prisma.bankAccount.updateMany({
            where: { bankConnectionId: reconnectConnectionId, iban: ibanSuffix },
            data: { externalAccountId: newAccount.uid },
          });
        } catch (err) {
          console.warn(`[callback] Could not update UID for IBAN suffix ···${ibanSuffix}:`, err);
        }
      }

      return NextResponse.redirect(`${appUrl}/accounts?reconnected=true`);
    }

    // ── NEW CONNECTION FLOW ────────────────────────────────────────────────
    // Duplicate check: block if any account already belongs to a different
    // active connection for this user.
    const externalIds = accounts.map((a) => a.uid);
    const duplicate = await prisma.bankAccount.findFirst({
      where: {
        externalAccountId: { in: externalIds },
        userId: bankConnection.userId,
        isActive: true,
        bankConnectionId: { not: bankConnection.id },
      },
      select: { name: true },
    });

    if (duplicate) {
      await prisma.bankConnection
        .delete({ where: { id: bankConnection.id } })
        .catch(() => {});
      return NextResponse.redirect(`${appUrl}/accounts?error=already_connected`);
    }

    // Store minimal account info for the setup page.
    // Only uid, display name, last-4 IBAN, currency and type — no full IBANs.
    // Cleared when setup completes or is cancelled.
    const pendingAccounts = accounts.map((a) => ({
      uid: a.uid,
      name: a.name ?? a.product ?? a.details ?? null,
      ibanSuffix: a.account_id?.iban?.slice(-4) ?? null,
      currency: a.currency,
      type: a.cash_account_type,
    }));

    await prisma.bankConnection.update({
      where: { id: bankConnection.id },
      data: {
        sessionId: session_id,
        status: "PENDING_SETUP",
        consentExpiresAt,
        pendingAccounts,
      },
    });

    return NextResponse.redirect(
      `${appUrl}/accounts/setup?connectionId=${bankConnection.id}`
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("Banking callback processing error:", error);

    await prisma.bankConnection
      .delete({ where: { id: bankConnection.id } })
      .catch(() => {});

    return NextResponse.redirect(
      `${appUrl}/accounts?error=${encodeURIComponent(message)}`
    );
  }
}
