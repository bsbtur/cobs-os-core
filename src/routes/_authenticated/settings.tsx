import * as React from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { BedDouble, Building2, Bus, Settings2, UserRound } from "lucide-react";

import { AppShell } from "@/app/shell/app-shell";
import { RequireTenant } from "@/app/shell/require-tenant";
import { AdminAuditTrail, type AdminAuditEvent } from "@/components/admin/audit-trail";
import { supabase } from "@/integrations/supabase/client";
import { useAuth, humanizeError } from "@/lib/auth";
import { useI18n } from "@/lib/i18n";
import { useTenant } from "@/lib/tenant";
import { feedback } from "@/components/feedback/feedback";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

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

/**
 * Self-identity maintenance (W01 · update_my_display_name).
 * Self-service only: the command derives the identity from auth.uid().
 */
function DisplayNameCard() {
  const { t, locale } = useI18n();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [value, setValue] = React.useState("");
  const [busy, setBusy] = React.useState(false);

  const profile = useQuery({
    queryKey: ["my-profile", user?.id],
    enabled: Boolean(user?.id),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("id, display_name")
        .eq("id", user!.id)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  React.useEffect(() => {
    if (profile.data) setValue(profile.data.display_name ?? "");
  }, [profile.data]);

  const onSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setBusy(true);
    const { data, error } = await supabase.rpc("update_my_display_name", {
      _display_name: value.trim(),
      _idempotency_key: crypto.randomUUID(),
    });
    setBusy(false);
    if (error) {
      feedback.error(humanizeError(error, locale));
      return;
    }
    const result = data as { unchanged?: boolean } | null;
    feedback.success(result?.unchanged ? t("identity.unchanged") : t("identity.saved"));
    void queryClient.invalidateQueries();
  };

  return (
    <section className="surface-panel animate-rise p-5">
      <h3 className="flex items-center gap-2 text-sm font-semibold">
        <UserRound className="size-4 text-primary" aria-hidden="true" />
        {t("identity.title")}
      </h3>
      <p className="mt-1 text-xs text-muted-foreground">{t("identity.hint")}</p>
      <form onSubmit={onSubmit} className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-end">
        <div className="min-w-0 flex-1 space-y-2">
          <Label htmlFor="display-name">{t("identity.field")}</Label>
          <Input
            id="display-name"
            value={value}
            maxLength={120}
            required
            autoComplete="name"
            onChange={(e) => setValue(e.target.value)}
          />
        </div>
        <Button type="submit" className="min-h-11" disabled={busy || value.trim().length === 0}>
          {busy ? t("common.saving") : t("identity.save")}
        </Button>
      </form>
    </section>
  );
}

function OperationalResourcesCard() {
  const { t } = useI18n();

  return (
    <section className="surface-panel animate-rise p-5" style={{ animationDelay: "40ms" }}>
      <h3 className="flex items-center gap-2 text-sm font-semibold">
        <Bus className="size-4 text-primary" aria-hidden="true" />
        {t("nav.operations")}
      </h3>
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
        <Button asChild variant="outline" className="min-h-11">
          <Link to="/settings/venues">
            <Building2 className="mr-2 size-4" aria-hidden="true" />
            {t("w07.venues.open")}
          </Link>
        </Button>
      </div>
    </section>
  );
}

function OrganizationGovernance() {
  const { t } = useI18n();
  const { tenant, canManage } = useTenant();

  const audit = useQuery({
    queryKey: ["audit", tenant?.id],
    enabled: Boolean(tenant?.id) && canManage,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("audit_events")
        .select(
          "id,action,actor_profile_id,correlation_id,occurred_at,subject_id,subject_type",
        )
        .eq("tenant_id", tenant!.id)
        .order("occurred_at", { ascending: false })
        .limit(50);
      if (error) throw error;
      return data as AdminAuditEvent[];
    },
  });

  if (!canManage) return null;

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
    <>
      <section className="surface-panel animate-rise p-5" style={{ animationDelay: "80ms" }}>
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
      </section>

      <div className="animate-rise" style={{ animationDelay: "120ms" }}>
        <AdminAuditTrail
          events={audit.data ?? []}
          loading={audit.isLoading}
          error={audit.isError}
        />
      </div>
    </>
  );
}

function Body() {
  return (
    <div className="space-y-6">
      <DisplayNameCard />
      <OperationalResourcesCard />
      <OrganizationGovernance />
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
