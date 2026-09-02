import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Building2, History, Settings2, ShieldCheck, UsersRound } from "lucide-react";

import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/feedback/empty-state";
import { PanelSkeleton } from "@/components/feedback/loading";
import { supabase } from "@/integrations/supabase/client";
import { useI18n } from "@/lib/i18n";
import { useTenant } from "@/lib/tenant";

type AuditRow = {
  id: string;
  action: string;
  subject_type: string;
  occurred_at: string;
};

export function AdminOverview() {
  const { t, locale } = useI18n();
  const { tenant, role } = useTenant();
  const tenantId = tenant?.id;

  const overview = useQuery({
    queryKey: ["admin-overview", tenantId],
    enabled: Boolean(tenantId),
    queryFn: async () => {
      const [membershipsResult, invitationsResult, auditResult] = await Promise.all([
        supabase.from("memberships").select("id,status").eq("tenant_id", tenantId!),
        supabase.from("invitations").select("id,status").eq("tenant_id", tenantId!),
        supabase
          .from("audit_events")
          .select("id,action,subject_type,occurred_at")
          .eq("tenant_id", tenantId!)
          .order("occurred_at", { ascending: false })
          .limit(5),
      ]);

      if (membershipsResult.error) throw membershipsResult.error;
      if (invitationsResult.error) throw invitationsResult.error;
      if (auditResult.error) throw auditResult.error;

      return {
        activeMembers: (membershipsResult.data ?? []).filter((item) => item.status === "active").length,
        pendingInvitations: (invitationsResult.data ?? []).filter((item) => item.status === "pending").length,
        audit: (auditResult.data ?? []) as AuditRow[],
      };
    },
  });

  if (overview.isLoading) return <PanelSkeleton rows={4} />;

  if (overview.isError) {
    return <EmptyState icon={ShieldCheck} title={t("state.error.title")} body={t("state.error.body")} />;
  }

  const data = overview.data;

  return (
    <div className="space-y-6">
      <section className="animate-rise flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-primary">
            {t("settings.title")}
          </p>
          <h2 className="mt-1 text-2xl font-semibold lg:text-3xl">
            {tenant?.name ?? t("settings.title")}
          </h2>
          <p className="mt-2 max-w-3xl text-sm text-muted-foreground">{t("settings.subtitle")}</p>
        </div>
        <div className="flex items-center gap-2 rounded-lg border px-3 py-2 text-xs text-muted-foreground">
          <ShieldCheck className="size-4 text-primary" aria-hidden="true" />
          {role ? t(`role.${role}`) : "—"}
        </div>
      </section>

      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
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
        <article className="surface-panel p-5">
          <p className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
            <Settings2 className="size-4" aria-hidden="true" />
            {t("team.inviteRole")}
          </p>
          <p className="mt-3 text-lg font-semibold">{role ? t(`role.${role}`) : "—"}</p>
        </article>
      </section>

      <section className="grid gap-6 lg:grid-cols-[1fr_1.2fr]">
        <article className="surface-panel p-5">
          <h3 className="flex items-center gap-2 text-sm font-semibold">
            <Building2 className="size-4 text-primary" aria-hidden="true" />
            {t("settings.title")}
          </h3>
          <dl className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
            {tenant
              ? [
                  [t("onboarding.country"), tenant.country_code],
                  [t("onboarding.currency"), tenant.currency_code],
                  [t("onboarding.locale"), tenant.default_locale],
                  [t("onboarding.timezone"), tenant.timezone],
                ].map(([label, value]) => (
                  <div key={label} className="rounded-lg border border-border/70 p-3">
                    <dt className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
                      {label}
                    </dt>
                    <dd className="mt-1 truncate text-sm font-medium">{value}</dd>
                  </div>
                ))
              : null}
          </dl>
          <div className="mt-4 flex flex-wrap gap-2">
            <Button asChild className="min-h-11">
              <Link to="/team">{t("nav.team")}</Link>
            </Button>
            <Button asChild variant="outline" className="min-h-11">
              <Link to="/operations">{t("nav.operations")}</Link>
            </Button>
          </div>
        </article>

        <article className="surface-panel p-5">
          <h3 className="flex items-center gap-2 text-sm font-semibold">
            <History className="size-4 text-primary" aria-hidden="true" />
            {t("settings.audit")}
          </h3>
          <p className="mt-1 text-xs text-muted-foreground">{t("settings.auditHint")}</p>
          <div className="mt-4">
            {(data?.audit ?? []).length === 0 ? (
              <EmptyState icon={History} title={t("settings.auditEmpty")} />
            ) : (
              <ul className="divide-y divide-border/70">
                {(data?.audit ?? []).map((event) => (
                  <li key={event.id} className="flex flex-wrap items-center gap-3 py-2.5">
                    <span className="font-mono text-[11px] text-muted-foreground">
                      {new Intl.DateTimeFormat(locale, {
                        dateStyle: "short",
                        timeStyle: "short",
                      }).format(new Date(event.occurred_at))}
                    </span>
                    <span className="rounded-full bg-primary-soft px-2 py-0.5 font-mono text-[10px] uppercase tracking-[0.12em] text-primary">
                      {event.action}
                    </span>
                    <span className="truncate text-xs text-muted-foreground">{event.subject_type}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </article>
      </section>
    </div>
  );
}
