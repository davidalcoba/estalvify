// Accounts page — manage connected bank accounts
// Users connect banks via Enable Banking OAuth2 flow

import type { Metadata } from "next";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Building2, Plus, Shield } from "lucide-react";

export const metadata: Metadata = { title: "Bank Accounts" };

export default function AccountsPage() {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Bank Accounts</h2>
          <p className="text-muted-foreground">
            Connect your bank accounts to sync transactions automatically.
          </p>
        </div>
        <Button disabled>
          <Plus className="mr-2 h-4 w-4" />
          Connect bank
        </Button>
      </div>

      {/* Security note */}
      <Card className="bg-indigo-50 border-indigo-200">
        <CardContent className="flex items-start gap-3 pt-4">
          <Shield className="h-5 w-5 text-indigo-600 mt-0.5 shrink-0" />
          <div className="text-sm">
            <p className="font-medium text-indigo-900">Read-only access</p>
            <p className="text-indigo-700">
              Estalvify connects via Enable Banking using PSD2 open banking.
              We only request read access — we can never initiate payments or modify your account.
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Empty state */}
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
            Estalvify supports over 2,500 banks across Europe via Enable Banking.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex justify-center">
          <Button variant="outline" disabled>
            <Plus className="mr-2 h-4 w-4" />
            Connect your first bank
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
