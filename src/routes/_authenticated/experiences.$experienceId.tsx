import * as React from "react";
import { createFileRoute, Link, useParams } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Layers, Plus } from "lucide-react";

import { AppShell } from "@/app/shell/app-shell";
import { RequireTenant } from "@/app/shell/require-tenant";
import { supabase } from "@/integrations/supabase/client";
import { humanizeError } from "@/lib/auth";
import { useI18n } from "@/lib/i18n";
import { formatDateTime } from "@/lib/format";
import { useTenant } from "@/lib/tenant";
import { newIdempotencyKey, slugify, type OfferingRow } from "@/lib/w02";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { EmptyState } from "@/components/feedback/empty-state";
import { PanelSkeleton } from "@/components/feedback/loading";
import { StatusPill } from "@/components/feedback/status-pill";
import { feedback } from "@/components/feedback/feedback";

export const Route = createFileRoute("/_authenticated/experiences/$experienceId")({
  head: () => ({
    meta: [
      { title: "Experience detail — COBS OS catalog" },
      {
        name: "description",
        content:
          "Experience definition, commercial formats and linked operations inside your COBS OS organization.",
      },
      { property: "og:title", content: "Experience detail — COBS OS catalog" },
      {
        property: "og:description",
        content: "Definition, formats and linked operations.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: ExperienceDetailPage,
});

function OfferingForm({
  experienceId,
  onDone,
}: {
  experienceId: string;
  onDone: () => void;
}) {
  const { t, locale } = useI18n();
  const { tenant } = useTenant();
  const queryClient = useQueryClient();
  const idempotencyKey = React.useRef(newIdempotencyKey());
  const [form, setForm] = React.useState({
    name: "",
    slug: "",
    capacity: "",
    currency: tenant?.currency_code ?? "",
    availableFrom: "",
    availableUntil: "",
  });

  const create = useMutation({
    mutationFn: async () => {
      const optional: Record<string, string | number> = {};
      if (form.capacity.trim()) optional["_capacity"] = Number(form.capacity);
      if (form.currency.trim()) optional["_currency_code"] = form.currency.trim().toUpperCase();
      if (form.availableFrom) optional["_available_from"] = new Date(form.availableFrom).toISOString();
      if (form.availableUntil)
        optional["_available_until"] = new Date(form.availableUntil).toISOString();
      const { error } = await supabase.rpc("create_offering", {
        _tenant_id: tenant!.id,
        _experience_id: experienceId,
        _name: form.name.trim(),
        _slug: form.slug.trim() || slugify(form.name),
        _idempotency_key: idempotencyKey.current,
        ...optional,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      feedback.success(t("off.created"));
      void queryClient.invalidateQueries({ queryKey: ["offerings", experienceId] });
      onDone();
    },
    onError: (error) => feedback.error(humanizeError(error, locale)),
  });

  return (
    <form
      className="surface-panel animate-rise grid gap-4 p-4 sm:grid-cols-2"
      onSubmit={(e) => {
        e.preventDefault();
        create.mutate();
      }}
    >
      <div className="space-y-1.5">
        <Label htmlFor="off-name">{t("off.name")}</Label>
        <Input
          id="off-name"
          required
          value={form.name}
          onChange={(e) =>
            setForm((f) => ({ ...f, name: e.target.value, slug: slugify(e.target.value) }))
          }
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="off-slug">{t("off.slug")}</Label>
        <Input
          id="off-slug"
          value={form.slug}
          onChange={(e) => setForm((f) => ({ ...f, slug: slugify(e.target.value) }))}
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="off-capacity">{t("off.capacity")}</Label>
        <Input
          id="off-capacity"
          type="number"
          min={1}
          value={form.capacity}
          onChange={(e) => setForm((f) => ({ ...f, capacity: e.target.value }))}
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="off-currency">{t("off.currency")}</Label>
        <Input
          id="off-currency"
          maxLength={3}
          value={form.currency}
          onChange={(e) => setForm((f) => ({ ...f, currency: e.target.value.toUpperCase() }))}
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="off-from">{t("off.availableFrom")}</Label>
        <Input
          id="off-from"
          type="datetime-local"
          value={form.availableFrom}
          onChange={(e) => setForm((f) => ({ ...f, availableFrom: e.target.value }))}
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="off-until">{t("off.availableUntil")}</Label>
        <Input
          id="off-until"
          type="datetime-local"
          value={form.availableUntil}
          onChange={(e) => setForm((f) => ({ ...f, availableUntil: e.target.value }))}
        />
      </div>
      <p className="text-xs text-muted-foreground sm:col-span-2">{t("off.noPricing")}</p>
      <div className="flex justify-end gap-2 sm:col-span-2">
        <Button type="button" variant="ghost" className="min-h-11" onClick={onDone}>
          {t("common.cancel")}
        </Button>
        <Button type="submit" className="min-h-11" disabled={create.isPending}>
          {create.isPending ? t("common.saving") : t("off.create")}
        </Button>
      </div>
    </form>
  );
}

function OfferingRowItem({ offering }: { offering: OfferingRow }) {
  const { t, locale } = useI18n();
  const { canManage } = useTenant();
  const queryClient = useQueryClient();

  const setStatus = useMutation({
    mutationFn: async (status: OfferingRow["status"]) => {
      const { error } = await supabase.from("offerings").update({ status }).eq("id", offering.id);
      if (error) throw error;
    },
    onSuccess: () => {
      feedback.success(t("off.updated"));
      void queryClient.invalidateQueries({ queryKey: ["offerings", offering.experience_id] });
    },
    onError: (error) => feedback.error(humanizeError(error, locale)),
  });

  return (
    <li className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-elevated/50 px-3 py-2.5">
      <div className="min-w-0">
        <p className="truncate text-sm font-medium">{offering.name}</p>
        <p className="truncate font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
          {offering.slug}
          {offering.capacity ? ` · ${offering.capacity}` : ""}
          {offering.currency_code ? ` · ${offering.currency_code}` : ""}
        </p>
      </div>
      <div className="flex items-center gap-2">
        <StatusPill status={offering.status} />
        {canManage && offering.status !== "archived" ? (
          <>
            {offering.status !== "active" ? (
              <Button
                size="sm"
                variant="outline"
                className="min-h-9"
                onClick={() => setStatus.mutate("active")}
              >
                {t("off.activate")}
              </Button>
            ) : (
              <Button
                size="sm"
                variant="outline"
                className="min-h-9"
                onClick={() => setStatus.mutate("paused")}
              >
                {t("off.pause")}
              </Button>
            )}
            <Button
              size="sm"
              variant="ghost"
              className="min-h-9"
              onClick={() => setStatus.mutate("archived")}
            >
              {t("off.archive")}
            </Button>
          </>
        ) : null}
      </div>
    </li>
  );
}

function ExperienceDetail() {
  const { experienceId } = useParams({ from: "/_authenticated/experiences/$experienceId" });
  const { t, locale, timeZone } = useI18n();
  const { tenant, canManage } = useTenant();
  const queryClient = useQueryClient();
  const [creatingOffering, setCreatingOffering] = React.useState(false);

  const experience = useQuery({
    queryKey: ["experience", experienceId],
    enabled: Boolean(tenant?.id),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("experiences")
        .select("*")
        .eq("id", experienceId)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const offerings = useQuery({
    queryKey: ["offerings", experienceId],
    enabled: Boolean(tenant?.id),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("offerings")
        .select("*")
        .eq("experience_id", experienceId)
        .order("created_at");
      if (error) throw error;
      return data;
    },
  });

  const operations = useQuery({
    queryKey: ["experience-operations", experienceId],
    enabled: Boolean(tenant?.id),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("operations")
        .select("id, name, code, status, planned_start")
        .eq("experience_id", experienceId)
        .order("planned_start", { ascending: false })
        .limit(20);
      if (error) throw error;
      return data;
    },
  });

  const setStatus = useMutation({
    mutationFn: async (status: "draft" | "active" | "archived") => {
      const { error } = await supabase.from("experiences").update({ status }).eq("id", experienceId);
      if (error) throw error;
    },
    onSuccess: () => {
      feedback.success(t("exp.updated"));
      void queryClient.invalidateQueries({ queryKey: ["experience", experienceId] });
      void queryClient.invalidateQueries({ queryKey: ["experiences", tenant?.id] });
    },
    onError: (error) => feedback.error(humanizeError(error, locale)),
  });

  if (experience.isLoading) return <PanelSkeleton rows={4} />;
  if (!experience.data)
    return <EmptyState icon={Layers} title={t("exp.notFound")} body={t("exp.back")} />;

  const exp = experience.data;

  return (
    <div className="space-y-6">
      <div>
        <Button asChild variant="ghost" size="sm" className="-ml-2 min-h-9">
          <Link to="/experiences">
            <ArrowLeft className="mr-2 size-4" aria-hidden="true" />
            {t("exp.back")}
          </Link>
        </Button>
      </div>

      <header className="surface-panel animate-rise flex flex-wrap items-start justify-between gap-4 p-5">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-2xl font-semibold">{exp.name}</h2>
            <StatusPill status={exp.status} />
          </div>
          <p className="mt-1 font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
            {exp.slug} · {t(`kind.${exp.experience_kind}`)} · {exp.default_timezone}
          </p>
          {exp.short_description ? (
            <p className="mt-3 max-w-2xl text-sm text-muted-foreground">{exp.short_description}</p>
          ) : null}
          {exp.description ? (
            <p className="mt-2 max-w-2xl whitespace-pre-line text-sm text-muted-foreground">
              {exp.description}
            </p>
          ) : null}
        </div>
        {canManage ? (
          <div className="flex flex-wrap gap-2">
            {exp.status !== "active" ? (
              <Button className="min-h-11" onClick={() => setStatus.mutate("active")}>
                {exp.status === "archived" ? t("exp.restore") : t("exp.activate")}
              </Button>
            ) : (
              <Button
                variant="outline"
                className="min-h-11"
                onClick={() => setStatus.mutate("archived")}
              >
                {t("exp.archive")}
              </Button>
            )}
          </div>
        ) : null}
      </header>

      <section className="surface-panel space-y-4 p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="text-base font-semibold">{t("off.title")}</h3>
            <p className="text-sm text-muted-foreground">{t("off.subtitle")}</p>
          </div>
          {canManage && !creatingOffering ? (
            <Button variant="outline" className="min-h-11" onClick={() => setCreatingOffering(true)}>
              <Plus className="mr-2 size-4" aria-hidden="true" />
              {t("off.create")}
            </Button>
          ) : null}
        </div>

        {creatingOffering ? (
          <OfferingForm experienceId={experienceId} onDone={() => setCreatingOffering(false)} />
        ) : null}

        {offerings.isLoading ? <PanelSkeleton rows={2} /> : null}
        {!offerings.isLoading && (offerings.data?.length ?? 0) === 0 && !creatingOffering ? (
          <EmptyState icon={Layers} title={t("off.empty")} body={t("off.emptyBody")} />
        ) : null}
        {offerings.data && offerings.data.length > 0 ? (
          <ul className="space-y-2">
            {offerings.data.map((offering) => (
              <OfferingRowItem key={offering.id} offering={offering} />
            ))}
          </ul>
        ) : null}
      </section>

      <section className="surface-panel space-y-3 p-5">
        <h3 className="text-base font-semibold">{t("exp.operationsCount")}</h3>
        {operations.data && operations.data.length > 0 ? (
          <ul className="space-y-2">
            {operations.data.map((op) => (
              <li key={op.id}>
                <Link
                  to="/operations/$operationId"
                  params={{ operationId: op.id }}
                  className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-elevated/50 px-3 py-2.5 transition-colors hover:border-border-strong"
                >
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-medium">{op.name}</span>
                    <span className="block truncate font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
                      {op.code} · {formatDateTime(op.planned_start, { locale, timeZone })}
                    </span>
                  </span>
                  <StatusPill status={op.status} />
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground">{t("op.empty")}</p>
        )}
      </section>
    </div>
  );
}

function ExperienceDetailPage() {
  const { t } = useI18n();
  return (
    <AppShell activeId="experiences" title={t("exp.title")}>
      <div className="mx-auto w-full max-w-5xl">
        <RequireTenant>
          <ExperienceDetail />
        </RequireTenant>
      </div>
    </AppShell>
  );
}
