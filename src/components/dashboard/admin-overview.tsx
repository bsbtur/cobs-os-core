import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import {
  AlertTriangle,
  ArrowRight,
  Building2,
  CheckCircle2,
  Clock3,
  Settings2,
  ShieldCheck,
  UsersRound,
} from "lucide-react";

import { AdminAuditTrail, type AdminAuditEvent } from "@/components/admin/audit-trail";
import { CiospCommercialDashboard } from "@/components/dashboard/ciosp-commercial-dashboard";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/feedback/empty-state";
import { PanelSkeleton } from "@/components/feedback/loading";
import { supabase } from "@/integrations/supabase/client";
import { useI18n } from "@/lib/i18n";
import { useTenant } from "@/lib/tenant";

type InvitationStatusRow = {
  id: string;
  status: string;
  expires_at: string;
};

export function AdminOverview() {
  const { t } = useI18n();
  const { tenant, role } = useTenant();
  const tenantId = tenant?.id;

  const overview = useQuery({
    queryKey: ["admin-overview", tenantId],
    enabled: Boolean(tenantId),
    queryFn: async () => {
      const [membershipsResult, invitationsResult, auditResult] = await Promise.all([
        supabase.from("memberships").select("id,status").eq("tenant_id", tenantId!),
        supabase
          .from("invitations")
          .select("id,status,expires_at")
          .eq("tenant_id", tenantId!),
        supabase
          .from("audit_events")
          .select(
            "id,action,actor_profile_id,correlation_id,occurred_at,subject_id,subject_type",
          )
          .eq("tenant_id", tenantId!)
          .order("occurred_at", { ascending: false })
          .limit(5),
      ]);

      if (membershipsResult.error) throw membershipsResult.error;
      if (invitationsResult.error) throw invitationsResult.error;
      if (auditResult.error) throw auditResult.error;

      const invitations = (invitationsResult.data ?? []) as InvitationStatusRow[];
      const now = Date.now();

      return {
        activeMembers: (membershipsResult.data ?? []).filter((item) => item.status === "active").length,
        pendingInvitations: invitations.filter((item) => item.status === "pending").length,
        expiredPendingInvitations: invitations.filter(
          (item) => item.status === "pending" && new Date(item.expires_at).getTime() < now,
        ).length,
        audit: (auditResult.data ?? []) as AdminAuditEvent[],
      };
    },
  });

  if (overview.isLoading) return <PanelSkeleton rows={4} />;

  if (overview.isError) {
    return <EmptyState icon={ShieldCheck} title={t("state.error.title")} body={t("state.error.body")} />;
  }

  const data = overview.data;
  const configurationItems = tenant
    ? [
        [t("onboarding.country"), tenant.country_code],
        [t("onboarding.currency"), tenant.currency_code],
        [t("onboarding.locale"), tenant.default_locale],
        [t("onboarding.timezone"), tenant.timezone],
      ]
    : [];
  const missingConfiguration = configurationItems.filter(([, value]) => !String(value ?? "").trim());
  const attentionCount = missingConfiguration.length + (data?.expiredPendingInvitations ?? 0);

  return (
    <div className="space-y-6">
      <section className="animate-rise flex flex-col gap-5 rounded-2xl border border-border bg-surface p-5 shadow-[var(--shadow-soft)] lg:flex-row lg:items-end lg:justify-between lg:p-6">
        <div className="min-w-0">
          <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.18em] text-primary">
            Centro de comando
          </p>
          <h2 className="mt-2 truncate text-2xl font-semibold lg:text-3xl">
            {tenant?.name ?? t("settings.title")}
          </h2>
          <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
            Veja primeiro o que exige atenção. Indicadores e contexto administrativo vêm depois.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex min-h-11 items-center gap-2 rounded-xl border border-border bg-elevated/60 px-3 text-xs text-muted-foreground">
            <ShieldCheck className="size-4 text-primary" aria-hidden="true" />
            {role ? t(`role.${role}`) : "—"}
          </div>
          <Button asChild variant="outline" className="min-h-11">
            <Link to="/operations">
              Operações
              <ArrowRight className="size-4" aria-hidden="true" />
            </Link>
          </Button>
        </div>
      </section>

      <section
        className={`surface-panel p-5 lg:p-6 ${attentionCount > 0 ? "border-warning/35" : "border-primary/25"}`}
        aria-label={t("admin.attention.title")}
      >
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="max-w-2xl">
            <p className={`font-mono text-[10px] font-semibold uppercase tracking-[0.16em] ${attentionCount > 0 ? "text-warning" : "text-primary"}`}>
              {attentionCount > 0 ? "Requer atenção" : "Tudo em ordem"}
            </p>
            <h3 className="mt-2 flex items-center gap-2 text-lg font-semibold">
              {attentionCount > 0 ? (
                <AlertTriangle className="size-5 text-warning" aria-hidden="true" />
              ) : (
                <CheckCircle2 className="size-5 text-primary" aria-hidden="true" />
              )}
              {attentionCount > 0
                ? `${attentionCount} ${attentionCount === 1 ? "item precisa" : "itens precisam"} de decisão`
                : t("admin.attention.clearTitle")}
            </h3>
            <p className="mt-1 text-sm text-muted-foreground">
              {attentionCount > 0 ? t("admin.attention.subtitle") : t("admin.attention.clearBody")}
            </p>
          </div>
          <span className="rounded-full border border-border bg-elevated/60 px-3 py-1.5 font-mono text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
            {attentionCount} {attentionCount === 1 ? "pendência" : "pendências"}
          </span>
        </div>

        {attentionCount > 0 ? (
          <div className="mt-5 grid gap-3 lg:grid-cols-2">
            {missingConfiguration.length > 0 ? (
              <article className="rounded-xl border border-warning/25 bg-elevated/45 p-4">
                <p className="flex items-center gap-2 text-sm font-semibold">
                  <Settings2 className="size-4 text-warning" aria-hidden="true" />
                  {t("admin.attention.configurationTitle")}
                </p>
                <p className="mt-2 text-xs leading-5 text-muted-foreground">
                  {t("admin.attention.configurationBody")} {missingConfiguration.map(([label]) => label).join(", ")}.
                </p>
                <Button asChild variant="outline" className="mt-4 min-h-11 w-full sm:w-auto">
                  <Link to="/settings">{t("admin.attention.reviewSettings")}</Link>
                </Button>
              </article>
            ) : null}

            {(data?.expiredPendingInvitations ?? 0) > 0 ? (
              <article className="rounded-xl border border-warning/25 bg-elevated/45 p-4">
                <p className="flex items-center gap-2 text-sm font-semibold">
                  <Clock3 className="size-4 text-warning" aria-hidden="true" />
                  {t("admin.attention.expiredInvitesTitle")}
                </p>
                <p className="mt-2 text-xs leading-5 text-muted-foreground">
                  {data?.expiredPendingInvitations ?? 0} {t("admin.attention.expiredInvitesBody")}
                </p>
                <Button asChild variant="outline" className="mt-4 min-h-11 w-full sm:w-auto">
                  <Link to="/team">{t("admin.attention.reviewTeam")}</Link>
                </Button>
              </article>
            ) : null}
          </div>
        ) : null}
      </section>

      {tenantId ? <CiospCommercialDashboard tenantId={tenantId} /> : null}

      <section aria-labelledby="command-context-title">
        <div className="mb-3 flex items-end justify-between gap-3 px-1">
          <div>
            <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
              Contexto
            </p>
            <h3 id="command-context-title" className="mt-1 text-lg font-semibold">
              Estrutura administrativa
            </h3>
          </div>
        </div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <article className="surface-panel p-5">
            <p className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
              <UsersRound className="size-4" aria-hidden="true" />
              {t("team.members")}
            </p>
            <p className="mt-3 text-3xl font-semibold tabular-nums">{data?.activeMembers ?? 0}</p>
          </article>
          <article className="surface-panel p-5">
            <p className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
              <ShieldCheck className="size-4" aria-hidden="true" />
              {t("team.invitations")}
            </p>
            <p className="mt-3 text-3xl font-semibold tabular-nums">{data?.pendingInvitations ?? 0}</p>
          </article>
          <article className="surface-panel p-5 sm:col-span-2 lg:col-span-1">
            <p className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
              <Settings2 className="size-4" aria-hidden="true" />
              {t("team.inviteRole")}
            </p>
            <p className="mt-3 text-lg font-semibold">{role ? t(`role.${role}`) : "—"}</p>
          </article>
        </div>
      </section>

      <section className="grid gap-6 lg:grid-cols-[1fr_1.2fr]">
        <article className="surface-panel p-5">
          <h3 className="flex items-center gap-2 text-sm font-semibold">
            <Building2 className="size-4 text-primary" aria-hidden="true" />
            {t("settings.title")}
          </h3>
          <p className="mt-1 text-xs text-muted-foreground">
            Contexto do tenant usado pelas operações e pela equipe.
          </p>
          <dl className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
            {configurationItems.map(([label, value]) => (
              <div key={label} className="rounded-lg border border-border/70 bg-elevated/35 p-3">
                <dt className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
                  {label}
                </dt>
                <dd className="mt-1 truncate text-sm font-medium">{value || "—"}</dd>
              </div>
            ))}
          </dl>
          <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:flex-wrap">
            <Button asChild className="min-h-11">
              <Link to="/team">{t("nav.team")}</Link>
            </Button>
            <Button asChild variant="outline" className="min-h-11">
              <Link to="/operations">{t("nav.operations")}</Link>
            </Button>
          </div>
        </article>

        <AdminAuditTrail events={data?.audit ?? []} />
      </section>
    </div>
  );
}
