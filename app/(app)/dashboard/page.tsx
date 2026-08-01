// Dashboard — global financial overview
// Shows: net worth, income vs expenses, account balances, uncategorized transactions

import type { Metadata } from "next";
import Link from "next/link";
import { auth } from "@/auth";
import { getUserPrefs } from "@/lib/user-prefs";
import { formatDate, formatCurrency } from "@/lib/formatters";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/layout/page-header";
import { EmptyState } from "@/components/ui/empty-state";
import { TrendingUp, TrendingDown, Wallet, Tag } from "lucide-react";

export const metadata: Metadata = { title: "Dashboard" };

export default async function DashboardPage() {
  const session = await auth();
  const { locale, timezone, currency } = await getUserPrefs(session!.user.id);
  const zero = formatCurrency(0, currency, locale);

  return (
    <div className="space-y-6">
      <PageHeader
        title={`Good morning, ${session?.user?.name?.split(" ")[0] ?? "there"} 👋`}
        description={`Here's your financial overview for ${formatDate(new Date(), locale, timezone, { month: "long", year: "numeric" })}.`}
      />

      {/* KPI Cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Net Worth</CardTitle>
            <Wallet className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{zero}</div>
            <p className="text-xs text-muted-foreground">Across all accounts</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Income this month</CardTitle>
            <TrendingUp className="h-4 w-4 text-success" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-success">+{zero}</div>
            <p className="text-xs text-muted-foreground">No data yet</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Expenses this month</CardTitle>
            <TrendingDown className="h-4 w-4 text-destructive" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-destructive">−{zero}</div>
            <p className="text-xs text-muted-foreground">No data yet</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">To categorize</CardTitle>
            <Tag className="h-4 w-4 text-brand" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">0</div>
            <p className="text-xs text-muted-foreground">Transactions pending review</p>
          </CardContent>
        </Card>
      </div>

      {/* Empty state — no bank accounts connected */}
      <EmptyState
        icon={Wallet}
        title="Connect your first bank account"
        description="Link your bank accounts to start tracking your finances automatically. Your data syncs every day so you always have a fresh overview."
      >
        <Button asChild variant="outline">
          <Link href="/accounts">Go to Accounts →</Link>
        </Button>
      </EmptyState>
    </div>
  );
}
