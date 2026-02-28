// Reports page — charts, trends, and financial scenarios

import type { Metadata } from "next";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { BarChart3 } from "lucide-react";

export const metadata: Metadata = { title: "Reports" };

export default function ReportsPage() {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold tracking-tight">Reports</h2>
        <p className="text-muted-foreground">
          Insights into your spending patterns, trends, and financial scenarios.
        </p>
      </div>

      {/* Empty state */}
      <Card className="border-dashed">
        <CardHeader className="text-center">
          <div className="flex justify-center mb-3">
            <div className="w-12 h-12 rounded-full bg-amber-100 flex items-center justify-center">
              <BarChart3 className="h-6 w-6 text-amber-600" />
            </div>
          </div>
          <CardTitle>Reports coming soon</CardTitle>
          <CardDescription>
            Once you have some categorized transactions, you&apos;ll see spending
            breakdowns by category, monthly trends, income vs expenses charts,
            and budget vs actual comparisons.
          </CardDescription>
        </CardHeader>
        <CardContent className="text-center">
          <p className="text-sm text-muted-foreground">
            Connect a bank account and categorize some transactions to unlock reports.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
