import * as React from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft, Bot, CheckCircle2, ReceiptText } from "lucide-react";

import { AppShell } from "@/app/shell/app-shell";
import { RequireTenant } from "@/app/shell/require-tenant";
import { Button } from "@/components/ui/button";
import { feedback } from "@/components/feedback/feedback";
import { supabase } from "@/integrations/supabase/client";
import { useTenant } from "@/lib/tenant";

type OrderDraft = {
  tenant_id: string;
  operation_id: string;
  sellable_id: string;
  buyer_person_id: string;
  currency: "BRL";
  expected_total_minor: 100;
  reference_label: string;
  notes?: string;
  idempotency_key: string;
};

export const Route = createFileRoute("/_authenticated/chat-assisted-order")({
  head: () => ({
    meta: [
      { title: "Pedido QA assistido — COBS OS" },
      { name: "description", content: "Revise e aprove um pedido QA estruturado pelo assistente." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: ChatAssistedOrderPage,
});

function decodeBase64Url(value: string) {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
  const binary = atob(padded);
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

function isUuid(value: unknown): value is string {
  return typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function parseDraft(): OrderDraft | null {
  if (typeof window === "undefined") return null;
  const encoded = new URLSearchParams(window.location.search).get("draft");
  if (!encoded) return null;
  try {
    const parsed = JSON.parse(decodeBase64Url(encoded)) as Partial<OrderDraft>;
    if (!isUuid(parsed.tenant_id) || !isUuid(parsed.operation_id) || !isUuid(parsed.sellable_id) || !isUuid(parsed.buyer_person_id)) return null;
    if (parsed.currency !== "BRL" || parsed.expected_total_minor !== 100) return null;
    if (typeof parsed.reference_label !== "string" || !/(^|[^A-Z0-9])QA([^A-Z0-9]|$)/i.test(parsed.reference_label)) return null;
    if (typeof parsed.idempotency_key !== "string" || parsed.idempotency_key.trim().length < 8) return null;
    return parsed as OrderDraft;
  } catch {
    return null;
  }
}

function ReviewOrderDraft() {
  const { tenant, canManage } = useTenant();
  const [draft] = React.useState<OrderDraft | null>(() => parseDraft());
  const [pending, setPending] = React.useState(false);
  const [orderId, setOrderId] = React.useState<string | null>(null);
  const tenantMatches = Boolean(draft && tenant?.id === draft.tenant_id);
  const canCreate = Boolean(draft && tenantMatches && canManage && !pending && !orderId);

  async function approve() {
    if (!draft || !canCreate) return;
    setPending(true);
    try {
      const [{ data: operation, error: operationError }, { data: buyer, error: buyerError }, { data: sellable, error: sellableError }] = await Promise.all([
        supabase.from("operations").select("id,status").eq("id", draft.operation_id).eq("tenant_id", draft.tenant_id).maybeSingle(),
        supabase.from("people").select("id,full_name").eq("id", draft.buyer_person_id).eq("tenant_id", draft.tenant_id).maybeSingle(),
        supabase.from("sellables").select("id,status,metadata").eq("id", draft.sellable_id).eq("tenant_id", draft.tenant_id).maybeSingle(),
      ]);
      if (operationError) throw operationError;
      if (buyerError) throw buyerError;
      if (sellableError) throw sellableError;
      if (!operation) throw new Error("Operação QA não encontrada neste tenant.");
      if (["completed", "cancelled"].includes(operation.status)) throw new Error("Operação encerrada não pode receber pedido.");
      if (!buyer) throw new Error("Identidade QA compradora não encontrada.");
      if (!sellable || sellable.status !== "active") throw new Error("Sellable QA não está ativo.");
      const metadata = (sellable.metadata ?? {}) as Record<string, unknown>;
      if (metadata["qa"] !== true || metadata["environment"] !== "test" || metadata["operation_id"] !== draft.operation_id) {
        throw new Error("Sellable não pertence ao ambiente TEST desta operação.");
      }

      const { data: prices, error: priceError } = await supabase
        .from("prices")
        .select("id,currency,unit_amount_minor,price_basis,status")
        .eq("sellable_id", draft.sellable_id)
        .eq("tenant_id", draft.tenant_id)
        .eq("status", "active")
        .eq("currency", "BRL")
        .eq("unit_amount_minor", 100)
        .limit(2);
      if (priceError) throw priceError;
      if ((prices ?? []).length !== 1) throw new Error("É necessário exatamente um Price ativo de R$ 1,00 para este Sellable QA.");

      const { data: createdOrderId, error: createError } = await supabase.rpc("create_order", {
        _tenant_id: draft.tenant_id,
        _buyer_person_id: draft.buyer_person_id,
        _currency: "BRL",
        _operation_id: draft.operation_id,
        _reference_label: draft.reference_label.trim(),
        ...(draft.notes?.trim() ? { _notes: draft.notes.trim() } : {}),
        _idempotency_key: draft.idempotency_key,
      });
      if (createError) throw createError;
      const id = String(createdOrderId ?? "");
      if (!isUuid(id)) throw new Error("Pedido criado sem identificador válido.");

      const { data: existingItems, error: itemLookupError } = await supabase
        .from("order_items")
        .select("id,sellable_id,unit_amount_minor,quantity")
        .eq("order_id", id)
        .eq("tenant_id", draft.tenant_id);
      if (itemLookupError) throw itemLookupError;
      if ((existingItems ?? []).length === 0) {
        const { error: addError } = await supabase.rpc("add_order_item", {
          _order_id: id,
          _sellable_id: draft.sellable_id,
          _quantity: 1,
          _discount_minor: 0,
          _beneficiary_person_id: draft.buyer_person_id,
        });
        if (addError) throw addError;
      } else if ((existingItems ?? []).length !== 1 || existingItems?.[0]?.sellable_id !== draft.sellable_id || Number(existingItems?.[0]?.unit_amount_minor) !== 100 || Number(existingItems?.[0]?.quantity) !== 1) {
        throw new Error("Retry encontrou um pedido QA com itens divergentes; revisão manual necessária.");
      }

      const { data: submitted, error: submitError } = await supabase.rpc("submit_order", {
        _order_id: id,
        _idempotency_key: `${draft.idempotency_key}:submit`,
      });
      if (submitError) throw submitError;
      const total = Number((submitted as { totals?: { grand_total_minor?: number } } | null)?.totals?.grand_total_minor ?? 100);
      if (total !== draft.expected_total_minor) throw new Error("Total QA divergente de R$ 1,00.");

      setOrderId(id);
      feedback.success("Pedido QA de R$ 1,00 criado e submetido sem gerar Pix.");
    } catch (error) {
      feedback.error(error instanceof Error ? error.message : "Não foi possível criar o pedido QA.");
    } finally {
      setPending(false);
    }
  }

  if (!draft) return <section className="surface-panel space-y-3 p-5"><h2 className="text-xl font-semibold">Draft de pedido inválido ou ausente</h2></section>;

  return <div className="space-y-5">
    <header className="surface-panel p-5"><div className="flex items-center gap-2"><Bot className="size-5"/><h2 className="text-2xl font-semibold">Revisar pedido QA assistido</h2></div><p className="mt-2 text-sm text-muted-foreground">Este gate cria e submete apenas o Order TEST de R$ 1,00. Não cria payment_charge, payment_attempt nem chama Mercado Pago.</p></header>
    <section className="surface-panel space-y-4 p-5">
      <div className="flex items-center gap-2"><ReceiptText className="size-4"/><h3 className="font-semibold">Pedido QA proposto</h3></div>
      <dl className="grid gap-3 sm:grid-cols-2">{[
        ["Total", "R$ 1,00"], ["Moeda", "BRL"], ["Ambiente", "TEST / QA"], ["Referência", draft.reference_label], ["Operação", draft.operation_id], ["Sellable", draft.sellable_id], ["Comprador QA", draft.buyer_person_id], ["Pix", "Não será criado neste gate"],
      ].map(([label,value])=><div key={label} className="rounded-lg border border-border bg-elevated/50 px-3 py-2"><dt className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">{label}</dt><dd className="mt-1 break-words text-sm">{value}</dd></div>)}</dl>
      {!tenantMatches ? <p className="rounded-lg border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive">Este draft pertence a outro tenant.</p> : null}
      {!canManage ? <p className="rounded-lg border border-border bg-elevated/50 p-3 text-sm text-muted-foreground">Sua função atual não permite criar pedidos.</p> : null}
      {orderId ? <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-elevated/50 p-4"><div className="flex items-center gap-2"><CheckCircle2 className="size-5"/><span className="text-sm font-medium">Order QA criado e submetido. Nenhum Pix foi iniciado.</span></div><Button asChild><Link to="/commerce/$orderId" params={{ orderId }} search={{ environment: "qa" }}>Abrir pedido</Link></Button></div> : <div className="flex justify-end"><Button disabled={!canCreate} onClick={()=>void approve()}>{pending ? "Criando…" : "Aprovar pedido QA de R$ 1,00"}</Button></div>}
    </section>
  </div>;
}

function ChatAssistedOrderPage() {
  return <AppShell activeId="commerce" title="Pedido QA assistido"><div className="mx-auto w-full max-w-5xl space-y-4"><Button asChild variant="ghost" size="sm" className="-ml-2 min-h-9"><Link to="/commerce" search={{ environment: "qa" }}><ArrowLeft className="mr-2 size-4"/>Voltar para comércio QA</Link></Button><RequireTenant><ReviewOrderDraft/></RequireTenant></div></AppShell>;
}
