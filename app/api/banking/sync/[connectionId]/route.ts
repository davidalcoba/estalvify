// POST /api/banking/sync/[connectionId]
// On-demand sync for a specific bank connection.
// Fetches last 90 days of transactions + current balances.

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { syncConnection, toDateString } from "@/lib/banking/sync";

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ connectionId: string }> }
) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { connectionId } = await params;

  const connection = await prisma.bankConnection.findFirst({
    where: { id: connectionId, userId: session.user.id, status: "ACTIVE" },
    include: { bankAccounts: { where: { isActive: true } } },
  });

  if (!connection) {
    return NextResponse.json({ error: "Connection not found or not active" }, { status: 404 });
  }

  const dateTo = toDateString(new Date());
  const dateFrom = toDateString(new Date(Date.now() - 90 * 24 * 60 * 60 * 1000));

  try {
    const result = await syncConnection(connection, dateFrom, dateTo);

    return NextResponse.json({
      success: true,
      accountsSynced: result.accountsSynced,
      transactionsFetched: result.transactionsFetched,
      transactionsSkipped: result.transactionsSkipped,
      balancesFetched: result.balancesFetched,
      ...(result.errors.length > 0 && { errors: result.errors }),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
