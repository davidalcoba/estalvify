// Daily sync cron job — fetches yesterday's transactions and current balances
// Triggered by Vercel Cron at 01:00 UTC every day (configured in vercel.json)
// Protected by CRON_SECRET to prevent unauthorized calls

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { syncConnection, toDateString } from "@/lib/banking/sync";

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const startTime = Date.now();

  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  yesterday.setHours(0, 0, 0, 0);

  const dateFrom = toDateString(yesterday);
  const dateTo = toDateString(yesterday);

  let totalTransactionsFetched = 0;
  let totalAccountsSynced = 0;
  const errors: string[] = [];

  try {
    const activeConnections = await prisma.bankConnection.findMany({
      where: { status: "ACTIVE" },
      include: { bankAccounts: { where: { isActive: true } } },
    });

    for (const connection of activeConnections) {
      try {
        const result = await syncConnection(connection, dateFrom, dateTo);
        totalTransactionsFetched += result.transactionsFetched;
        totalAccountsSynced += result.accountsSynced;
        if (result.errors.length > 0) {
          errors.push(...result.errors.map((e) => `[${connection.id}] ${e}`));
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Unknown error";
        errors.push(`Connection ${connection.id}: ${msg}`);

        // Mark expired if it looks like a consent/auth error
        if (msg.includes("401") || msg.includes("403") || msg.includes("expired")) {
          await prisma.bankConnection
            .update({ where: { id: connection.id }, data: { status: "EXPIRED" } })
            .catch(() => {});
        }
      }
    }

    const status =
      errors.length === 0
        ? "SUCCESS"
        : errors.length < activeConnections.length
        ? "PARTIAL"
        : "FAILED";

    await prisma.syncLog.create({
      data: {
        syncDate: yesterday,
        status,
        transactionsFetched: totalTransactionsFetched,
        accountsSynced: totalAccountsSynced,
        errorMessage: errors.length > 0 ? errors.join("; ") : null,
        durationMs: Date.now() - startTime,
      },
    });

    return NextResponse.json({
      success: true,
      syncDate: dateFrom,
      transactionsFetched: totalTransactionsFetched,
      accountsSynced: totalAccountsSynced,
      ...(errors.length > 0 && { errors }),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";

    await prisma.syncLog.create({
      data: {
        syncDate: yesterday,
        status: "FAILED",
        errorMessage: message,
        durationMs: Date.now() - startTime,
      },
    });

    return NextResponse.json({ error: message }, { status: 500 });
  }
}
