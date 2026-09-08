import * as React from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft, Bot, CheckCircle2 } from "lucide-react";

import { AppShell } from "@/app/shell/app-shell";
import { RequireTenant } from "@/app/shell/require-tenant";
import { Button } from "@/components/ui/button";
import { feedback } from "@/components/feedback/feedback";
import { supabase } from "@/integrations/supabase/client";
import { useTenant } from "@/lib/tenant";
import type { Database } from "@/integrations/supabase/types";

type StepKind = Database["public"]["Enums"]["journey_step_kind"];
type ExperienceKind = Database["public"]["Enums"]["experience_kind"];

type ExperienceDraft = {
  name: string;
  slug: string;
  experience_kind: ExperienceKind;
  idempotency_key: string;
  short_description?: string;
  description?: string;
  country_code?: string;
  region?: string;
  city?: string;
  default_locale?: string;
  default_timezone?: string;
};

type OfferingDraft = {
  name: string;
  slug: string;
  idempotency_key: string;
  capacity?: number;
  currency_code?: string;
};

type JourneyStepDraft = {
  title: string;
  step_kind: StepKind;
  idempotency_key: string;
  description?: string;
  planned_start?: string;
  planned_end?: string;
  location_label?: string;
  traveler_label?: string;
  traveler_facing?: boolean;
};

type ProductDraft = {
  tenant_id: string;
  experience: ExperienceDraft;
  offering: OfferingDraft;
  operation: {
    name: string;
    code: string;
    operation_kind: ExperienceKind;
    primary_country: string;
    primary_region?: string;
    primary_city?: string;
    timezone: string;
    planned_start: string;
    planned_end: string;
    idempotency_key: string;
  };
  journey_steps?: JourneyStepDraft[];
};

