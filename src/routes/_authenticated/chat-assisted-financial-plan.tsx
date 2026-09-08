import * as React from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft, Bot, CheckCircle2, WalletCards } from "lucide-react";

import { AppShell } from "@/app/shell/app-shell";
import { RequireTenant } from "@/app/shell/require-tenant";
import { Button } from "@/components/ui/button";
import { feedback } from "@/components/feedback/feedback";
import { supabase } from "@/integrations/supabase/client";
import { useTenant } from "@/lib/tenant";

type FinancialPlanDraft = {
  tenant_id: string;
  operation_id: string;
  operation_name: string;
  expected_paying_passengers: number;
  target_unit_price_minor: number;
  contingency_minor: number;
  tax_fee_minor: number;
  minimum_margin_pct: number;
  stress_paying_passengers?: number;
  notes?: string;
};

type FinancialPlanInsert = {
  tenant_id: string;
  operation_id: string;
  expected_paying_passengers: number;
  target_unit_price_minor: number;
  contingency_minor: number;
  tax_fee_minor: number;
  notes: string;
};

type FinancialPlanRow = Pick<FinancialPlanInsert, "tenant_id" | "operation_id"> & { id: string };

type FinancialPlansQuery = {
  eq(column: "operation_id" | "tenant_id", value: string): FinancialPlansQuery;
  maybeSingle(): Promise<{ data: FinancialPlanRow | null; error: { message: string } | null }>;
};

type FinancialPlansTable = {
  select(columns: "id"): FinancialPlansQuery;
  insert(row: FinancialPlanInsert): Promise<{ error: { message: string } | null }>;
};

function financialPlansTable() {
  return supabase.from("operation_financial_plans" as never) as unknown as FinancialPlansTable;
}

