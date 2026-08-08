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
  updateHouseholdName,
} from "@/app/(app)/settings/actions";
import type {
  HouseholdMemberDTO,
  HouseholdInviteDTO,
} from "@/lib/household/manage";
import { Copy, Check, Trash2, RefreshCw, Pencil } from "lucide-react";
import { useT } from "@/components/i18n/i18n-provider";
import type { MessageKey } from "@/lib/i18n/dictionaries/en";

const ROLE_LABELS: Record<string, MessageKey> = {
  EDITOR: "settings.household.role.editor",
  VIEWER: "settings.household.role.viewer",
};

const ROLE_HELP: Record<string, MessageKey> = {
  EDITOR: "settings.household.role.editorHelp",
  VIEWER: "settings.household.role.viewerHelp",
};

export function MembersCard({
  householdName,
  members,
  invites,
  currentUserId,
}: {
  householdName: string;
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
  const [editingName, setEditingName] = useState(false);
  const [nameDraft, setNameDraft] = useState(householdName);
  const t = useT();

  const roleOptions = Object.entries(ROLE_LABELS).map(([value, key]) => ({
    value,
    label: t(key),
  }));

  function saveName() {
    const next = nameDraft.trim();
    if (!next || next === householdName) {
      setNameDraft(householdName);
      setEditingName(false);
      return;
    }
    setError(null);
    startTransition(async () => {
      const result = await updateHouseholdName(next);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setEditingName(false);
    });
  }

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
      if (!result.ok) setError(result.error ?? t("common.error"));
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
        <CardTitle>{t("settings.household.title")}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Name (shown in the sidebar switcher and on invitations) */}
        <div className="space-y-1.5">
          <Label htmlFor="household-name-editor">{t("settings.household.name")}</Label>
          {editingName ? (
            <div className="flex items-center gap-2">
              <Input
                id="household-name-editor"
                value={nameDraft}
                maxLength={60}
                autoFocus
                disabled={isPending}
                onChange={(e) => setNameDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") saveName();
                  if (e.key === "Escape") {
                    setNameDraft(householdName);
                    setEditingName(false);
                  }
                }}
              />
              <Button size="sm" onClick={saveName} disabled={isPending}>
                {isPending ? "…" : t("common.save")}
              </Button>
            </div>
          ) : (
            <button
              type="button"
              className="inline-flex items-center gap-1.5 text-sm font-medium hover:underline"
              onClick={() => {
                setNameDraft(householdName);
                setEditingName(true);
              }}
            >
              {householdName}
              <Pencil className="h-3 w-3 text-muted-foreground" aria-hidden />
            </button>
          )}
        </div>

        {/* Members */}
        <ul className="space-y-3">
          {members.map((m) => (
            <li key={m.id} className="flex items-center gap-3">
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">
                  {m.name ?? m.email ?? t("settings.household.member")}
                  {m.userId === currentUserId && (
                    <span className="text-muted-foreground">
                      {t("settings.household.you")}
                    </span>
                  )}
                </p>
                {m.email && (
                  <p className="truncate text-xs text-muted-foreground">{m.email}</p>
                )}
              </div>
              {m.role === "OWNER" ? (
                <Badge variant="secondary">{t("settings.household.role.owner")}</Badge>
              ) : (
                <>
                  <SimpleSelect
                    size="sm"
                    value={m.role}
                    options={roleOptions}
                    disabled={isPending}
                    ariaLabel={t("settings.household.roleFor", {
                      who: m.email ?? m.name ?? t("settings.household.member"),
                    })}
                    onValueChange={(next) =>
                      run(() => updateMemberRole(m.id, next))
                    }
                  />
                  <Button
                    variant="ghost"
                    size="icon"
                    disabled={isPending}
                    aria-label={t("settings.household.removeMember", {
                      who: m.email ?? m.name ?? t("settings.household.member"),
                    })}
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
            <p className="text-sm font-medium">{t("settings.household.pending")}</p>
            <ul className="space-y-3">
              {invites.map((i) => (
                <li key={i.id} className="flex items-center gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm">{i.email}</p>
                    <p className="text-xs text-muted-foreground">
                      {ROLE_LABELS[i.role] ? t(ROLE_LABELS[i.role]) : i.role}
                      {i.expired ? t("settings.household.expiredSuffix") : ""}
                    </p>
                  </div>
                  {i.expired && (
                    <Badge variant="outline">{t("settings.household.expired")}</Badge>
                  )}
                  <Button
                    variant="ghost"
                    size="icon"
                    disabled={isPending}
                    aria-label={t("settings.household.newLinkFor", { email: i.email })}
                    title={t("settings.household.newLinkTitle")}
                    onClick={() => handleRenew(i)}
                  >
                    <RefreshCw className="size-4" aria-hidden />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    disabled={isPending}
                    aria-label={t("settings.household.revokeFor", { email: i.email })}
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
          <p className="text-sm font-medium">{t("settings.household.invite.title")}</p>
          <div className="space-y-1.5">
            <Label htmlFor="invite-email">{t("settings.household.invite.email")}</Label>
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
            <Label htmlFor="invite-role">{t("settings.household.invite.role")}</Label>
            <SimpleSelect
              value={role}
              onValueChange={setRole}
              options={roleOptions}
              disabled={isPending}
              ariaLabel={t("settings.household.invite.roleAria")}
            />
            <p className="text-xs text-muted-foreground">
              {ROLE_HELP[role] ? t(ROLE_HELP[role]) : ""}
            </p>
          </div>
          {error && (
            <p className="text-sm text-destructive" role="alert">
              {error}
            </p>
          )}
          <Button onClick={handleInvite} disabled={isPending || !email.trim()}>
            {isPending
              ? t("settings.household.invite.working")
              : t("settings.household.invite.action")}
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
              <DialogTitle>{t("settings.household.link.title")}</DialogTitle>
              <DialogDescription>
                {t("settings.household.link.body")}
              </DialogDescription>
            </DialogHeader>
            <div className="flex items-center gap-2">
              <Input readOnly value={inviteLink ?? ""} className="font-mono text-xs" />
              <Button
                variant="outline"
                size="icon"
                onClick={copyLink}
                aria-label={t("settings.household.link.copy")}
              >
                {copied ? (
                  <Check className="size-4 text-success" aria-hidden />
                ) : (
                  <Copy className="size-4" aria-hidden />
                )}
              </Button>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setInviteLink(null)}>
                {t("settings.household.link.done")}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </CardContent>
    </Card>
  );
}
