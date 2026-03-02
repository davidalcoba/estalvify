// Budget page — monthly budget planning by category
// Zero-based budgeting: plan where every euro goes before the month starts

import type { Metadata } from "next";
import { auth } from "@/auth";
import { getUserPrefs } from "@/lib/user-prefs";
import { formatDate } from "@/lib/formatters";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { PiggyBank, Plus } from "lucide-react";

export const metadata: Metadata = { title: "Budget" };

export default async function BudgetPage() {
  const session = await auth();
  const { locale, timezone } = await getUserPrefs(session!.user.id);

  const currentMonth = formatDate(new Date(), locale, timezone, {
    month: "long",
    year: "numeric",
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Budget</h2>
          <p className="text-muted-foreground">
            Plan your spending for {currentMonth}.
          </p>
        </div>
        <Button disabled>
          <Plus className="mr-2 h-4 w-4" />
          Add Category
        </Button>
      </div>

      {/* Empty state */}
      <Card className="border-dashed">
        <CardHeader className="text-center">
          <div className="flex justify-center mb-3">
            <div className="w-12 h-12 rounded-full bg-purple-100 flex items-center justify-center">
              <PiggyBank className="h-6 w-6 text-purple-600" />
            </div>
          </div>
          <CardTitle>Create your first budget</CardTitle>
          <CardDescription>
            Set spending targets for each category and track your progress
            throughout the month. Categorize some transactions first to get started.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex justify-center">
          <Button variant="outline" disabled>
            <Plus className="mr-2 h-4 w-4" />
            Set up budget
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
