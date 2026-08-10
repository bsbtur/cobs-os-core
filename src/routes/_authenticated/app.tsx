import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Activity, Building2, CalendarRange, ShieldCheck, Users } from "lucide-react";

import { AppShell } from "@/app/shell/app-shell";
import { RequireTenant } from "@/app/shell/require-tenant";
import { supabase } from "@/integrations/supabase/client";
import { useI18n } from "@/lib/i18n";
import { useTenant } from "@/lib/tenant";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/_authenticated/app")({
  head: () => ({
    meta: [
      { title: "Command center — COBS OS" },
      {
        name: "description",
        content:
          "COBS OS command center: identity, tenant and access posture for your organization.",
      },
      { property: "og:title", content: "Command center — COBS OS" },
      {
        property: "og:description",
        content: "Identity, tenant and access posture for your organization.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: CommandCenter,
});

function Posture() {
  const { t } = useI18n();
  const { tenant, role } = useTenant();

  const counts = useQuery({
    queryKey: ["posture", tenant?.id],
    enabled: Boolean(tenant?.id),
    queryFn: async () => {
      const [people, members, experiences, liveOps] = await Promise.all([
        supabase
          .from("people")
          .select("id", { count: "exact", head: true })
          .eq("tenant_id", tenant!.id),
        supabase
          .from("memberships")
          .select("id", { count: "exact", head: true })
          .eq("tenant_id", tenant!.id),
        supabase
          .from("experiences")
          .select("id", { count: "exact", head: true })
          .eq("tenant_id", tenant!.id)
          .neq("status", "archived"),
        supabase
          .from("operations")
          .select("id", { count: "exact", head: true })
          .eq("tenant_id", tenant!.id)
          .in("status", ["planning", "ready", "active"])
          .is("archived_at", null),
      ]);
      return {
        people: people.count ?? 0,
        members: members.count ?? 0,
        experiences: experiences.count ?? 0,
        liveOps: liveOps.count ?? 0,
      };
    },
  });

  const cards = [
    { icon: Building2, label: t("settings.title"), value: tenant?.name ?? "—" },
    {
      icon: CalendarRange,
      label: t("w02.experiences"),
      value: String(counts.data?.experiences ?? "—"),
    },
    { icon: Activity, label: t("w02.activeOps"), value: String(counts.data?.liveOps ?? "—") },
    { icon: Users, label: t("people.title"), value: String(counts.data?.people ?? "—") },
    { icon: ShieldCheck, label: t("team.inviteRole"), value: role ? t(`role.${role}`) : "—" },
  ];

  return (
    <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5" aria-label={t("overview.title")}>
      {cards.map(({ icon: Icon, label, value }) => (
        <article key={label} className="surface-panel flex items-center gap-3 p-4">
          <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-primary-soft text-primary">
            <Icon className="size-4" aria-hidden="true" />
          </span>
          <div className="min-w-0">
            <p className="truncate font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
              {label}
            </p>
            <p className="truncate text-lg font-semibold">{value}</p>
          </div>
        </article>
      ))}
    </section>
  );
}

function CommandCenter() {
  const { t } = useI18n();

  return (
    <AppShell activeId="overview" title={t("overview.title")}>
      <div className="mx-auto w-full max-w-6xl space-y-6">
        <section className="animate-rise">
          <h2 className="text-2xl font-semibold lg:text-3xl">{t("overview.title")}</h2>
          <p className="mt-2 max-w-2xl text-sm text-muted-foreground">{t("overview.subtitle")}</p>
        </section>

        <RequireTenant>
          <div className="animate-rise space-y-6" style={{ animationDelay: "80ms" }}>
            <Posture />
            <section className="surface-panel p-5">
              <h3 className="text-base font-semibold">{t("nav.section.system")}</h3>
              <p className="mt-1 text-sm text-muted-foreground">{t("overview.noAnalyticsBody")}</p>
              <div className="mt-4 flex flex-wrap gap-2">
                <Button asChild variant="outline" className="min-h-11">
                  <Link to="/experiences">{t("exp.title")}</Link>
                </Button>
                <Button asChild variant="outline" className="min-h-11">
                  <Link to="/operations">{t("op.title")}</Link>
                </Button>
                <Button asChild variant="outline" className="min-h-11">
                  <Link to="/people">{t("people.title")}</Link>
                </Button>
                <Button asChild variant="outline" className="min-h-11">
                  <Link to="/team">{t("team.title")}</Link>
                </Button>
                <Button asChild variant="outline" className="min-h-11">
                  <Link to="/settings">{t("settings.title")}</Link>
                </Button>
              </div>
            </section>
          </div>
        </RequireTenant>
      </div>
    </AppShell>
  );
}
