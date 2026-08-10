import * as React from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CalendarRange, Plus, Sparkles } from "lucide-react";

import { AppShell } from "@/app/shell/app-shell";
import { RequireTenant } from "@/app/shell/require-tenant";
import { supabase } from "@/integrations/supabase/client";
import { humanizeError } from "@/lib/auth";
import { useI18n } from "@/lib/i18n";
import { useTenant } from "@/lib/tenant";
import {
  EXPERIENCE_KINDS,
  newIdempotencyKey,
  slugify,
  type ExperienceKind,
  type ExperienceRow,
} from "@/lib/w02";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { EmptyState } from "@/components/feedback/empty-state";
import { PanelSkeleton } from "@/components/feedback/loading";
import { StatusPill } from "@/components/feedback/status-pill";
import { feedback } from "@/components/feedback/feedback";

export const Route = createFileRoute("/_authenticated/experiences/")({
  head: () => ({
    meta: [
      { title: "Experiences — COBS OS catalog" },
      {
        name: "description",
        content:
          "Reusable experience definitions in COBS OS: what your organization knows how to deliver, separate from any single execution.",
      },
      { property: "og:title", content: "Experiences — COBS OS catalog" },
      {
        property: "og:description",
        content: "Reusable definitions of what your organization delivers.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: ExperiencesPage,
});

const STEPS = ["exp.step.identity", "exp.step.context", "exp.step.review"] as const;

function CreateExperienceWizard({ onDone }: { onDone: () => void }) {
  const { t, locale } = useI18n();
  const { tenant } = useTenant();
  const queryClient = useQueryClient();
  const idempotencyKey = React.useRef(newIdempotencyKey());
  const [step, setStep] = React.useState(0);
  const [form, setForm] = React.useState({
    name: "",
    slug: "",
    kind: "tourism" as ExperienceKind,
    shortDescription: "",
    description: "",
    country: tenant?.country_code ?? "",
    region: "",
    city: "",
    locale: tenant?.default_locale ?? "pt-BR",
    timezone: tenant?.timezone ?? "America/Sao_Paulo",
  });

  const set = <K extends keyof typeof form>(key: K, value: (typeof form)[K]) =>
    setForm((f) => ({ ...f, [key]: value }));

  const create = useMutation({
    mutationFn: async () => {
      const optional: Record<string, string> = {};
      if (form.shortDescription.trim()) optional["_short_description"] = form.shortDescription.trim();
      if (form.description.trim()) optional["_description"] = form.description.trim();
      if (form.country.trim()) optional["_country_code"] = form.country.trim().toUpperCase();
      if (form.region.trim()) optional["_region"] = form.region.trim();
      if (form.city.trim()) optional["_city"] = form.city.trim();
      const { data, error } = await supabase.rpc("create_experience", {
        _tenant_id: tenant!.id,
        _name: form.name.trim(),
        _slug: form.slug.trim() || slugify(form.name),
        _experience_kind: form.kind,
        _idempotency_key: idempotencyKey.current,
        _default_locale: form.locale,
        _default_timezone: form.timezone,
        ...optional,
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      feedback.success(t("exp.created"));
      void queryClient.invalidateQueries({ queryKey: ["experiences", tenant?.id] });
      onDone();
    },
    onError: (error) => feedback.error(humanizeError(error, locale)),
  });

  const canContinue = step === 0 ? form.name.trim().length > 1 : true;

  return (
    <section className="surface-panel animate-rise space-y-5 p-5">
      <ol className="flex flex-wrap gap-2" aria-label={t("exp.create")}>
        {STEPS.map((key, index) => (
          <li
            key={key}
            aria-current={index === step ? "step" : undefined}
            className={
              index === step
                ? "rounded-full bg-primary px-3 py-1 font-mono text-[10px] uppercase tracking-[0.14em] text-primary-foreground"
                : "rounded-full border border-border px-3 py-1 font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground"
            }
          >
            {index + 1}. {t(key)}
          </li>
        ))}
      </ol>

      {step === 0 ? (
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="exp-name">{t("exp.name")}</Label>
            <Input
              id="exp-name"
              value={form.name}
              onChange={(e) => {
                set("name", e.target.value);
                set("slug", slugify(e.target.value));
              }}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="exp-slug">{t("exp.slug")}</Label>
            <Input
              id="exp-slug"
              value={form.slug}
              onChange={(e) => set("slug", slugify(e.target.value))}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="exp-kind">{t("exp.kind")}</Label>
            <Select value={form.kind} onValueChange={(v) => set("kind", v as ExperienceKind)}>
              <SelectTrigger id="exp-kind">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {EXPERIENCE_KINDS.map((kind) => (
                  <SelectItem key={kind} value={kind}>
                    {t(`kind.${kind}`)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="exp-short">{t("exp.shortDescription")}</Label>
            <Input
              id="exp-short"
              value={form.shortDescription}
              onChange={(e) => set("shortDescription", e.target.value)}
            />
          </div>
        </div>
      ) : null}

      {step === 1 ? (
        <div className="grid gap-4 sm:grid-cols-3">
          <div className="space-y-1.5">
            <Label htmlFor="exp-country">{t("exp.country")}</Label>
            <Input
              id="exp-country"
              maxLength={2}
              value={form.country}
              onChange={(e) => set("country", e.target.value.toUpperCase())}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="exp-region">{t("exp.region")}</Label>
            <Input
              id="exp-region"
              value={form.region}
              onChange={(e) => set("region", e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="exp-city">{t("exp.city")}</Label>
            <Input id="exp-city" value={form.city} onChange={(e) => set("city", e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="exp-locale">{t("exp.locale")}</Label>
            <Input
              id="exp-locale"
              value={form.locale}
              onChange={(e) => set("locale", e.target.value)}
            />
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="exp-tz">{t("exp.timezone")}</Label>
            <Input
              id="exp-tz"
              value={form.timezone}
              onChange={(e) => set("timezone", e.target.value)}
            />
          </div>
          <div className="space-y-1.5 sm:col-span-3">
            <Label htmlFor="exp-desc">{t("exp.description")}</Label>
            <Textarea
              id="exp-desc"
              rows={4}
              value={form.description}
              onChange={(e) => set("description", e.target.value)}
            />
          </div>
        </div>
      ) : null}

      {step === 2 ? (
        <dl className="grid gap-3 sm:grid-cols-2">
          {[
            [t("exp.name"), form.name],
            [t("exp.slug"), form.slug],
            [t("exp.kind"), t(`kind.${form.kind}`)],
            [t("exp.shortDescription"), form.shortDescription || t("common.none")],
            [
              t("exp.context"),
              [form.city, form.region, form.country].filter(Boolean).join(" · ") || t("common.none"),
            ],
            [t("exp.timezone"), `${form.timezone} · ${form.locale}`],
          ].map(([label, value]) => (
            <div key={label} className="rounded-lg border border-border bg-elevated/50 px-3 py-2">
              <dt className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
                {label}
              </dt>
              <dd className="mt-0.5 truncate text-sm">{value}</dd>
            </div>
          ))}
        </dl>
      ) : null}

      <div className="flex flex-wrap items-center justify-between gap-2">
        <Button variant="ghost" className="min-h-11" onClick={onDone}>
          {t("common.cancel")}
        </Button>
        <div className="flex gap-2">
          {step > 0 ? (
            <Button variant="outline" className="min-h-11" onClick={() => setStep(step - 1)}>
              {t("common.back")}
            </Button>
          ) : null}
          {step < STEPS.length - 1 ? (
            <Button
              className="min-h-11"
              disabled={!canContinue}
              onClick={() => setStep(step + 1)}
            >
              {t("common.next")}
            </Button>
          ) : (
            <Button
              className="min-h-11"
              disabled={create.isPending}
              onClick={() => create.mutate()}
            >
              {create.isPending ? t("common.saving") : t("exp.createDraft")}
            </Button>
          )}
        </div>
      </div>
    </section>
  );
}

function ExperienceGrid({ items }: { items: ExperienceRow[] }) {
  const { t } = useI18n();
  return (
    <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
      {items.map((exp, index) => (
        <Link
          key={exp.id}
          to="/experiences/$experienceId"
          params={{ experienceId: exp.id }}
          className="surface-panel animate-rise group flex flex-col gap-3 p-4 transition-colors hover:border-border-strong"
          style={{ animationDelay: `${Math.min(index, 8) * 40}ms` }}
        >
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="truncate text-base font-semibold">{exp.name}</p>
              <p className="truncate font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
                {exp.slug} · {t(`kind.${exp.experience_kind}`)}
              </p>
            </div>
            <StatusPill status={exp.status} />
          </div>
          {exp.short_description ? (
            <p className="line-clamp-2 text-sm text-muted-foreground">{exp.short_description}</p>
          ) : null}
          <p className="mt-auto truncate text-xs text-muted-foreground">
            {[exp.city, exp.region, exp.country_code].filter(Boolean).join(" · ") ||
              t("common.none")}
          </p>
        </Link>
      ))}
    </div>
  );
}

function ExperiencesWorkspace() {
  const { t } = useI18n();
  const { tenant, canManage } = useTenant();
  const [creating, setCreating] = React.useState(false);

  const experiences = useQuery({
    queryKey: ["experiences", tenant?.id],
    enabled: Boolean(tenant?.id),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("experiences")
        .select("*")
        .eq("tenant_id", tenant!.id)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-2xl font-semibold lg:text-3xl">{t("exp.title")}</h2>
          <p className="mt-2 max-w-2xl text-sm text-muted-foreground">{t("exp.subtitle")}</p>
        </div>
        {canManage && !creating ? (
          <Button className="min-h-11" onClick={() => setCreating(true)}>
            <Plus className="mr-2 size-4" aria-hidden="true" />
            {t("exp.create")}
          </Button>
        ) : null}
      </div>

      {creating ? <CreateExperienceWizard onDone={() => setCreating(false)} /> : null}

      {experiences.isLoading ? <PanelSkeleton rows={3} /> : null}

      {!experiences.isLoading && (experiences.data?.length ?? 0) === 0 && !creating ? (
        <EmptyState
          icon={Sparkles}
          title={t("exp.empty")}
          body={t("exp.emptyBody")}
          action={
            canManage ? (
              <Button className="min-h-11" onClick={() => setCreating(true)}>
                {t("exp.create")}
              </Button>
            ) : undefined
          }
        />
      ) : null}

      {experiences.data && experiences.data.length > 0 ? (
        <ExperienceGrid items={experiences.data} />
      ) : null}
    </div>
  );
}

function ExperiencesPage() {
  const { t } = useI18n();
  return (
    <AppShell activeId="experiences" title={t("exp.title")}>
      <div className="mx-auto w-full max-w-6xl">
        <RequireTenant>
          <ExperiencesWorkspace />
        </RequireTenant>
      </div>
    </AppShell>
  );
}

export const experiencesIcon = CalendarRange;
