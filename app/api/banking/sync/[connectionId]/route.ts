// POST /api/banking/sync/[connectionId]
// On-demand sync for a specific bank connection.
// Fetches transactions from the last sync date onwards + current balances.

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
    where: {
      id: connectionId,
      userId: session.user.id,
      status: { in: ["ACTIVE", "SYNCING"] },
    },
    include: { bankAccounts: { where: { isActive: true } } },
  });

  if (!connection) {
    return NextResponse.json({ error: "Connection not found or not active" }, { status: 404 });
  }

  // Mark as syncing immediately so the UI can reflect the in-progress state.
  await prisma.bankConnection.update({
    where: { id: connectionId },
    data: { status: "SYNCING" },
  });

  // Determine date range.
  // - On subsequent syncs: start 1 day before lastSyncAt to bridge any gap
  //   caused by transactions that settle with a delay.
  // - On the very first sync (no lastSyncAt): start from yesterday so we
  //   capture today's pending transactions without pulling a huge history.
  const dateTo = toDateString(new Date());
  const dateFrom = connection.lastSyncAt
    ? toDateString(new Date(connection.lastSyncAt.getTime() - 24 * 60 * 60 * 1000))
    : toDateString(new Date(Date.now() - 24 * 60 * 60 * 1000));

  try {
    const result = await syncConnection(connection, dateFrom, dateTo);

    // Restore ACTIVE status whether the sync fully succeeded or had partial
    // errors — syncConnection already updated lastSyncAt on full success.
    await prisma.bankConnection.update({
      where: { id: connectionId },
      data: { status: "ACTIVE" },
    });

    return NextResponse.json({
      success: true,
      dateFrom,
      dateTo,
      accountsSynced: result.accountsSynced,
      transactionsFetched: result.transactionsFetched,
      transactionsSkipped: result.transactionsSkipped,
      balancesFetched: result.balancesFetched,
      ...(result.errors.length > 0 && { errors: result.errors }),
    });
  } catch (error) {
    // On fatal error restore ACTIVE so the user can retry.
    await prisma.bankConnection
      .update({ where: { id: connectionId }, data: { status: "ACTIVE" } })
      .catch(() => {});

    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
