import * as React from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Activity, Plus } from "lucide-react";

import { AppShell } from "@/app/shell/app-shell";
import { RequireTenant } from "@/app/shell/require-tenant";
import { supabase } from "@/integrations/supabase/client";
import { humanizeError } from "@/lib/auth";
import { useI18n } from "@/lib/i18n";
import { formatDateTime } from "@/lib/format";
import { useTenant } from "@/lib/tenant";
import {
  EXPERIENCE_KINDS,
  effectiveWindow,
  fromLocalInput,
  newIdempotencyKey,
  suggestOperationCode,
  type ExperienceKind,
  type OperationRow,
} from "@/lib/w02";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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

export const Route = createFileRoute("/_authenticated/operations/")({
  head: () => ({
    meta: [
      { title: "Operations — COBS OS execution" },
      {
        name: "description",
        content:
          "Real executions in COBS OS: every operation carries its own historical identity, planned baseline and current forecast.",
      },
      { property: "og:title", content: "Operations — COBS OS execution" },
      {
        property: "og:description",
        content: "Real executions with historical identity, baseline and forecast.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: OperationsPage,
});

const STEPS = ["op.step.what", "op.step.identity", "op.step.when", "op.step.review"] as const;

function CreateOperationWizard({ onDone }: { onDone: () => void }) {
  const { t, locale } = useI18n();
  const { tenant } = useTenant();
  const queryClient = useQueryClient();
  const idempotencyKey = React.useRef(newIdempotencyKey());
  const [step, setStep] = React.useState(0);
  const [form, setForm] = React.useState({
    experienceId: "",
    offeringId: "",
    name: "",
    code: "",
    kind: "tourism" as ExperienceKind,
    country: tenant?.country_code ?? "BR",
    region: "",
    city: "",
    timezone: tenant?.timezone ?? "America/Sao_Paulo",
    plannedStart: "",
    plannedEnd: "",
  });

  const set = <K extends keyof typeof form>(key: K, value: (typeof form)[K]) =>
    setForm((f) => ({ ...f, [key]: value }));

  const experiences = useQuery({
    queryKey: ["experiences", tenant?.id],
    enabled: Boolean(tenant?.id),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("experiences")
        .select("id, name, experience_kind, default_timezone, country_code, region, city")
        .eq("tenant_id", tenant!.id)
        .neq("status", "archived")
        .order("name");
      if (error) throw error;
      return data;
    },
  });

  const offerings = useQuery({
    queryKey: ["offerings", form.experienceId],
    enabled: Boolean(form.experienceId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("offerings")
        .select("id, name, status")
        .eq("experience_id", form.experienceId)
        .neq("status", "archived")
        .order("name");
      if (error) throw error;
      return data;
    },
  });

  const create = useMutation({
    mutationFn: async () => {
      const optional: Record<string, string> = {};
      if (form.experienceId) optional["_experience_id"] = form.experienceId;
      if (form.offeringId) optional["_offering_id"] = form.offeringId;
      if (form.region.trim()) optional["_primary_region"] = form.region.trim();
      if (form.city.trim()) optional["_primary_city"] = form.city.trim();
      const { error } = await supabase.rpc("create_operation", {
        _tenant_id: tenant!.id,
        _name: form.name.trim(),
        _code: form.code.trim() || suggestOperationCode(form.name, form.plannedStart),
        _operation_kind: form.kind,
        _primary_country: form.country.trim().toUpperCase(),
        _timezone: form.timezone,
        _planned_start: fromLocalInput(form.plannedStart),
        _planned_end: fromLocalInput(form.plannedEnd),
        _idempotency_key: idempotencyKey.current,
        ...optional,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      feedback.success(t("op.created"));
      void queryClient.invalidateQueries({ queryKey: ["operations", tenant?.id] });
      onDone();
    },
    onError: (error) => feedback.error(humanizeError(error, locale)),
  });

  const canContinue =
    step === 1
      ? form.name.trim().length > 1
      : step === 2
        ? Boolean(form.plannedStart && form.plannedEnd && form.plannedEnd > form.plannedStart)
        : true;

  return (
    <section className="surface-panel animate-rise space-y-5 p-5">
      <ol className="flex flex-wrap gap-2" aria-label={t("op.create")}>
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
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="op-exp">{t("op.fromExperience")}</Label>
            <Select
              value={form.experienceId || "standalone"}
              onValueChange={(value) => {
                if (value === "standalone") {
                  set("experienceId", "");
                  set("offeringId", "");
                  return;
                }
                const exp = experiences.data?.find((e) => e.id === value);
                setForm((f) => ({
                  ...f,
                  experienceId: value,
                  offeringId: "",
                  name: f.name || (exp?.name ?? ""),
                  kind: (exp?.experience_kind as ExperienceKind) ?? f.kind,
                  timezone: exp?.default_timezone ?? f.timezone,
                  country: exp?.country_code ?? f.country,
                  region: exp?.region ?? f.region,
                  city: exp?.city ?? f.city,
                }));
              }}
            >
              <SelectTrigger id="op-exp">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="standalone">{t("op.standalone")}</SelectItem>
                {(experiences.data ?? []).map((exp) => (
                  <SelectItem key={exp.id} value={exp.id}>
                    {exp.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">{t("op.standaloneHint")}</p>
          </div>

          {form.experienceId ? (
            <div className="space-y-1.5">
              <Label htmlFor="op-off">{t("op.fromOffering")}</Label>
              <Select
                value={form.offeringId || "none"}
                onValueChange={(v) => set("offeringId", v === "none" ? "" : v)}
              >
                <SelectTrigger id="op-off">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">{t("common.none")}</SelectItem>
                  {(offerings.data ?? []).map((off) => (
                    <SelectItem key={off.id} value={off.id}>
                      {off.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          ) : null}
        </div>
      ) : null}

      {step === 1 ? (
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="op-name">{t("op.name")}</Label>
            <Input id="op-name" value={form.name} onChange={(e) => set("name", e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="op-code">{t("op.code")}</Label>
            <Input
              id="op-code"
              value={form.code}
              placeholder={suggestOperationCode(form.name, form.plannedStart)}
              onChange={(e) => set("code", e.target.value.toUpperCase())}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="op-kind">{t("op.kind")}</Label>
            <Select value={form.kind} onValueChange={(v) => set("kind", v as ExperienceKind)}>
              <SelectTrigger id="op-kind">
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
          <div className="space-y-1.5">
            <Label htmlFor="op-country">{t("op.country")}</Label>
            <Input
              id="op-country"
              maxLength={2}
              value={form.country}
              onChange={(e) => set("country", e.target.value.toUpperCase())}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="op-region">{t("op.region")}</Label>
            <Input
              id="op-region"
              value={form.region}
              onChange={(e) => set("region", e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="op-city">{t("op.city")}</Label>
            <Input id="op-city" value={form.city} onChange={(e) => set("city", e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="op-tz">{t("op.timezone")}</Label>
            <Input
              id="op-tz"
              value={form.timezone}
              onChange={(e) => set("timezone", e.target.value)}
            />
          </div>
        </div>
      ) : null}

      {step === 2 ? (
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="op-start">{t("op.plannedStart")}</Label>
            <Input
              id="op-start"
              type="datetime-local"
              value={form.plannedStart}
              onChange={(e) => set("plannedStart", e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="op-end">{t("op.plannedEnd")}</Label>
            <Input
              id="op-end"
              type="datetime-local"
              value={form.plannedEnd}
              onChange={(e) => set("plannedEnd", e.target.value)}
            />
          </div>
          <p className="text-xs text-muted-foreground sm:col-span-2">{t("op.plannedFrozen")}</p>
        </div>
      ) : null}

      {step === 3 ? (
        <dl className="grid gap-3 sm:grid-cols-2">
          {[
            [t("op.name"), form.name],
            [t("op.code"), form.code || suggestOperationCode(form.name, form.plannedStart)],
            [t("op.kind"), t(`kind.${form.kind}`)],
            [
              t("op.lineage"),
              form.experienceId
                ? (experiences.data?.find((e) => e.id === form.experienceId)?.name ?? "")
                : t("op.lineageNone"),
            ],
            [t("op.location"), [form.city, form.region, form.country].filter(Boolean).join(" · ")],
            [t("op.timezone"), form.timezone],
            [t("op.plannedStart"), form.plannedStart.replace("T", " ")],
            [t("op.plannedEnd"), form.plannedEnd.replace("T", " ")],
          ].map(([label, value]) => (
            <div key={label} className="rounded-lg border border-border bg-elevated/50 px-3 py-2">
              <dt className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
                {label}
              </dt>
              <dd className="mt-0.5 truncate text-sm">{value || t("common.none")}</dd>
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
            <Button className="min-h-11" disabled={!canContinue} onClick={() => setStep(step + 1)}>
              {t("common.next")}
            </Button>
          ) : (
            <Button
              className="min-h-11"
              disabled={create.isPending}
              onClick={() => create.mutate()}
            >
              {create.isPending ? t("common.saving") : t("op.createDraft")}
            </Button>
          )}
        </div>
      </div>
    </section>
  );
}

function OperationCard({ op, index }: { op: OperationRow; index: number }) {
  const { t, locale, timeZone } = useI18n();
  const window = effectiveWindow(op);
  return (
    <Link
      to="/operations/$operationId"
      params={{ operationId: op.id }}
      className="surface-panel animate-rise flex min-w-0 flex-col gap-2 p-4 transition-colors hover:border-border-strong"
      style={{ animationDelay: `${Math.min(index, 8) * 40}ms` }}
    >
      <div className="flex min-w-0 items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="truncate text-base font-semibold">{op.name}</p>
          <p className="truncate font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
            {op.code} · {op.source_experience_name ?? t("op.lineageNone")}
          </p>
        </div>
        <StatusPill status={op.status} />
      </div>
      <p className="text-sm text-muted-foreground">
        {formatDateTime(window.start, { locale, timeZone: op.timezone || timeZone })} —{" "}
        {formatDateTime(window.end, { locale, timeZone: op.timezone || timeZone })}
      </p>
      <p className="truncate text-xs text-muted-foreground">
        {[op.primary_city, op.primary_region, op.primary_country].filter(Boolean).join(" · ")}
        {window.isForecast ? ` · ${t("op.expected")}` : ""}
        {op.archived_at ? ` · ${t("op.archived")}` : ""}
      </p>
    </Link>
  );
}

function OperationsWorkspace() {
  const { t } = useI18n();
  const { tenant, canManage } = useTenant();
  const [creating, setCreating] = React.useState(false);
  const [filter, setFilter] = React.useState<"upcoming" | "all">("upcoming");

  const operations = useQuery({
    queryKey: ["operations", tenant?.id],
    enabled: Boolean(tenant?.id),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("operations")
        .select("*")
        .eq("tenant_id", tenant!.id)
        .order("planned_start", { ascending: true });
      if (error) throw error;
      return data;
    },
  });

  const items = (operations.data ?? []).filter((op) => {
    if (filter === "all") return true;
    if (op.archived_at) return false;
    return !["completed", "cancelled"].includes(op.status);
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-2xl font-semibold lg:text-3xl">{t("op.title")}</h2>
          <p className="mt-2 max-w-2xl text-sm text-muted-foreground">{t("op.subtitle")}</p>
        </div>
        {canManage && !creating ? (
          <Button className="min-h-11" onClick={() => setCreating(true)}>
            <Plus className="mr-2 size-4" aria-hidden="true" />
            {t("op.create")}
          </Button>
        ) : null}
      </div>

      {creating ? <CreateOperationWizard onDone={() => setCreating(false)} /> : null}

      <div className="flex gap-2" role="group" aria-label={t("op.title")}>
        {(["upcoming", "all"] as const).map((value) => (
          <Button
            key={value}
            size="sm"
            variant={filter === value ? "default" : "outline"}
            className="min-h-9"
            aria-pressed={filter === value}
            onClick={() => setFilter(value)}
          >
            {value === "upcoming" ? t("op.upcoming") : t("op.filterAll")}
          </Button>
        ))}
      </div>

      {operations.isLoading ? <PanelSkeleton rows={3} /> : null}

      {!operations.isLoading && items.length === 0 && !creating ? (
        <EmptyState
          icon={Activity}
          title={t("op.empty")}
          body={t("op.emptyBody")}
          action={
            canManage ? (
              <Button className="min-h-11" onClick={() => setCreating(true)}>
                {t("op.create")}
              </Button>
            ) : undefined
          }
        />
      ) : null}

      {items.length > 0 ? (
        <div className="grid grid-cols-[minmax(0,1fr)] gap-3 md:grid-cols-2 xl:grid-cols-3">
          {items.map((op, index) => (
            <OperationCard key={op.id} op={op} index={index} />
          ))}
        </div>
      ) : null}
    </div>
  );
}

function OperationsPage() {
  const { t } = useI18n();
  return (
    <AppShell activeId="operations" title={t("op.title")}>
      <div className="mx-auto w-full max-w-6xl">
        <RequireTenant>
          <OperationsWorkspace />
        </RequireTenant>
      </div>
    </AppShell>
  );
}
