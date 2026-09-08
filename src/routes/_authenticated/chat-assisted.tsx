import * as React from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft, Bot, CheckCircle2, MapPin } from "lucide-react";

import { AppShell } from "@/app/shell/app-shell";
import { RequireTenant } from "@/app/shell/require-tenant";
import { Button } from "@/components/ui/button";
import { feedback } from "@/components/feedback/feedback";
import { supabase } from "@/integrations/supabase/client";
import { useTenant } from "@/lib/tenant";
import type { Database } from "@/integrations/supabase/types";

type StepKind = Database["public"]["Enums"]["journey_step_kind"];

export const Route = createFileRoute("/_authenticated/chat-assisted")({
  head: () => ({
    meta: [
      { title: "Cadastro assistido por chat — COBS OS" },
      { name: "description", content: "Revise e aprove rascunhos de operação estruturados pelo assistente." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: ChatAssistedPage,
});

type JourneyStepDraft = {
  title: string;
  step_kind: StepKind;
  description?: string;
  planned_start?: string;
  planned_end?: string;
  location_label?: string;
  traveler_label?: string;
  traveler_facing?: boolean;
  idempotency_key: string;
};

type OperationDraft = {
  tenant_id: string;
  experience_id: string;
  offering_id?: string | null;
  name: string;
  code: string;
  operation_kind: "tourism" | "event" | "hybrid";
  primary_country: string;
  primary_region?: string | null;
  primary_city?: string | null;
  timezone: string;
  planned_start: string;
  planned_end: string;
  idempotency_key: string;
  journey_steps?: JourneyStepDraft[];
};

const STEP_KINDS: StepKind[] = ["meeting", "boarding", "movement", "arrival", "disembarkation", "activity", "meal", "hotel", "event", "break", "free_time", "return", "other"];

function decodeBase64Url(value: string) {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
  const binary = atob(padded);
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

function validStep(value: unknown): value is JourneyStepDraft {
  if (!value || typeof value !== "object") return false;
  const step = value as Partial<JourneyStepDraft>;
  return typeof step.title === "string" && step.title.trim().length > 0 && STEP_KINDS.includes(step.step_kind as StepKind) && typeof step.idempotency_key === "string" && step.idempotency_key.length >= 8;
}

function parseDraft(): OperationDraft | null {
  if (typeof window === "undefined") return null;
  const encoded = new URLSearchParams(window.location.search).get("draft");
  if (!encoded) return null;
  try {
    const parsed = JSON.parse(decodeBase64Url(encoded)) as Partial<OperationDraft>;
    if (typeof parsed.tenant_id !== "string" || typeof parsed.experience_id !== "string" || typeof parsed.name !== "string" || typeof parsed.code !== "string" || !["tourism", "event", "hybrid"].includes(parsed.operation_kind ?? "") || typeof parsed.primary_country !== "string" || typeof parsed.timezone !== "string" || typeof parsed.planned_start !== "string" || typeof parsed.planned_end !== "string" || typeof parsed.idempotency_key !== "string" || (parsed.journey_steps != null && (!Array.isArray(parsed.journey_steps) || parsed.journey_steps.length > 30 || !parsed.journey_steps.every(validStep)))) return null;
    return parsed as OperationDraft;
  } catch { return null; }
}

function ReviewDraft() {
  const { tenant, canManage } = useTenant();
  const [draft] = React.useState<OperationDraft | null>(() => parseDraft());
  const [pending, setPending] = React.useState(false);
  const [createdId, setCreatedId] = React.useState<string | null>(null);
  const [createdSteps, setCreatedSteps] = React.useState(0);
  const tenantMatches = Boolean(draft && tenant?.id === draft.tenant_id);
  const canCreate = Boolean(draft && tenantMatches && canManage && !pending && !createdId);

  async function approve() {
    if (!draft || !canCreate) return;
    setPending(true);
    try {
      const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
      const accessToken = sessionData.session?.access_token;
      if (sessionError || !accessToken) throw new Error("Sessão autenticada não disponível.");
      const { data, error } = await supabase.functions.invoke("chat-assisted-operation-draft", { headers: { Authorization: `Bearer ${accessToken}` }, body: draft });
      if (error) throw error;
      if (!data?.operation_id) throw new Error("A operação foi criada sem identificador de retorno.");
      const operationId = String(data.operation_id);
      let count = 0;
      for (const step of draft.journey_steps ?? []) {
        const { error: stepError } = await supabase.rpc("create_journey_step", {
          _operation_id: operationId,
          _title: step.title.trim(),
          _step_kind: step.step_kind,
          _idempotency_key: step.idempotency_key,
          _traveler_facing: step.traveler_facing ?? true,
          ...(step.description?.trim() ? { _description: step.description.trim() } : {}),
          ...(step.planned_start ? { _planned_start: step.planned_start } : {}),
          ...(step.planned_end ? { _planned_end: step.planned_end } : {}),
          ...(step.location_label?.trim() ? { _location_label: step.location_label.trim() } : {}),
          ...(step.traveler_label?.trim() ? { _traveler_label: step.traveler_label.trim() } : {}),
        });
        if (stepError) throw new Error(`Operação criada, mas o roteiro parou em “${step.title}”: ${stepError.message}`);
        count += 1;
      }
      setCreatedSteps(count);
      setCreatedId(operationId);
      feedback.success(count ? `Rascunho e ${count} etapas do roteiro criados no COBS.` : "Rascunho criado no COBS.");
    } catch (error) { feedback.error(error instanceof Error ? error.message : "Não foi possível criar o rascunho."); }
    finally { setPending(false); }
  }

  if (!draft) return <section className="surface-panel space-y-3 p-5"><h2 className="text-xl font-semibold">Draft inválido ou ausente</h2><p className="text-sm text-muted-foreground">Abra esta página por um link de revisão gerado pelo assistente do COBS.</p></section>;

  return <div className="space-y-5">
    <header className="surface-panel p-5"><div className="flex items-center gap-2"><Bot className="size-5" aria-hidden="true" /><h2 className="text-2xl font-semibold">Revisar cadastro assistido</h2></div><p className="mt-2 max-w-2xl text-sm text-muted-foreground">O assistente estruturou este rascunho. Nada será gravado até sua aprovação com a sessão autenticada do COBS.</p></header>
    <section className="surface-panel space-y-4 p-5">
      <dl className="grid gap-3 sm:grid-cols-2">{[["Nome",draft.name],["Código",draft.code],["Tipo",draft.operation_kind],["Local",[draft.primary_city,draft.primary_region,draft.primary_country].filter(Boolean).join(" · ")],["Início",new Date(draft.planned_start).toLocaleString("pt-BR")],["Fim",new Date(draft.planned_end).toLocaleString("pt-BR")],["Fuso",draft.timezone],["Experience",draft.experience_id]].map(([label,value])=><div key={label} className="rounded-lg border border-border bg-elevated/50 px-3 py-2"><dt className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">{label}</dt><dd className="mt-1 break-words text-sm">{value}</dd></div>)}</dl>
      {draft.journey_steps?.length ? <div className="space-y-2"><div className="flex items-center gap-2"><MapPin className="size-4"/><h3 className="font-semibold">Roteiro proposto · {draft.journey_steps.length} etapas</h3></div>{draft.journey_steps.map((step,index)=><div key={step.idempotency_key} className="rounded-lg border border-border bg-elevated/50 px-3 py-2 text-sm"><span className="font-mono text-xs text-muted-foreground">{String(index+1).padStart(2,"0")}</span> · <span className="font-medium">{step.title}</span>{step.location_label ? <span className="text-muted-foreground"> · {step.location_label}</span> : null}{step.planned_start ? <span className="text-muted-foreground"> · {new Date(step.planned_start).toLocaleTimeString("pt-BR",{hour:"2-digit",minute:"2-digit"})}</span> : null}</div>)}</div> : null}
      {!tenantMatches ? <p className="rounded-lg border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive">Este draft pertence a outro tenant e não pode ser aprovado nesta organização.</p> : null}
      {!canManage ? <p className="rounded-lg border border-border bg-elevated/50 p-3 text-sm text-muted-foreground">Sua função atual não permite criar operações.</p> : null}
      {createdId ? <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-elevated/50 p-4"><div className="flex items-center gap-2"><CheckCircle2 className="size-5"/><span className="text-sm font-medium">Rascunho criado com sucesso{createdSteps ? ` com ${createdSteps} etapas de roteiro` : ""}.</span></div><Button asChild><Link to="/operations/$operationId" params={{operationId:createdId}}>Abrir operação</Link></Button></div> : <div className="flex justify-end"><Button disabled={!canCreate} onClick={()=>void approve()}>{pending ? "Criando…" : draft.journey_steps?.length ? "Aprovar operação e roteiro" : "Aprovar e criar rascunho"}</Button></div>}
    </section>
  </div>;
}

function ChatAssistedPage(){return <AppShell activeId="operations" title="Cadastro assistido"><div className="mx-auto w-full max-w-5xl space-y-4"><Button asChild variant="ghost" size="sm" className="-ml-2 min-h-9"><Link to="/operations"><ArrowLeft className="mr-2 size-4"/>Voltar para operações</Link></Button><RequireTenant><ReviewDraft/></RequireTenant></div></AppShell>}
