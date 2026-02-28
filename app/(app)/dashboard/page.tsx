// Dashboard — global financial overview
// Shows: net worth, income vs expenses, account balances, uncategorized transactions

import type { Metadata } from "next";
import { auth } from "@/auth";
import { getUserPrefs, formatDate } from "@/lib/user-prefs";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { TrendingUp, TrendingDown, Wallet, Tag } from "lucide-react";

export const metadata: Metadata = { title: "Dashboard" };

export default async function DashboardPage() {
  const session = await auth();
  const { locale, timezone } = await getUserPrefs(session!.user.id);

  return (
    <div className="space-y-6">
      {/* Welcome */}
      <div>
        <h2 className="text-2xl font-bold tracking-tight">
          Good morning, {session?.user?.name?.split(" ")[0] ?? "there"} 👋
        </h2>
        <p className="text-muted-foreground">
          Here&apos;s your financial overview for{" "}
          {formatDate(new Date(), locale, timezone, { month: "long", year: "numeric" })}.
        </p>
      </div>

      {/* KPI Cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Net Worth</CardTitle>
            <Wallet className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">€0.00</div>
            <p className="text-xs text-muted-foreground">Across all accounts</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Income this month</CardTitle>
            <TrendingUp className="h-4 w-4 text-green-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">+€0.00</div>
            <p className="text-xs text-muted-foreground">No data yet</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Expenses this month</CardTitle>
            <TrendingDown className="h-4 w-4 text-red-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-600">-€0.00</div>
            <p className="text-xs text-muted-foreground">No data yet</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">To categorize</CardTitle>
            <Tag className="h-4 w-4 text-indigo-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">0</div>
            <p className="text-xs text-muted-foreground">Transactions pending review</p>
          </CardContent>
        </Card>
      </div>

      {/* Empty state — no bank accounts connected */}
      <Card className="border-dashed">
        <CardHeader className="text-center">
          <div className="flex justify-center mb-3">
            <div className="w-12 h-12 rounded-full bg-indigo-100 flex items-center justify-center">
              <Wallet className="h-6 w-6 text-indigo-600" />
            </div>
          </div>
          <CardTitle>Connect your first bank account</CardTitle>
          <CardDescription>
            Link your bank accounts to start tracking your finances automatically.
            Your data syncs every day so you always have a fresh overview.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex justify-center">
          <Badge variant="secondary" className="cursor-pointer">
            Go to Accounts →
          </Badge>
        </CardContent>
      </Card>
    </div>
  );
}
