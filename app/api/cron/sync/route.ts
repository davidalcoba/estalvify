// Daily sync cron job — fetches yesterday's transactions and current balances
// Triggered by Vercel Cron at 01:00 UTC every day (configured in vercel.json)
// Protected by CRON_SECRET to prevent unauthorized calls

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// Vercel Cron calls this endpoint daily
// We authenticate it using a shared secret in the Authorization header
export async function GET(request: NextRequest) {
  // Verify cron secret
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const startTime = Date.now();
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  yesterday.setHours(0, 0, 0, 0);

  let totalTransactionsFetched = 0;
  let totalAccountsSynced = 0;
  const errors: string[] = [];

  try {
    // Get all active bank connections across all users
    const activeConnections = await prisma.bankConnection.findMany({
      where: { status: "ACTIVE" },
      include: {
        bankAccounts: {
          where: { isActive: true },
        },
      },
    });

    // Process each connection
    for (const connection of activeConnections) {
      try {
        // TODO: Implement Enable Banking API calls
        // For each account in this connection:
        // 1. Check if token is expired → mark for re-auth if so
        // 2. GET /accounts/{id}/transactions?date_from=yesterday&date_to=yesterday
        // 3. GET /accounts/{id}/balances
        // 4. Upsert transactions (skip duplicates by externalTransactionId)
        // 5. Save balance snapshot

        totalAccountsSynced += connection.bankAccounts.length;
      } catch (connectionError) {
        const message =
          connectionError instanceof Error ? connectionError.message : "Unknown error";
        errors.push(`Connection ${connection.id}: ${message}`);

        // If the error indicates token expiry, update connection status
        // await prisma.bankConnection.update({
        //   where: { id: connection.id },
        //   data: { status: "EXPIRED" },
        // });
      }
    }

    // Log this sync run
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
      syncDate: yesterday.toISOString().split("T")[0],
      transactionsFetched: totalTransactionsFetched,
      accountsSynced: totalAccountsSynced,
      errors: errors.length > 0 ? errors : undefined,
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