export const Route = createFileRoute("/_authenticated/chat-assisted-product")({
  head: () => ({
    meta: [
      { title: "Cadastro assistido de produto — COBS OS" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: ChatAssistedProductPage,
});

function decodeBase64Url(value: string) {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
  const binary = atob(padded);
  return new TextDecoder().decode(Uint8Array.from(binary, (char) => char.charCodeAt(0)));
}

function parseDraft(): ProductDraft | null {
  if (typeof window === "undefined") return null;
  const encoded = new URLSearchParams(window.location.search).get("draft");
  if (!encoded) return null;
  try {
    const parsed = JSON.parse(decodeBase64Url(encoded)) as ProductDraft;
    if (!parsed?.tenant_id || !parsed.experience?.name || !parsed.experience?.slug || !parsed.offering?.name || !parsed.offering?.slug || !parsed.operation?.name || !parsed.operation?.code || !parsed.operation?.planned_start || !parsed.operation?.planned_end) return null;
    if ((parsed.journey_steps?.length ?? 0) > 30) return null;
    return parsed;
  } catch {
    return null;
  }
}

function resultId(value: unknown, key: string) {
  if (!value || typeof value !== "object") return null;
  const candidate = (value as Record<string, unknown>)[key];
  return typeof candidate === "string" ? candidate : null;
}

function ReviewProductDraft() {
  const { tenant, canManage } = useTenant();
  const [draft] = React.useState<ProductDraft | null>(() => parseDraft());
  const [pending, setPending] = React.useState(false);
  const [operationId, setOperationId] = React.useState<string | null>(null);
  const tenantMatches = Boolean(draft && tenant?.id === draft.tenant_id);
  const canCreate = Boolean(draft && tenantMatches && canManage && !pending && !operationId);

  async function approve() {
    if (!draft || !canCreate) return;
    setPending(true);
    try {
      const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
      if (sessionError || !sessionData.session?.access_token) throw new Error("Sessão autenticada não disponível.");

      const experienceArgs = {
        _tenant_id: draft.tenant_id,
        _name: draft.experience.name,
        _slug: draft.experience.slug,
        _experience_kind: draft.experience.experience_kind,
        _idempotency_key: draft.experience.idempotency_key,
        ...(draft.experience.short_description ? { _short_description: draft.experience.short_description } : {}),
        ...(draft.experience.description ? { _description: draft.experience.description } : {}),
        ...(draft.experience.country_code ? { _country_code: draft.experience.country_code } : {}),
        ...(draft.experience.region ? { _region: draft.experience.region } : {}),
        ...(draft.experience.city ? { _city: draft.experience.city } : {}),
        ...(draft.experience.default_locale ? { _default_locale: draft.experience.default_locale } : {}),
        ...(draft.experience.default_timezone ? { _default_timezone: draft.experience.default_timezone } : {}),
      };
      const { data: experienceData, error: experienceError } = await supabase.rpc("create_experience", experienceArgs);
      if (experienceError) throw experienceError;
      const experienceId = resultId(experienceData, "experience_id");
      if (!experienceId) throw new Error("Experience criada sem identificador de retorno.");

      const { data: offeringData, error: offeringError } = await supabase.rpc("create_offering", {
        _tenant_id: draft.tenant_id,
        _experience_id: experienceId,
        _name: draft.offering.name,
        _slug: draft.offering.slug,
        _idempotency_key: draft.offering.idempotency_key,
        ...(draft.offering.capacity ? { _capacity: draft.offering.capacity } : {}),
        ...(draft.offering.currency_code ? { _currency_code: draft.offering.currency_code } : {}),
      });
      if (offeringError) throw offeringError;
      const offeringId = resultId(offeringData, "offering_id");
      if (!offeringId) throw new Error("Offering criada sem identificador de retorno.");

      const { data: operationData, error: operationError } = await supabase.rpc("create_operation", {
        _tenant_id: draft.tenant_id,
        _name: draft.operation.name,
        _code: draft.operation.code,
        _operation_kind: draft.operation.operation_kind,
        _primary_country: draft.operation.primary_country,
        _timezone: draft.operation.timezone,
        _planned_start: draft.operation.planned_start,
        _planned_end: draft.operation.planned_end,
        _idempotency_key: draft.operation.idempotency_key,
        _experience_id: experienceId,
        _offering_id: offeringId,
        ...(draft.operation.primary_region ? { _primary_region: draft.operation.primary_region } : {}),
        ...(draft.operation.primary_city ? { _primary_city: draft.operation.primary_city } : {}),
      });
      if (operationError) throw operationError;
      const createdOperationId = resultId(operationData, "operation_id");
      if (!createdOperationId) throw new Error("Operação criada sem identificador de retorno.");

      for (const step of draft.journey_steps ?? []) {
        const { error } = await supabase.rpc("create_journey_step", {
          _operation_id: createdOperationId,
          _title: step.title,
          _step_kind: step.step_kind,
          _idempotency_key: step.idempotency_key,
          _traveler_facing: step.traveler_facing ?? true,
          ...(step.description ? { _description: step.description } : {}),
          ...(step.planned_start ? { _planned_start: step.planned_start } : {}),
          ...(step.planned_end ? { _planned_end: step.planned_end } : {}),
          ...(step.location_label ? { _location_label: step.location_label } : {}),
          ...(step.traveler_label ? { _traveler_label: step.traveler_label } : {}),
        });
        if (error) throw new Error(`Produto criado, mas o Journey parou em “${step.title}”: ${error.message}`);
      }

      setOperationId(createdOperationId);
      feedback.success("Experience, Offering, Operation e Journey criados no COBS.");
    } catch (error) {
      feedback.error(error instanceof Error ? error.message : "Não foi possível criar o produto.");
    } finally {
      setPending(false);
    }
  }

  if (!draft) return <section className="surface-panel p-5"><h2 className="text-xl font-semibold">Draft inválido ou ausente</h2></section>;

  return <div className="space-y-5">
    <header className="surface-panel p-5">
      <div className="flex items-center gap-2"><Bot className="size-5"/><h2 className="text-2xl font-semibold">Revisar produto assistido</h2></div>
      <p className="mt-2 text-sm text-muted-foreground">Nada será gravado até sua aprovação com a sessão autenticada do COBS.</p>
    </header>
    <section className="surface-panel space-y-4 p-5">
      <dl className="grid gap-3 sm:grid-cols-2">
        {[["Experience", draft.experience.name], ["Offering", draft.offering.name], ["Operação", draft.operation.name], ["Código", draft.operation.code], ["Capacidade", String(draft.offering.capacity ?? "—")], ["Período", `${new Date(draft.operation.planned_start).toLocaleDateString("pt-BR")} → ${new Date(draft.operation.planned_end).toLocaleDateString("pt-BR")}`], ["Local", [draft.operation.primary_city, draft.operation.primary_region, draft.operation.primary_country].filter(Boolean).join(" · ")], ["Journey", `${draft.journey_steps?.length ?? 0} etapas`]].map(([label, value]) => <div key={label} className="rounded-lg border border-border bg-elevated/50 px-3 py-2"><dt className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">{label}</dt><dd className="mt-1 text-sm">{value}</dd></div>)}
      </dl>
      {!tenantMatches ? <p className="rounded-lg border border-destructive/40 p-3 text-sm text-destructive">Este produto pertence a outro tenant.</p> : null}
      {operationId ? <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border p-4"><span className="flex items-center gap-2 text-sm font-medium"><CheckCircle2 className="size-5"/>Produto criado com sucesso.</span><Button asChild><Link to="/operations/$operationId" params={{ operationId }}>Abrir operação</Link></Button></div> : <div className="flex justify-end"><Button disabled={!canCreate} onClick={() => void approve()}>{pending ? "Criando…" : "Aprovar e cadastrar produto"}</Button></div>}
    </section>
  </div>;
}

function ChatAssistedProductPage() {
  return <AppShell activeId="operations" title="Cadastro assistido de produto"><div className="mx-auto w-full max-w-5xl space-y-4"><Button asChild variant="ghost" size="sm"><Link to="/operations"><ArrowLeft className="mr-2 size-4"/>Voltar</Link></Button><RequireTenant><ReviewProductDraft/></RequireTenant></div></AppShell>;
}
