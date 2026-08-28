import * as React from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { Bot, RefreshCw, Send } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { feedback } from "@/components/feedback/feedback";

type OperationOption = { id: string; name: string };

type DispatchResponse = {
  ok?: boolean;
  duplicate?: boolean;
  event_id?: string;
  correlation_id?: string;
  event?: { id?: string } | null;
  error?: string;
};

type CommercialLeadResult = {
  outcome: "completed" | "failed";
  intent: "price" | "installment" | "group" | "ready_to_buy" | "human_support" | "other" | null;
  urgency: "low" | "medium" | "high" | null;
  summary: string | null;
  suggested_reply: string | null;
  error_code: string | null;
  error_message: string | null;
  created_at: string;
};

const automationDb = supabase as unknown as SupabaseClient;

function automationError(value: unknown): string {
  if (value instanceof Error) return value.message;
  if (typeof value === "object" && value !== null && "message" in value) {
    return String((value as { message?: unknown }).message ?? "Erro ao analisar lead.");
  }
  return "Erro ao analisar lead.";
}

function intentLabel(intent: CommercialLeadResult["intent"]): string {
  switch (intent) {
    case "price":
      return "Preço";
    case "installment":
      return "Parcelamento";
    case "group":
      return "Grupo";
    case "ready_to_buy":
      return "Pronto para comprar";
    case "human_support":
      return "Atendimento humano";
    case "other":
      return "Outro";
    default:
      return "—";
  }
}

function urgencyLabel(urgency: CommercialLeadResult["urgency"]): string {
  switch (urgency) {
    case "low":
      return "Baixa";
    case "medium":
      return "Média";
    case "high":
      return "Alta";
    default:
      return "—";
  }
}

async function loadResult(eventId: string): Promise<CommercialLeadResult | null> {
  const { data, error } = await automationDb
    .from("automation_results")
    .select(
      "outcome,intent,urgency,summary,suggested_reply,error_code,error_message,created_at",
    )
    .eq("automation_event_id", eventId)
    .maybeSingle();

  if (error) throw error;
  return (data ?? null) as CommercialLeadResult | null;
}

async function waitForResult(eventId: string): Promise<CommercialLeadResult | null> {
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const result = await loadResult(eventId);
    if (result) return result;
    await new Promise((resolve) => window.setTimeout(resolve, 500));
  }
  return null;
}

