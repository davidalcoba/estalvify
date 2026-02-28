// Transactions page — full searchable and filterable transaction history
// Transactions are read-only (immutable as received from the bank)

import type { Metadata } from "next";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ArrowLeftRight } from "lucide-react";

export const metadata: Metadata = { title: "Transactions" };

export default function TransactionsPage() {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold tracking-tight">Transactions</h2>
        <p className="text-muted-foreground">
          Your complete transaction history across all bank accounts.
        </p>
      </div>

      {/* Empty state */}
      <Card className="border-dashed">
        <CardHeader className="text-center">
          <div className="flex justify-center mb-3">
            <div className="w-12 h-12 rounded-full bg-blue-100 flex items-center justify-center">
              <ArrowLeftRight className="h-6 w-6 text-blue-600" />
            </div>
          </div>
          <CardTitle>No transactions yet</CardTitle>
          <CardDescription>
            Transactions will appear here once you connect your bank accounts
            and the first daily sync runs. Transactions are read-only and
            reflect exactly what your bank reports.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex justify-center">
          <p className="text-sm text-muted-foreground">
            Data syncs every day at midnight UTC
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
