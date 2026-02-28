// Accounts page — manage connected bank accounts
// Shows connected accounts with balance and status
// Allows connecting new banks via Enable Banking OAuth2

import type { Metadata } from "next";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Shield, Building2, AlertTriangle, CheckCircle2, RefreshCw } from "lucide-react";
import { ConnectBankDialog } from "@/components/accounts/connect-bank-dialog";

export const metadata: Metadata = { title: "Bank Accounts" };

const STATUS_CONFIG = {
  ACTIVE: { label: "Connected", icon: CheckCircle2, className: "text-green-600 bg-green-50 border-green-200" },
  EXPIRED: { label: "Session expired", icon: AlertTriangle, className: "text-red-600 bg-red-50 border-red-200" },
  PENDING_REAUTH: { label: "Re-auth needed", icon: RefreshCw, className: "text-amber-600 bg-amber-50 border-amber-200" },
  REVOKED: { label: "Disconnected", icon: AlertTriangle, className: "text-slate-600 bg-slate-50 border-slate-200" },
};

export default async function AccountsPage() {
  const session = await auth();

  const connections = await prisma.bankConnection.findMany({
    where: { userId: session!.user.id },
    include: {
      bankAccounts: {
        where: { isActive: true },
        include: {
          balances: { orderBy: { date: "desc" }, take: 1 },
        },
      },
    },
    orderBy: { createdAt: "desc" },
  });

  const totalAccounts = connections.reduce((sum, c) => sum + c.bankAccounts.length, 0);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Bank Accounts</h2>
          <p className="text-muted-foreground">
            {totalAccounts > 0
              ? `${totalAccounts} account${totalAccounts !== 1 ? "s" : ""} connected across ${connections.length} bank${connections.length !== 1 ? "s" : ""}`
              : "Connect your bank accounts to sync transactions automatically."}
          </p>
        </div>
        <ConnectBankDialog />
      </div>

      <Card className="bg-indigo-50 border-indigo-200">
        <CardContent className="flex items-start gap-3 pt-4 pb-4">
          <Shield className="h-5 w-5 text-indigo-600 mt-0.5 shrink-0" />
          <div className="text-sm">
            <p className="font-medium text-indigo-900">Read-only access via PSD2 open banking</p>
            <p className="text-indigo-700">
              We connect through Enable Banking — we can never initiate payments or modify your account.
              Your bank credentials are never shared with us.
            </p>
          </div>
        </CardContent>
      </Card>

      {connections.length === 0 ? (
        <Card className="border-dashed">
          <CardHeader className="text-center">
            <div className="flex justify-center mb-3">
              <div className="w-12 h-12 rounded-full bg-slate-100 flex items-center justify-center">
                <Building2 className="h-6 w-6 text-slate-600" />
              </div>
            </div>
            <CardTitle>No bank accounts connected</CardTitle>
            <CardDescription>
              Connect your first bank account to start tracking your finances.
              Estalvify supports thousands of banks across Europe.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex justify-center pb-6">
            <ConnectBankDialog />
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {connections.map((connection) => {
            const statusConfig = STATUS_CONFIG[connection.status];
            const StatusIcon = statusConfig.icon;
            return (
              <Card key={connection.id}>
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-full bg-slate-100 flex items-center justify-center">
                        <Building2 className="h-5 w-5 text-slate-600" />
                      </div>
                      <div>
                        <CardTitle className="text-base">{connection.bankName}</CardTitle>
                        <CardDescription className="text-xs">
                          Connected {connection.createdAt.toLocaleDateString("en-GB")}
                          {connection.consentExpiresAt && (
                            <> · Consent expires {connection.consentExpiresAt.toLocaleDateString("en-GB")}</>
                          )}
                        </CardDescription>
                      </div>
                    </div>
                    <Badge variant="outline" className={`gap-1 text-xs ${statusConfig.className}`}>
                      <StatusIcon className="h-3 w-3" />
                      {statusConfig.label}
                    </Badge>
                  </div>
                </CardHeader>

                {connection.bankAccounts.length > 0 && (
                  <CardContent className="pt-0">
                    <div className="space-y-2">
                      {connection.bankAccounts.map((account) => {
                        const latestBalance = account.balances[0];
                        return (
                          <div key={account.id} className="flex items-center justify-between py-2 px-3 rounded-lg bg-slate-50">
                            <div>
                              <p className="text-sm font-medium">{account.name}</p>
                              {account.iban && (
                                <p className="text-xs text-muted-foreground font-mono">
                                  {account.iban.replace(/(.{4})/g, "$1 ").trim()}
                                </p>
                              )}
                            </div>
                            <div className="text-right">
                              {latestBalance ? (
                                <>
                                  <p className="text-sm font-semibold">
                                    {Number(latestBalance.balance).toLocaleString("es-ES", {
                                      style: "currency",
                                      currency: latestBalance.currency,
                                    })}
                                  </p>
                                  <p className="text-xs text-muted-foreground">
                                    {latestBalance.date.toLocaleDateString("en-GB")}
                                  </p>
                                </>
                              ) : (
                                <p className="text-xs text-muted-foreground">Balance syncs tonight</p>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </CardContent>
                )}
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
