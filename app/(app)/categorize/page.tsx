// Categorize page — transaction categorization queue
// "Job to be done" UX: one transaction at a time, accept/reject AI suggestion, create rules

import type { Metadata } from "next";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { CheckCircle, Tag } from "lucide-react";

export const metadata: Metadata = { title: "Categorize" };

export default function CategorizePage() {
  return (
    <div className="space-y-6 max-w-2xl mx-auto">
      <div>
        <h2 className="text-2xl font-bold tracking-tight">Categorize Transactions</h2>
        <p className="text-muted-foreground">
          Review and confirm suggested categories for your transactions.
          You can create automatic rules from any categorization.
        </p>
      </div>

      {/* Empty state */}
      <Card className="border-dashed">
        <CardHeader className="text-center">
          <div className="flex justify-center mb-3">
            <div className="w-12 h-12 rounded-full bg-green-100 flex items-center justify-center">
              <CheckCircle className="h-6 w-6 text-green-600" />
            </div>
          </div>
          <CardTitle>All caught up!</CardTitle>
          <CardDescription>
            No transactions pending categorization. Connect your bank accounts
            and transactions will appear here after the next daily sync.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex justify-center">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Tag className="h-4 w-4" />
            <span>New transactions sync daily at midnight</span>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