export const Route = createFileRoute("/_authenticated/chat-assisted-financial-plan")({
  head: () => ({
    meta: [
      { title: "Planejamento financeiro assistido — COBS OS" },
      { name: "description", content: "Revise e aprove o plano financeiro-base de uma operação." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: ChatAssistedFinancialPlanPage,
});

function decodeBase64Url(value: string) {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
  const binary = atob(padded);
  return new TextDecoder().decode(Uint8Array.from(binary, (char) => char.charCodeAt(0)));
}

function isUuid(value: unknown): value is string {
  return typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function parseDraft(): FinancialPlanDraft | null {
  if (typeof window === "undefined") return null;
  const encoded = new URLSearchParams(window.location.search).get("draft");
  if (!encoded) return null;
  try {
    const parsed = JSON.parse(decodeBase64Url(encoded)) as Partial<FinancialPlanDraft>;
    if (!isUuid(parsed.tenant_id) || !isUuid(parsed.operation_id)) return null;
    if (typeof parsed.operation_name !== "string" || !parsed.operation_name.trim()) return null;
    if (!Number.isInteger(parsed.expected_paying_passengers) || (parsed.expected_paying_passengers ?? 0) < 1) return null;
    if (!Number.isInteger(parsed.target_unit_price_minor) || (parsed.target_unit_price_minor ?? -1) < 0) return null;
    if (!Number.isInteger(parsed.contingency_minor) || (parsed.contingency_minor ?? -1) < 0) return null;
    if (!Number.isInteger(parsed.tax_fee_minor) || (parsed.tax_fee_minor ?? -1) < 0) return null;
    if (typeof parsed.minimum_margin_pct !== "number" || parsed.minimum_margin_pct <= 0 || parsed.minimum_margin_pct >= 100) return null;
    return parsed as FinancialPlanDraft;
  } catch {
    return null;
  }
}

function brl(minor: number) {
  return (minor / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function ReviewFinancialPlanDraft() {
  const { tenant, canManage } = useTenant();
  const [draft] = React.useState<FinancialPlanDraft | null>(() => parseDraft());
  const [pending, setPending] = React.useState(false);
  const [created, setCreated] = React.useState(false);
  const tenantMatches = Boolean(draft && tenant?.id === draft.tenant_id);
  const canCreate = Boolean(draft && tenantMatches && canManage && !pending && !created);

  async function approve() {
    if (!draft || !canCreate) return;
    setPending(true);
    try {
      const { data: operation, error: operationError } = await supabase
        .from("operations")
        .select("id, tenant_id")
        .eq("id", draft.operation_id)
        .eq("tenant_id", draft.tenant_id)
        .maybeSingle();
      if (operationError) throw operationError;
      if (!operation) throw new Error("A operação não pertence ao tenant autenticado.");

      const { data: existing, error: existingError } = await financialPlansTable()
        .select("id")
        .eq("operation_id", draft.operation_id)
        .eq("tenant_id", draft.tenant_id)
        .maybeSingle();
      if (existingError) throw existingError;
      if (existing) throw new Error("Esta operação já possui um plano financeiro. Revise o plano existente em vez de sobrescrevê-lo.");

      const notes = [
        draft.notes?.trim(),
        `Margem mínima comercial BSBTUR: ${draft.minimum_margin_pct}%.`,
        draft.stress_paying_passengers ? `Stress test: ${draft.stress_paying_passengers} pagantes.` : null,
        draft.target_unit_price_minor === 0 ? "Preço-alvo pendente até fechamento dos custos reais." : null,
      ].filter(Boolean).join(" ");

      const { error } = await financialPlansTable().insert({
        tenant_id: draft.tenant_id,
        operation_id: draft.operation_id,
        expected_paying_passengers: draft.expected_paying_passengers,
        target_unit_price_minor: draft.target_unit_price_minor,
        contingency_minor: draft.contingency_minor,
        tax_fee_minor: draft.tax_fee_minor,
        notes,
      });
      if (error) throw error;

      setCreated(true);
      feedback.success("Plano financeiro-base criado no COBS sem preço comercial e sem abertura de vendas.");
    } catch (error) {
      feedback.error(error instanceof Error ? error.message : "Não foi possível criar o plano financeiro.");
    } finally {
      setPending(false);
    }
  }

  if (!draft) {
    return <section className="surface-panel p-5"><h2 className="text-xl font-semibold">Draft financeiro inválido ou ausente</h2></section>;
  }

  return <div className="space-y-5">
    <header className="surface-panel p-5">
      <div className="flex items-center gap-2"><Bot className="size-5"/><h2 className="text-2xl font-semibold">Revisar planejamento financeiro</h2></div>
      <p className="mt-2 text-sm text-muted-foreground">Este gate cria apenas o plano financeiro-base. Não cria Price, Sellable, Order, checkout ou Pix.</p>
    </header>
    <section className="surface-panel space-y-4 p-5">
      <div className="flex items-center gap-2"><WalletCards className="size-4"/><h3 className="font-semibold">Plano proposto</h3></div>
      <dl className="grid gap-3 sm:grid-cols-2">
        {[
          ["Operação", draft.operation_name],
          ["Pagantes-base", String(draft.expected_paying_passengers)],
          ["Stress", draft.stress_paying_passengers ? String(draft.stress_paying_passengers) : "—"],
          ["Preço-alvo", draft.target_unit_price_minor === 0 ? "Pendente" : brl(draft.target_unit_price_minor)],
          ["Contingência", brl(draft.contingency_minor)],
          ["Taxas", brl(draft.tax_fee_minor)],
          ["Margem mínima", `${draft.minimum_margin_pct}%`],
          ["Ambiente", "PRODUCTION · planejamento bloqueado para venda"],
        ].map(([label, value]) => <div key={label} className="rounded-lg border border-border bg-elevated/50 px-3 py-2"><dt className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">{label}</dt><dd className="mt-1 text-sm">{value}</dd></div>)}
      </dl>
      {!tenantMatches ? <p className="rounded-lg border border-destructive/40 p-3 text-sm text-destructive">Este plano pertence a outro tenant.</p> : null}
      {!canManage ? <p className="rounded-lg border border-border p-3 text-sm text-muted-foreground">Sua função atual não permite criar o plano financeiro.</p> : null}
      {created ? <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border p-4"><span className="flex items-center gap-2 text-sm font-medium"><CheckCircle2 className="size-5"/>Plano financeiro-base criado.</span><Button asChild><Link to="/operations/$operationId" params={{ operationId: draft.operation_id }}>Abrir operação</Link></Button></div> : <div className="flex justify-end"><Button disabled={!canCreate} onClick={() => void approve()}>{pending ? "Criando…" : "Aprovar plano financeiro"}</Button></div>}
    </section>
  </div>;
}

function ChatAssistedFinancialPlanPage() {
  return <AppShell activeId="operations" title="Planejamento financeiro assistido"><div className="mx-auto w-full max-w-5xl space-y-4"><Button asChild variant="ghost" size="sm"><Link to="/operations"><ArrowLeft className="mr-2 size-4"/>Voltar</Link></Button><RequireTenant><ReviewFinancialPlanDraft/></RequireTenant></div></AppShell>;
}
