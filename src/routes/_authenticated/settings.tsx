import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Bus, History, Settings2 } from "lucide-react";

import { AppShell } from "@/app/shell/app-shell";
import { RequireTenant } from "@/app/shell/require-tenant";
import { supabase } from "@/integrations/supabase/client";
import { useI18n } from "@/lib/i18n";
import { useTenant } from "@/lib/tenant";
import { EmptyState } from "@/components/feedback/empty-state";
import { PanelSkeleton } from "@/components/feedback/loading";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/_authenticated/settings")({
  head: () => ({
    meta: [
      { title: "Organization settings — COBS OS" },
      {
        name: "description",
        content:
          "Global-ready organization settings and the append-only audit trail for your COBS OS tenant.",
      },
      { property: "og:title", content: "Organization settings — COBS OS" },
      {
        property: "og:description",
        content: "Locale, currency, time zone and the append-only audit trail.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: SettingsPage,
});

function Body() {
  const { t, locale } = useI18n();
  const { tenant } = useTenant();

  const audit = useQuery({
    queryKey: ["audit", tenant?.id],
    enabled: Boolean(tenant?.id),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("audit_events")
        .select("id, action, subject_type, subject_id, occurred_at")
        .eq("tenant_id", tenant!.id)
        .order("occurred_at", { ascending: false })
        .limit(50);
      if (error) throw error;
      return data;
    },
  });

  const rows: Array<[string, string]> = tenant
    ? [
        [t("onboarding.name"), tenant.name],
        [t("onboarding.slug"), tenant.slug],
        [t("onboarding.country"), tenant.country_code],
        [t("onboarding.currency"), tenant.currency_code],
        [t("onboarding.locale"), tenant.default_locale],
        [t("onboarding.timezone"), tenant.timezone],
      ]
    : [];

  return (
    <div className="space-y-6">
      <section className="surface-panel animate-rise p-5">
        <h3 className="flex items-center gap-2 text-sm font-semibold">
          <Settings2 className="size-4 text-primary" aria-hidden="true" />
          {t("settings.org")}
        </h3>
        <dl className="mt-4 grid gap-3 sm:grid-cols-2">
          {rows.map(([label, value]) => (
            <div key={label} className="rounded-lg border border-border/70 p-3">
              <dt className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
                {label}
              </dt>
              <dd className="mt-1 truncate text-sm font-medium">{value}</dd>
            </div>
          ))}
        </dl>
        <div className="mt-4 flex flex-wrap gap-2">
          <Button asChild variant="outline" className="min-h-11">
            <Link to="/settings/fleet">
              <Bus className="mr-2 size-4" aria-hidden="true" />
              {t("w05.fleet.open")}
            </Link>
          </Button>
          <Button asChild variant="outline" className="min-h-11">
            <Link to="/settings/properties">
              <BedDouble className="mr-2 size-4" aria-hidden="true" />
              {t("w06.prop.open")}
            </Link>
          </Button>
        </div>
      </section>


      <section className="surface-panel animate-rise p-5" style={{ animationDelay: "80ms" }}>
        <h3 className="flex items-center gap-2 text-sm font-semibold">
          <History className="size-4 text-primary" aria-hidden="true" />
          {t("settings.audit")}
        </h3>
        <p className="mt-1 text-xs text-muted-foreground">{t("settings.auditHint")}</p>
        <div className="mt-4">
          {audit.isLoading ? (
            <PanelSkeleton rows={3} />
          ) : (audit.data ?? []).length === 0 ? (
            <EmptyState icon={History} title={t("settings.auditEmpty")} />
          ) : (
            <ul className="divide-y divide-border/70">
              {(audit.data ?? []).map((event) => (
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
                  <span className="truncate text-xs text-muted-foreground">
                    {event.subject_type}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>
    </div>
  );
}

function SettingsPage() {
  const { t } = useI18n();
  return (
    <AppShell activeId="settings" title={t("settings.title")}>
      <div className="mx-auto w-full max-w-4xl space-y-6">
        <section className="animate-rise">
          <h2 className="text-2xl font-semibold lg:text-3xl">{t("settings.title")}</h2>
          <p className="mt-2 max-w-2xl text-sm text-muted-foreground">{t("settings.subtitle")}</p>
        </section>
        <RequireTenant>
          <Body />
        </RequireTenant>
      </div>
    </AppShell>
  );
}
