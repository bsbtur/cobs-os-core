import * as React from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Building2 } from "lucide-react";

import { AppShell } from "@/app/shell/app-shell";
import { supabase } from "@/integrations/supabase/client";
import { humanizeError } from "@/lib/auth";
import { useI18n } from "@/lib/i18n";
import { useTenant } from "@/lib/tenant";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { feedback } from "@/components/feedback/feedback";

export const Route = createFileRoute("/_authenticated/onboarding")({
  head: () => ({
    meta: [
      { title: "Create your organization — COBS OS" },
      {
        name: "description",
        content: "Create an isolated COBS OS organization with global-ready locale, currency and time zone defaults.",
      },
      { property: "og:title", content: "Create your organization — COBS OS" },
      {
        property: "og:description",
        content: "Create an isolated COBS OS organization in a few seconds.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: Onboarding,
});

function slugify(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
}

const BOOTSTRAP_INTENT_KEY = "cobs.bootstrap.intent";

function Onboarding() {
  const { t, locale } = useI18n();
  const navigate = useNavigate();
  const { refetch, setActiveTenantId } = useTenant();
  const [name, setName] = React.useState("");
  const [slug, setSlug] = React.useState("");
  const [slugTouched, setSlugTouched] = React.useState(false);
  const [busy, setBusy] = React.useState(false);

  const effectiveSlug = slugTouched ? slug : slugify(name);

  const onSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);

    // Idempotency key is generated once per user intent and survives retries.
    let key = window.sessionStorage.getItem(BOOTSTRAP_INTENT_KEY);
    if (!key) {
      key = crypto.randomUUID();
      window.sessionStorage.setItem(BOOTSTRAP_INTENT_KEY, key);
    }

    setBusy(true);
    const { data, error } = await supabase.rpc("bootstrap_tenant", {
      _name: name.trim(),
      _slug: effectiveSlug,
      _country_code: String(form.get("country") ?? "BR").toUpperCase(),
      _default_locale: String(form.get("locale") ?? locale),
      _timezone: String(form.get("timezone") ?? "America/Sao_Paulo"),
      _currency_code: String(form.get("currency") ?? "BRL").toUpperCase(),
      _idempotency_key: key,
    });
    setBusy(false);

    if (error) {
      feedback.error(humanizeError(error, locale));
      return;
    }

    const result = data as { tenant_id?: string } | null;
    window.sessionStorage.removeItem(BOOTSTRAP_INTENT_KEY);
    if (result?.tenant_id) setActiveTenantId(result.tenant_id);
    refetch();
    feedback.success(t("onboarding.created"));
    void navigate({ to: "/app" });
  };

  return (
    <AppShell activeId="overview" title={t("onboarding.title")}>
      <div className="mx-auto w-full max-w-2xl">
        <section className="animate-rise">
          <span className="grid size-11 place-items-center rounded-lg bg-primary-soft text-primary">
            <Building2 className="size-5" aria-hidden="true" />
          </span>
          <h2 className="mt-4 text-2xl font-semibold">{t("onboarding.title")}</h2>
          <p className="mt-2 text-sm text-muted-foreground">{t("onboarding.subtitle")}</p>
        </section>

        <form
          onSubmit={onSubmit}
          className="surface-panel animate-rise mt-6 space-y-5 p-5"
          style={{ animationDelay: "80ms" }}
        >
          <div className="space-y-2">
            <Label htmlFor="org-name">{t("onboarding.name")}</Label>
            <Input
              id="org-name"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoComplete="organization"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="org-slug">{t("onboarding.slug")}</Label>
            <Input
              id="org-slug"
              required
              value={effectiveSlug}
              pattern="[a-z0-9][a-z0-9-]{1,46}[a-z0-9]"
              onChange={(e) => {
                setSlugTouched(true);
                setSlug(slugify(e.target.value));
              }}
            />
            <p className="text-xs text-muted-foreground">{t("onboarding.slugHint")}</p>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="org-country">{t("onboarding.country")}</Label>
              <Input id="org-country" name="country" defaultValue="BR" maxLength={2} required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="org-currency">{t("onboarding.currency")}</Label>
              <Input id="org-currency" name="currency" defaultValue="BRL" maxLength={3} required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="org-locale">{t("onboarding.locale")}</Label>
              <Input id="org-locale" name="locale" defaultValue="pt-BR" required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="org-tz">{t("onboarding.timezone")}</Label>
              <Input id="org-tz" name="timezone" defaultValue="America/Sao_Paulo" required />
            </div>
          </div>

          <Button type="submit" className="min-h-11 w-full" disabled={busy}>
            {busy ? t("common.saving") : t("onboarding.submit")}
          </Button>
          <p className="text-center font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
            {t("onboarding.idempotent")}
          </p>
        </form>
      </div>
    </AppShell>
  );
}
