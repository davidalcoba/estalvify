"use client";

// Settings → "Household members" (owner-only; PLAN_MULTIUSER.md phase 2).
//
//  - Invite by email + role. The server returns the raw invite token exactly
//    once; the link (/invite/<token>) is built here from the page origin and
//    shown in a dialog to copy — it cannot be re-displayed later, only
//    renewed (re-inviting the same email revokes the previous link).
//  - Members list: change role (EDITOR/VIEWER) or remove. The owner row is
//    fixed — it anchors the household's data.
//  - Pending invites list: revoke, or renew when expired.

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { SimpleSelect } from "@/components/ui/simple-select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  inviteMember,
  revokeMemberInvite,
  updateMemberRole,
  removeMember,
} from "@/app/(app)/settings/actions";
import type {
  HouseholdMemberDTO,
  HouseholdInviteDTO,
} from "@/lib/household/manage";
import { Copy, Check, Trash2, RefreshCw } from "lucide-react";

const ROLE_OPTIONS = [
  { value: "EDITOR", label: "Editor" },
  { value: "VIEWER", label: "Viewer" },
];

const ROLE_HELP: Record<string, string> = {
  EDITOR: "Can categorize, edit rules, plan and manage bank connections.",
  VIEWER: "Read-only: sees everything, changes nothing.",
};

export function MembersCard({
  members,
  invites,
  currentUserId,
}: {
  members: HouseholdMemberDTO[];
  invites: HouseholdInviteDTO[];
  currentUserId: string;
}) {
  const [email, setEmail] = useState("");
  const [role, setRole] = useState("VIEWER");
  const [error, setError] = useState<string | null>(null);
  const [inviteLink, setInviteLink] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [isPending, startTransition] = useTransition();

  function handleInvite() {
    setError(null);
    startTransition(async () => {
      const result = await inviteMember(email.trim(), role);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setEmail("");
      setInviteLink(`${window.location.origin}/invite/${result.token}`);
      setCopied(false);
    });
  }

  function handleRenew(invite: HouseholdInviteDTO) {
    setError(null);
    startTransition(async () => {
      const result = await inviteMember(invite.email, invite.role);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setInviteLink(`${window.location.origin}/invite/${result.token}`);
      setCopied(false);
    });
  }

  function run(action: () => Promise<{ ok: boolean } & { error?: string }>) {
    setError(null);
    startTransition(async () => {
      const result = await action();
      if (!result.ok) setError(result.error ?? "Something went wrong");
    });
  }

  async function copyLink() {
    if (!inviteLink) return;
    await navigator.clipboard.writeText(inviteLink);
    setCopied(true);
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Household members</CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Members */}
        <ul className="space-y-3">
          {members.map((m) => (
            <li key={m.id} className="flex items-center gap-3">
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">
                  {m.name ?? m.email ?? "Member"}
                  {m.userId === currentUserId && (
                    <span className="text-muted-foreground"> (you)</span>
                  )}
                </p>
                {m.email && (
                  <p className="truncate text-xs text-muted-foreground">{m.email}</p>
                )}
              </div>
              {m.role === "OWNER" ? (
                <Badge variant="secondary">Owner</Badge>
              ) : (
                <>
                  <SimpleSelect
                    size="sm"
                    value={m.role}
                    options={ROLE_OPTIONS}
                    disabled={isPending}
                    ariaLabel={`Role for ${m.email ?? m.name ?? "member"}`}
                    onValueChange={(next) =>
                      run(() => updateMemberRole(m.id, next))
                    }
                  />
                  <Button
                    variant="ghost"
                    size="icon"
                    disabled={isPending}
                    aria-label={`Remove ${m.email ?? m.name ?? "member"}`}
                    onClick={() => run(() => removeMember(m.id))}
                  >
                    <Trash2 className="size-4 text-destructive" aria-hidden />
                  </Button>
                </>
              )}
            </li>
          ))}
        </ul>

        {/* Pending invites */}
        {invites.length > 0 && (
          <div className="space-y-3 border-t pt-5">
            <p className="text-sm font-medium">Pending invitations</p>
            <ul className="space-y-3">
              {invites.map((i) => (
                <li key={i.id} className="flex items-center gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm">{i.email}</p>
                    <p className="text-xs text-muted-foreground">
                      {ROLE_OPTIONS.find((r) => r.value === i.role)?.label ?? i.role}
                      {i.expired ? " · expired" : ""}
                    </p>
                  </div>
                  {i.expired && <Badge variant="outline">Expired</Badge>}
                  <Button
                    variant="ghost"
                    size="icon"
                    disabled={isPending}
                    aria-label={`New link for ${i.email}`}
                    title="Generate a new link (replaces this one)"
                    onClick={() => handleRenew(i)}
                  >
                    <RefreshCw className="size-4" aria-hidden />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    disabled={isPending}
                    aria-label={`Revoke invitation for ${i.email}`}
                    onClick={() => run(() => revokeMemberInvite(i.id))}
                  >
                    <Trash2 className="size-4 text-destructive" aria-hidden />
                  </Button>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Invite form */}
        <div className="space-y-3 border-t pt-5">
          <p className="text-sm font-medium">Invite someone</p>
          <div className="space-y-1.5">
            <Label htmlFor="invite-email">Email</Label>
            <Input
              id="invite-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="partner@example.com"
              autoComplete="off"
              disabled={isPending}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="invite-role">Role</Label>
            <SimpleSelect
              value={role}
              onValueChange={setRole}
              options={ROLE_OPTIONS}
              disabled={isPending}
              ariaLabel="Role for the new member"
            />
            <p className="text-xs text-muted-foreground">{ROLE_HELP[role]}</p>
          </div>
          {error && (
            <p className="text-sm text-destructive" role="alert">
              {error}
            </p>
          )}
          <Button onClick={handleInvite} disabled={isPending || !email.trim()}>
            {isPending ? "Working…" : "Create invite link"}
          </Button>
        </div>

        {/* One-time link dialog */}
        <Dialog
          open={inviteLink !== null}
          onOpenChange={(next) => {
            if (!next) setInviteLink(null);
          }}
        >
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Invitation link</DialogTitle>
              <DialogDescription>
                Share this link with the person you invited. It expires in 7
                days, works only for their email, and is shown only now — you
                can generate a new one from the pending list at any time.
              </DialogDescription>
            </DialogHeader>
            <div className="flex items-center gap-2">
              <Input readOnly value={inviteLink ?? ""} className="font-mono text-xs" />
              <Button variant="outline" size="icon" onClick={copyLink} aria-label="Copy link">
                {copied ? (
                  <Check className="size-4 text-success" aria-hidden />
                ) : (
                  <Copy className="size-4" aria-hidden />
                )}
              </Button>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setInviteLink(null)}>
                Done
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </CardContent>
    </Card>
  );
}
