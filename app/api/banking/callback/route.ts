// Enable Banking OAuth callback handler
// Bank redirects user here after authentication with ?session_id=...
// We store the session and redirect user back to /accounts

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

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
    return NextResponse.redirect(
      new URL(`/accounts?error=${encodeURIComponent(errorMsg)}`, request.url)
    );
  }

  try {
    // Find the pending bank connection for this user (created when we started the OAuth flow)
    const pendingConnection = await prisma.bankConnection.findFirst({
      where: {
        userId: session.user.id,
        status: "ACTIVE",
        sessionId: "PENDING", // Placeholder set during session creation
      },
    });

    if (!pendingConnection) {
      return NextResponse.redirect(
        new URL("/accounts?error=connection_not_found", request.url)
      );
    }

    // Update the connection with the real session ID from Enable Banking
    await prisma.bankConnection.update({
      where: { id: pendingConnection.id },
      data: {
        sessionId,
        status: "ACTIVE",
        // TODO: Fetch and store accounts after connecting
        // This would call getAccounts(sessionId) and create BankAccount records
      },
    });

    return NextResponse.redirect(new URL("/accounts?connected=true", request.url));
  } catch (error) {
    console.error("Banking callback error:", error);
    return NextResponse.redirect(
      new URL("/accounts?error=connection_failed", request.url)
    );
  }
}
