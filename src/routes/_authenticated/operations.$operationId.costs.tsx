import * as React from "react";
import { createFileRoute, useParams } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PanelSkeleton } from "@/components/feedback/loading";
import { feedback } from "@/components/feedback/feedback";
import { supabase } from "@/integrations/supabase/client";
import { humanizeError } from "@/lib/auth";
import { useI18n } from "@/lib/i18n";
import { useTenant } from "@/lib/tenant";

export const Route = createFileRoute("/_authenticated/operations/$operationId/costs")({
  component: OperationCosts,
});

const db = supabase as any;

function money(value: number | null | undefined) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(
    (Number(value ?? 0) || 0) / 100,
  );
}

function toMinor(value: string) {
  const normalized = value.replace(/\./g, "").replace(",", ".");
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? Math.round(parsed * 100) : 0;
}

function Metric({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <div className="surface-panel p-4">
      <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">{label}</p>
      <p className="mt-2 text-2xl font-semibold">{value}</p>
      {note ? <p className="mt-1 text-xs text-muted-foreground">{note}</p> : null}
    </div>
  );
}

function OperationCosts() {
  const { operationId } = useParams({ from: "/_authenticated/operations/$operationId/costs" });
  const { canManage } = useTenant();
  const { locale } = useI18n();
  const queryClient = useQueryClient();

  const [plan, setPlan] = React.useState({ passengers: "30", unitPrice: "10000", contingency: "0", taxes: "0" });
  const [quote, setQuote] = React.useState({ supplier: "", category: "hotel", description: "", amount: "", validUntil: "", cancellationTerms: "", notes: "" });
  const [installment, setInstallment] = React.useState({ quoteId: "", dueDate: "", amount: "", notes: "" });

  const profitability = useQuery({
    queryKey: ["operation-profitability", operationId],
    queryFn: async () => {
      const { data, error } = await db.from("operation_profitability_summary").select("*").eq("operation_id", operationId).maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const planQuery = useQuery({
    queryKey: ["operation-financial-plan", operationId],
    queryFn: async () => {
      const { data, error } = await db.from("operation_financial_plans").select("*").eq("operation_id", operationId).maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  React.useEffect(() => {
    if (!planQuery.data) return;
    setPlan({
      passengers: String(planQuery.data.expected_paying_passengers ?? 30),
      unitPrice: String((planQuery.data.target_unit_price_minor ?? 0) / 100),
      contingency: String((planQuery.data.contingency_minor ?? 0) / 100),
      taxes: String((planQuery.data.tax_fee_minor ?? 0) / 100),
    });
  }, [planQuery.data]);

  const quotes = useQuery({
    queryKey: ["operation-quotes", operationId],
    queryFn: async () => {
      const { data, error } = await db
        .from("operation_quotes")
        .select("id,category,description,amount_minor,currency_code,status,valid_until,cancellation_terms,notes,created_at,supplier:suppliers(name),quote_payment_schedule(id,installment_no,due_date,amount_minor,status,notes)")
        .eq("operation_id", operationId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ["operation-profitability", operationId] });
    void queryClient.invalidateQueries({ queryKey: ["operation-financial-plan", operationId] });
    void queryClient.invalidateQueries({ queryKey: ["operation-quotes", operationId] });
  };

  const savePlan = useMutation({
    mutationFn: async () => {
      const { data: op, error: opError } = await db.from("operations").select("tenant_id").eq("id", operationId).single();
      if (opError) throw opError;
      const payload = {
        tenant_id: op.tenant_id,
        operation_id: operationId,
        expected_paying_passengers: Math.max(1, Number(plan.passengers) || 1),
        target_unit_price_minor: toMinor(plan.unitPrice),
        contingency_minor: toMinor(plan.contingency),
        tax_fee_minor: toMinor(plan.taxes),
        updated_at: new Date().toISOString(),
      };
      const { error } = await db.from("operation_financial_plans").upsert(payload, { onConflict: "operation_id" });
      if (error) throw error;
    },
    onSuccess: () => { feedback.success("Cenário financeiro atualizado."); invalidate(); },
    onError: (error) => feedback.error(humanizeError(error, locale)),
  });

  const createQuote = useMutation({
    mutationFn: async () => {
      const { error } = await db.rpc("create_operation_quote", {
        _operation_id: operationId,
        _supplier_name: quote.supplier,
        _category: quote.category,
        _description: quote.description,
        _amount_minor: toMinor(quote.amount),
        _valid_until: quote.validUntil || null,
        _cancellation_terms: quote.cancellationTerms || null,
        _notes: quote.notes || null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      feedback.success("Cotação cadastrada.");
      setQuote({ supplier: "", category: "hotel", description: "", amount: "", validUntil: "", cancellationTerms: "", notes: "" });
      invalidate();
    },
    onError: (error) => feedback.error(humanizeError(error, locale)),
  });

  const selectQuote = useMutation({
    mutationFn: async (quoteId: string) => {
      const { error } = await db.rpc("select_operation_quote", { _quote_id: quoteId });
      if (error) throw error;
    },
    onSuccess: () => { feedback.success("Cotação selecionada para o cenário."); invalidate(); },
    onError: (error) => feedback.error(humanizeError(error, locale)),
  });

  const addInstallment = useMutation({
    mutationFn: async () => {
      const { error } = await db.rpc("add_quote_payment_installment", {
        _quote_id: installment.quoteId,
        _due_date: installment.dueDate,
        _amount_minor: toMinor(installment.amount),
        _notes: installment.notes || null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      feedback.success("Vencimento adicionado.");
      setInstallment({ quoteId: "", dueDate: "", amount: "", notes: "" });
      invalidate();
    },
    onError: (error) => feedback.error(humanizeError(error, locale)),
  });

  if (profitability.isLoading || quotes.isLoading || planQuery.isLoading) return <PanelSkeleton rows={5} />;

  const summary = profitability.data;
  const hasSelectedCosts = Number(summary?.selected_cost_minor ?? 0) > 0;

  return (
    <div className="space-y-6">
      <section className="space-y-2">
        <h2 className="text-2xl font-semibold">Custos & Cotações</h2>
        <p className="text-sm text-muted-foreground">Compare fornecedores, escolha a proposta vencedora e acompanhe o impacto na margem da operação.</p>
      </section>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <Metric label="Receita prevista" value={money(summary?.gross_revenue_minor)} note={`${summary?.expected_paying_passengers ?? 0} pagantes`} />
        <Metric label="Custos selecionados" value={money(summary?.total_planned_cost_minor)} />
        <Metric label="Lucro projetado" value={money(summary?.projected_profit_minor)} note={hasSelectedCosts ? "Com fornecedores selecionados" : "Ainda sem custos selecionados"} />
        <Metric label="Margem" value={hasSelectedCosts && summary?.margin_pct != null ? `${summary.margin_pct}%` : "—"} />
        <Metric label="Ponto de equilíbrio" value={hasSelectedCosts && summary?.break_even_passengers != null ? `${summary.break_even_passengers} pax` : "—"} />
      </div>

      {!hasSelectedCosts ? (
        <div className="rounded-lg border border-dashed border-border bg-elevated/40 p-3 text-sm text-muted-foreground">
          O cenário de receita está configurado, mas o lucro ainda não deve ser usado para decisão até que pelo menos uma cotação por categoria relevante seja selecionada.
        </div>
      ) : null}

      {canManage ? (
        <section className="surface-panel space-y-4 p-5">
          <div>
            <h3 className="font-semibold">Cenário financeiro</h3>
            <p className="text-sm text-muted-foreground">Altere somente hipóteses de planejamento. O preço comercial final continua separado.</p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div><Label>Pagantes</Label><Input value={plan.passengers} onChange={(e) => setPlan((p) => ({ ...p, passengers: e.target.value }))} /></div>
            <div><Label>Ticket alvo (R$)</Label><Input value={plan.unitPrice} onChange={(e) => setPlan((p) => ({ ...p, unitPrice: e.target.value }))} /></div>
            <div><Label>Contingência (R$)</Label><Input value={plan.contingency} onChange={(e) => setPlan((p) => ({ ...p, contingency: e.target.value }))} /></div>
            <div><Label>Taxas/impostos (R$)</Label><Input value={plan.taxes} onChange={(e) => setPlan((p) => ({ ...p, taxes: e.target.value }))} /></div>
          </div>
          <Button disabled={savePlan.isPending} onClick={() => savePlan.mutate()}>{savePlan.isPending ? "Salvando..." : "Salvar cenário"}</Button>
        </section>
      ) : null}

      {canManage ? (
        <section className="surface-panel space-y-4 p-5">
          <div><h3 className="font-semibold">Nova cotação</h3><p className="text-sm text-muted-foreground">Cadastre Hotel A/B/C, transporte, alimentação, seguro, inscrição ou outro fornecedor.</p></div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <div><Label>Fornecedor</Label><Input value={quote.supplier} onChange={(e) => setQuote((q) => ({ ...q, supplier: e.target.value }))} /></div>
            <div><Label>Categoria</Label><select className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm" value={quote.category} onChange={(e) => setQuote((q) => ({ ...q, category: e.target.value }))}><option value="hotel">Hotel</option><option value="transport">Transporte</option><option value="food">Alimentação</option><option value="insurance">Seguro</option><option value="event">Inscrição/evento</option><option value="staff">Equipe/guia</option><option value="other">Outros</option></select></div>
            <div><Label>Valor total (R$)</Label><Input value={quote.amount} onChange={(e) => setQuote((q) => ({ ...q, amount: e.target.value }))} /></div>
            <div className="sm:col-span-2"><Label>Descrição</Label><Input value={quote.description} onChange={(e) => setQuote((q) => ({ ...q, description: e.target.value }))} /></div>
            <div><Label>Validade</Label><Input type="date" value={quote.validUntil} onChange={(e) => setQuote((q) => ({ ...q, validUntil: e.target.value }))} /></div>
            <div className="sm:col-span-2"><Label>Cancelamento</Label><Input value={quote.cancellationTerms} onChange={(e) => setQuote((q) => ({ ...q, cancellationTerms: e.target.value }))} /></div>
            <div><Label>Observações</Label><Input value={quote.notes} onChange={(e) => setQuote((q) => ({ ...q, notes: e.target.value }))} /></div>
          </div>
          <Button disabled={createQuote.isPending || !quote.supplier.trim() || !quote.description.trim() || toMinor(quote.amount) <= 0} onClick={() => createQuote.mutate()}>{createQuote.isPending ? "Cadastrando..." : "Cadastrar cotação"}</Button>
        </section>
      ) : null}

      <section className="space-y-3">
        <div><h3 className="font-semibold">Propostas</h3><p className="text-sm text-muted-foreground">Apenas a proposta marcada como selecionada entra no custo projetado da categoria.</p></div>
        {(quotes.data ?? []).length === 0 ? <div className="surface-panel p-5 text-sm text-muted-foreground">Nenhuma cotação cadastrada ainda.</div> : (quotes.data ?? []).map((q: any) => (
          <article key={q.id} className="surface-panel space-y-3 p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div><p className="font-semibold">{q.supplier?.name ?? "Fornecedor"}</p><p className="text-sm text-muted-foreground">{q.category} · {q.description}</p></div>
              <div className="text-right"><p className="text-lg font-semibold">{money(q.amount_minor)}</p><p className="text-xs uppercase tracking-wide text-muted-foreground">{q.status}</p></div>
            </div>
            <div className="grid gap-2 text-sm sm:grid-cols-3">
              <div><span className="text-muted-foreground">Validade:</span> {q.valid_until || "—"}</div>
              <div><span className="text-muted-foreground">Cancelamento:</span> {q.cancellation_terms || "—"}</div>
              <div><span className="text-muted-foreground">Parcelas:</span> {(q.quote_payment_schedule ?? []).length}</div>
            </div>
            {(q.quote_payment_schedule ?? []).length > 0 ? <div className="rounded-lg border border-border p-3"><p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">Pagamentos previstos</p><div className="space-y-1 text-sm">{[...(q.quote_payment_schedule ?? [])].sort((a: any,b: any) => a.installment_no-b.installment_no).map((p: any) => <div key={p.id} className="flex justify-between gap-3"><span>{p.installment_no}ª · {p.due_date}</span><span>{money(p.amount_minor)}</span></div>)}</div></div> : null}
            {canManage && q.status !== "selected" ? <Button variant="outline" disabled={selectQuote.isPending} onClick={() => selectQuote.mutate(q.id)}>Selecionar proposta</Button> : null}
          </article>
        ))}
      </section>

      {canManage && (quotes.data ?? []).length > 0 ? (
        <section className="surface-panel space-y-4 p-5">
          <div><h3 className="font-semibold">Adicionar vencimento</h3><p className="text-sm text-muted-foreground">Registre sinal, parcelas e saldo do fornecedor.</p></div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div><Label>Cotação</Label><select className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm" value={installment.quoteId} onChange={(e) => setInstallment((p) => ({ ...p, quoteId: e.target.value }))}><option value="">Selecione</option>{(quotes.data ?? []).map((q: any) => <option key={q.id} value={q.id}>{q.supplier?.name ?? q.description} · {money(q.amount_minor)}</option>)}</select></div>
            <div><Label>Vencimento</Label><Input type="date" value={installment.dueDate} onChange={(e) => setInstallment((p) => ({ ...p, dueDate: e.target.value }))} /></div>
            <div><Label>Valor (R$)</Label><Input value={installment.amount} onChange={(e) => setInstallment((p) => ({ ...p, amount: e.target.value }))} /></div>
            <div><Label>Observação</Label><Input value={installment.notes} onChange={(e) => setInstallment((p) => ({ ...p, notes: e.target.value }))} /></div>
          </div>
          <Button disabled={addInstallment.isPending || !installment.quoteId || !installment.dueDate || toMinor(installment.amount) <= 0} onClick={() => addInstallment.mutate()}>{addInstallment.isPending ? "Adicionando..." : "Adicionar vencimento"}</Button>
        </section>
      ) : null}
    </div>
  );
}
