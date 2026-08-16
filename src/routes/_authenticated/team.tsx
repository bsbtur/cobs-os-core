import * as React from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, Copy, MailPlus, ShieldAlert, UserMinus } from "lucide-react";

import { AppShell } from "@/app/shell/app-shell";
import { RequireTenant } from "@/app/shell/require-tenant";
import { supabase } from "@/integrations/supabase/client";
import { humanizeError, useAuth } from "@/lib/auth";
import { useI18n } from "@/lib/i18n";
import { ROLE_ORDER, useTenant, type AppRole } from "@/lib/tenant";
import {
  buildInviteLink,
  createInvitationIntent,
  findIntentByInvitationId,
  findPendingIntent,
  saveIntent,
  type InvitationIntent,
} from "@/lib/invitation-token";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { EmptyState } from "@/components/feedback/empty-state";
import { PanelSkeleton } from "@/components/feedback/loading";
import { feedback } from "@/components/feedback/feedback";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export const Route = createFileRoute("/_authenticated/team")({
  head: () => ({
    meta: [
      { title: "Team and access — COBS OS" },
      {
        name: "description",
        content:
          "Manage COBS OS organization membership, contextual roles and single-use invitation links.",
      },
      { property: "og:title", content: "Team and access — COBS OS" },
      {
        property: "og:description",
        content: "Membership, contextual roles and single-use invitation links.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: TeamPage,
});

type MemberRow = {
  id: string;
  profile_id: string;
  role: AppRole;
  status: string;
  profiles: { display_name: string | null; email: string | null } | null;
};

const copyText = (locale: string, pt: string, en: string) =>
  locale.toLowerCase().startsWith("pt") ? pt : en;

function Members() {
  const { t, locale } = useI18n();
  const { tenant, canManage, role: myRole } = useTenant();
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const members = useQuery({
    queryKey: ["members", tenant?.id],
    enabled: Boolean(tenant?.id),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("memberships")
        .select("id, profile_id, role, status, profiles(display_name, email)")
        .eq("tenant_id", tenant!.id);
      if (error) throw error;
      return data as unknown as MemberRow[];
    },
  });

  const invalidate = () =>
    void queryClient.invalidateQueries({ queryKey: ["members", tenant?.id] });

  const changeRole = useMutation({
    mutationFn: async (input: { id: string; role: AppRole }) => {
      const { error } = await supabase
        .from("memberships")
        .update({ role: input.role })
        .eq("id", input.id);
      if (error) throw error;
    },
    onSuccess: () => {
      feedback.success(t("team.roleUpdated"));
      invalidate();
    },
    onError: (error) => feedback.error(humanizeError(error, locale)),
  });

  const removeMember = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("memberships").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      feedback.success(t("team.removed"));
      invalidate();
    },
    onError: (error) => feedback.error(humanizeError(error, locale)),
  });

  const confirmRemove = (member: MemberRow) => {
    const label = member.profiles?.display_name || member.profiles?.email || member.profile_id;
    const confirmed = window.confirm(
      copyText(
        locale,
        `Remover ${label} da equipe? Essa pessoa perderá o acesso a esta organização.`,
        `Remove ${label} from the team? This person will lose access to this organization.`,
      ),
    );
    if (!confirmed) return;
    removeMember.mutate(member.id);
  };

  if (members.isLoading) return <PanelSkeleton rows={3} />;
  if (members.isError) {
    return (
      <section className="surface-panel p-5">
        <div className="flex items-start gap-3 text-destructive">
          <AlertTriangle className="mt-0.5 size-5 shrink-0" aria-hidden="true" />
          <div>
            <p className="font-semibold">
              {copyText(locale, "Não foi possível carregar a equipe.", "Could not load the team.")}
            </p>
            <p className="mt-1 text-sm text-muted-foreground">
              {copyText(
                locale,
                "A lista não foi confirmada. Tente novamente antes de assumir que não há membros cadastrados.",
                "The list could not be confirmed. Retry before assuming there are no members.",
              )}
            </p>
            <Button
              className="mt-3"
              size="sm"
              variant="outline"
              onClick={() => members.refetch()}
              disabled={members.isFetching}
            >
              {members.isFetching
                ? copyText(locale, "Atualizando…", "Refreshing…")
                : copyText(locale, "Tentar novamente", "Try again")}
            </Button>
          </div>
        </div>
      </section>
    );
  }

  if ((members.data ?? []).length === 0) {
    return (
      <EmptyState
        icon={ShieldAlert}
        title={copyText(locale, "Nenhum membro encontrado", "No members found")}
      />
    );
  }

  const actionsPending = changeRole.isPending || removeMember.isPending;

  return (
    <ul className="space-y-2">
      {(members.data ?? []).map((m) => {
        const self = m.profile_id === user?.id;
        return (
          <li
            key={m.id}
            className="surface-panel flex flex-wrap items-center gap-3 p-3.5 sm:flex-nowrap"
          >
            <span className="grid size-9 shrink-0 place-items-center rounded-full bg-primary-soft font-semibold text-primary">
              {(m.profiles?.display_name || m.profiles?.email || "?").slice(0, 1).toUpperCase()}
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">
                {m.profiles?.display_name || m.profiles?.email || m.profile_id}
                {self ? (
                  <span className="ml-2 font-mono text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
                    {t("team.you")}
                  </span>
                ) : null}
              </p>
              <p className="truncate text-xs text-muted-foreground">{m.profiles?.email ?? "—"}</p>
            </div>
            {canManage && !self ? (
              <Select
                defaultValue={m.role}
                disabled={actionsPending}
                onValueChange={(value) => changeRole.mutate({ id: m.id, role: value as AppRole })}
              >
                <SelectTrigger className="min-h-11 w-[190px] shrink-0">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ROLE_ORDER.filter((r) => r !== "owner" || myRole === "owner").map((r) => (
                    <SelectItem key={r} value={r}>
                      {t(`role.${r}`)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : (
              <span className="shrink-0 rounded-full border border-border px-2 py-0.5 font-mono text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
                {t(`role.${m.role}`)}
              </span>
            )}
            {canManage && !self ? (
              <Button
                variant="ghost"
                size="icon"
                className="min-h-11 min-w-11 shrink-0 text-destructive"
                aria-label={t("team.remove")}
                disabled={actionsPending}
                onClick={() => confirmRemove(m)}
              >
                <UserMinus className="size-4" />
              </Button>
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}

function Invitations() {
  const { t, locale } = useI18n();
  const { tenant, canManage, isOwner } = useTenant();
  const queryClient = useQueryClient();
  const [role, setRole] = React.useState<AppRole>("member");
  const [lastLink, setLastLink] = React.useState<string | null>(null);

  const invitations = useQuery({
    queryKey: ["invitations", tenant?.id],
    enabled: Boolean(tenant?.id) && canManage,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("invitations")
        .select("*")
        .eq("tenant_id", tenant!.id)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const invite = useMutation({
    mutationFn: async (email: string) => {
      const intent: InvitationIntent =
        findPendingIntent(tenant!.id, email) ??
        createInvitationIntent({ tenantId: tenant!.id, email, role });
      saveIntent(intent);

      const { data, error } = await supabase.rpc("create_invitation", {
        _tenant_id: tenant!.id,
        _email: intent.email,
        _role: intent.role as AppRole,
        _token: intent.rawToken,
        _idempotency_key: intent.idempotencyKey,
        _ttl_hours: 168,
      });
      if (error) throw error;

      const result = data as { invitation_id: string; expires_at: string };
      saveIntent({ ...intent, invitationId: result.invitation_id, expiresAt: result.expires_at });
      return buildInviteLink(window.location.origin, intent.rawToken);
    },
    onSuccess: (link) => {
      setLastLink(link);
      feedback.success(t("team.inviteCreated"));
      void queryClient.invalidateQueries({ queryKey: ["invitations", tenant?.id] });
    },
    onError: (error) => feedback.error(humanizeError(error, locale)),
  });

  const revoke = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("invitations")
        .update({ status: "revoked" })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      feedback.success(t("team.revoked"));
      void queryClient.invalidateQueries({ queryKey: ["invitations", tenant?.id] });
    },
    onError: (error) => feedback.error(humanizeError(error, locale)),
  });

  const confirmRevoke = (id: string, email: string) => {
    const confirmed = window.confirm(
      copyText(
        locale,
        `Revogar o convite de ${email}? O link deixará de poder ser usado.`,
        `Revoke the invitation for ${email}? The link will no longer be usable.`,
      ),
    );
    if (!confirmed) return;
    revoke.mutate(id);
  };

  const copy = async (value: string) => {
    await navigator.clipboard.writeText(value);
    feedback.success(t("team.copied"));
  };

  if (!canManage) {
    return <EmptyState icon={ShieldAlert} title={t("team.noInvites")} />;
  }

  return (
    <div className="space-y-4">
      <form
        className="surface-panel space-y-4 p-5"
        onSubmit={(e) => {
          e.preventDefault();
          const form = new FormData(e.currentTarget);
          invite.mutate(String(form.get("email") ?? ""));
        }}
      >
        <div className="grid gap-4 sm:grid-cols-[1fr_200px]">
          <div className="space-y-2">
            <Label htmlFor="inv-email">{t("team.inviteEmail")}</Label>
            <Input
              id="inv-email"
              name="email"
              type="email"
              required
              disabled={invite.isPending || revoke.isPending}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="inv-role">{t("team.inviteRole")}</Label>
            <Select
              value={role}
              disabled={invite.isPending || revoke.isPending}
              onValueChange={(v) => setRole(v as AppRole)}
            >
              <SelectTrigger id="inv-role" className="min-h-11">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {ROLE_ORDER.filter((r) => r !== "owner" || isOwner).map((r) => (
                  <SelectItem key={r} value={r}>
                    {t(`role.${r}`)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <Button type="submit" className="min-h-11" disabled={invite.isPending || revoke.isPending}>
          <MailPlus className="mr-2 size-4" aria-hidden="true" />
          {invite.isPending ? t("common.saving") : t("team.inviteSubmit")}
        </Button>
        <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
          {t("team.tokenNotice")}
        </p>
      </form>

      {lastLink ? (
        <div className="surface-panel animate-rise flex flex-wrap items-center gap-3 p-4">
          <code className="min-w-0 flex-1 truncate rounded-md bg-muted px-2 py-1 font-mono text-xs">
            {lastLink}
          </code>
          <Button variant="outline" className="min-h-11" onClick={() => void copy(lastLink)}>
            <Copy className="mr-2 size-4" aria-hidden="true" />
            {t("team.copyLink")}
          </Button>
        </div>
      ) : null}

      {invitations.isLoading ? (
        <PanelSkeleton rows={2} />
      ) : invitations.isError ? (
        <section className="surface-panel p-5">
          <div className="flex items-start gap-3 text-destructive">
            <AlertTriangle className="mt-0.5 size-5 shrink-0" aria-hidden="true" />
            <div>
              <p className="font-semibold">
                {copyText(
                  locale,
                  "Não foi possível carregar os convites.",
                  "Could not load invitations.",
                )}
              </p>
              <p className="mt-1 text-sm text-muted-foreground">
                {copyText(
                  locale,
                  "A lista de convites não foi confirmada. Tente novamente antes de criar ou revogar outro convite.",
                  "The invitation list could not be confirmed. Retry before creating or revoking another invitation.",
                )}
              </p>
              <Button
                className="mt-3"
                size="sm"
                variant="outline"
                onClick={() => invitations.refetch()}
                disabled={invitations.isFetching}
              >
                {invitations.isFetching
                  ? copyText(locale, "Atualizando…", "Refreshing…")
                  : copyText(locale, "Tentar novamente", "Try again")}
              </Button>
            </div>
          </div>
        </section>
      ) : (invitations.data ?? []).length === 0 ? (
        <EmptyState icon={MailPlus} title={t("team.noInvites")} />
      ) : (
        <ul className="space-y-2">
          {(invitations.data ?? []).map((inv) => {
            const intent = findIntentByInvitationId(inv.id);
            const link = intent ? buildInviteLink(window.location.origin, intent.rawToken) : null;
            return (
              <li
                key={inv.id}
                className="surface-panel flex flex-wrap items-center gap-3 p-3.5 sm:flex-nowrap"
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{inv.email}</p>
                  <p className="truncate text-xs text-muted-foreground">
                    {t(`role.${inv.role}`)} · {t("team.expires")}{" "}
                    {new Intl.DateTimeFormat(locale, { dateStyle: "medium" }).format(
                      new Date(inv.expires_at),
                    )}
                  </p>
                </div>
                <span className="shrink-0 rounded-full border border-border px-2 py-0.5 font-mono text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
                  {inv.status}
                </span>
                {inv.status === "pending" ? (
                  <div className="flex shrink-0 gap-1">
                    {link ? (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="min-h-11 min-w-11"
                        aria-label={t("team.copyLink")}
                        disabled={revoke.isPending}
                        onClick={() => void copy(link)}
                      >
                        <Copy className="size-4" />
                      </Button>
                    ) : (
                      <span className="self-center px-2 text-xs text-muted-foreground">
                        {t("team.linkLost")}
                      </span>
                    )}
                    <Button
                      variant="ghost"
                      className="min-h-11"
                      disabled={revoke.isPending || invite.isPending}
                      onClick={() => confirmRevoke(inv.id, inv.email)}
                    >
                      {revoke.isPending
                        ? copyText(locale, "Revogando…", "Revoking…")
                        : t("team.revoke")}
                    </Button>
                  </div>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function TeamPage() {
  const { t } = useI18n();
  return (
    <AppShell activeId="team" title={t("team.title")}>
      <div className="mx-auto w-full max-w-4xl space-y-6">
        <section className="animate-rise">
          <h2 className="text-2xl font-semibold lg:text-3xl">{t("team.title")}</h2>
          <p className="mt-2 max-w-2xl text-sm text-muted-foreground">{t("team.subtitle")}</p>
        </section>
        <RequireTenant>
          <Tabs defaultValue="members" className="animate-rise">
            <TabsList>
              <TabsTrigger value="members">{t("team.members")}</TabsTrigger>
              <TabsTrigger value="invitations">{t("team.invitations")}</TabsTrigger>
            </TabsList>
            <TabsContent value="members" className="pt-4">
              <Members />
            </TabsContent>
            <TabsContent value="invitations" className="pt-4">
              <Invitations />
            </TabsContent>
          </Tabs>
        </RequireTenant>
      </div>
    </AppShell>
  );
}