export function CommercialLeadCard({ tenantId }: { tenantId: string }) {
  const [name, setName] = React.useState("");
  const [message, setMessage] = React.useState("");
  const [operationId, setOperationId] = React.useState("");
  const [operations, setOperations] = React.useState<OperationOption[]>([]);
  const [submitting, setSubmitting] = React.useState(false);
  const [refreshing, setRefreshing] = React.useState(false);
  const [eventId, setEventId] = React.useState<string | null>(null);
  const [correlationId, setCorrelationId] = React.useState<string | null>(null);
  const [result, setResult] = React.useState<CommercialLeadResult | null>(null);

  React.useEffect(() => {
    let cancelled = false;
    void supabase
      .from("operations")
      .select("id, name")
      .eq("tenant_id", tenantId)
      .order("name")
      .then(({ data, error }) => {
        if (cancelled) return;
        if (error) {
          feedback.error("Não foi possível carregar as operações.");
          return;
        }
        setOperations((data ?? []) as OperationOption[]);
      });

    return () => {
      cancelled = true;
    };
  }, [tenantId]);

  async function refreshResult() {
    if (!eventId) return;
    setRefreshing(true);
    try {
      const next = await loadResult(eventId);
      setResult(next);
      if (next) feedback.success("Análise comercial atualizada.");
      else feedback.info("A análise ainda está em processamento.");
    } catch (error) {
      feedback.error(automationError(error));
    } finally {
      setRefreshing(false);
    }
  }

  async function submitLead(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const cleanName = name.trim();
    const cleanMessage = message.trim();
    if (!cleanName || !cleanMessage) return;

    setSubmitting(true);
    setEventId(null);
    setCorrelationId(null);
    setResult(null);

    try {
      const idempotencyKey = `lead-ui:${tenantId}:${crypto.randomUUID()}`;
      const { data, error } = await supabase.functions.invoke<DispatchResponse>("automation-gateway", {
        body: {
          tenant_id: tenantId,
          operation_id: operationId || null,
          event_type: "lead.created",
          idempotency_key: idempotencyKey,
          payload: {
            name: cleanName,
            message: cleanMessage,
            channel: "cobs_commerce_ui",
            is_test: true,
          },
        },
      });

      if (error) throw error;
      if (!data?.ok) throw new Error(data?.error ?? "automation_dispatch_failed");

      const dispatchedEventId = data.event_id ?? data.event?.id ?? null;
      if (!dispatchedEventId) throw new Error("automation_event_missing");

      setEventId(dispatchedEventId);
      setCorrelationId(data.correlation_id ?? null);
      feedback.success(data.duplicate ? "Lead já havia sido enviado." : "Lead enviado para análise.");

      const analyzed = await waitForResult(dispatchedEventId);
      setResult(analyzed);
      if (!analyzed) {
        feedback.info("Lead aceito. A análise ainda está em processamento.");
      }
    } catch (error) {
      feedback.error("Falha ao enviar lead para análise.", automationError(error));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-start gap-3">
          <div className="rounded-lg bg-primary/10 p-2 text-primary">
            <Bot className="size-5" aria-hidden />
          </div>
          <div className="space-y-1">
            <CardTitle>Lead comercial com IA</CardTitle>
            <CardDescription>
              Envie um interesse comercial para classificação pelo n8n. O COBS continua sendo a fonte de verdade.
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-5">
        <form className="grid gap-4 sm:grid-cols-2" onSubmit={submitLead}>
          <div className="space-y-1.5">
            <Label htmlFor="commercial-lead-name">Nome</Label>
            <Input
              id="commercial-lead-name"
              maxLength={160}
              required
              placeholder="Ex.: Ana Silva"
              value={name}
              onChange={(event) => setName(event.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="commercial-lead-operation">Operação relacionada</Label>
            <select
              id="commercial-lead-operation"
              className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
              value={operationId}
              onChange={(event) => setOperationId(event.target.value)}
            >
              <option value="">Sem operação específica</option>
              {operations.map((operation) => (
                <option key={operation.id} value={operation.id}>
                  {operation.name}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="commercial-lead-message">Mensagem / interesse</Label>
            <Textarea
              id="commercial-lead-message"
              maxLength={4000}
              required
              rows={4}
              placeholder="Ex.: Quero saber o preço e se consigo parcelar o CIOSP 2027."
              value={message}
              onChange={(event) => setMessage(event.target.value)}
            />
          </div>
          <div className="sm:col-span-2">
            <Button type="submit" className="min-h-11" disabled={submitting || !name.trim() || !message.trim()}>
              <Send className="size-4" aria-hidden />
              {submitting ? "Analisando…" : "Enviar para análise"}
            </Button>
          </div>
        </form>

        {eventId && (
          <div className="rounded-lg border border-border bg-elevated/40 p-4 text-sm">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="font-medium">Evento de automação</p>
                <p className="break-all text-xs text-muted-foreground">{eventId}</p>
                {correlationId && (
                  <p className="mt-1 break-all text-xs text-muted-foreground">
                    Correlação: {correlationId}
                  </p>
                )}
              </div>
              <Button type="button" variant="outline" size="sm" onClick={refreshResult} disabled={refreshing}>
                <RefreshCw className={refreshing ? "animate-spin" : ""} aria-hidden />
                Atualizar resultado
              </Button>
            </div>
          </div>
        )}

        {result && result.outcome === "completed" && (
          <div className="space-y-4 rounded-lg border border-border p-4">
            <div className="flex flex-wrap gap-2">
              <span className="rounded-full bg-primary/10 px-2.5 py-1 text-xs font-medium text-primary">
                Intenção: {intentLabel(result.intent)}
              </span>
              <span className="rounded-full bg-secondary px-2.5 py-1 text-xs font-medium text-secondary-foreground">
                Urgência: {urgencyLabel(result.urgency)}
              </span>
            </div>
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Resumo</p>
              <p className="mt-1 text-sm">{result.summary || "—"}</p>
            </div>
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Resposta sugerida</p>
              <p className="mt-1 whitespace-pre-wrap text-sm">{result.suggested_reply || "—"}</p>
            </div>
          </div>
        )}

        {result && result.outcome === "failed" && (
          <div className="rounded-lg border border-destructive/50 p-4 text-sm text-destructive">
            <p className="font-medium">A automação retornou falha.</p>
            <p className="mt-1">{result.error_message || result.error_code || "Falha sem detalhe."}</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
