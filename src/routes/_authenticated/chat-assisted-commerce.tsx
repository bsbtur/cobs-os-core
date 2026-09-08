import * as React from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft, Bot, CheckCircle2, ShoppingBag } from "lucide-react";

import { AppShell } from "@/app/shell/app-shell";
import { RequireTenant } from "@/app/shell/require-tenant";
import { Button } from "@/components/ui/button";
import { feedback } from "@/components/feedback/feedback";
import { supabase } from "@/integrations/supabase/client";
import { useTenant } from "@/lib/tenant";
import type { Database } from "@/integrations/supabase/types";

type PriceBasis = Database["public"]["Enums"]["price_basis"];
type SellableArgs = Database["public"]["Functions"]["create_sellable"]["Args"];
type PriceArgs = Database["public"]["Functions"]["create_price"]["Args"];

type CommerceDraft = {
  tenant_id: string;
  experience_id: string;
  operation_id: string;
  offering: {
    name: string;
    slug: string;
    currency_code: string;
    capacity?: number | null;
    idempotency_key: string;
  };
  sellable: {
    description?: string;
    metadata?: Record<string, unknown>;
  };
  price: {
    currency: string;
    unit_amount_minor: number;
    price_basis: PriceBasis;
    description?: string;
  };
};

export const Route = createFileRoute("/_authenticated/chat-assisted-commerce")({
  head: () => ({
    meta: [
      { title: "Cadastro comercial assistido — COBS OS" },
      { name: "description", content: "Revise e aprove a camada comercial estruturada pelo assistente." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: ChatAssistedCommercePage,
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

function parseDraft(): CommerceDraft | null {
  if (typeof window === "undefined") return null;
  const encoded = new URLSearchParams(window.location.search).get("draft");
  if (!encoded) return null;
  try {
    const parsed = JSON.parse(decodeBase64Url(encoded)) as Partial<CommerceDraft>;
    if (!isUuid(parsed.tenant_id) || !isUuid(parsed.experience_id) || !isUuid(parsed.operation_id)) return null;
    if (!parsed.offering || typeof parsed.offering.name !== "string" || typeof parsed.offering.slug !== "string" || typeof parsed.offering.currency_code !== "string" || typeof parsed.offering.idempotency_key !== "string") return null;
    if (parsed.offering.capacity != null && (!Number.isInteger(parsed.offering.capacity) || parsed.offering.capacity < 1)) return null;
    if (!parsed.sellable || !parsed.price || typeof parsed.price.currency !== "string" || !Number.isInteger(parsed.price.unit_amount_minor) || parsed.price.unit_amount_minor < 0 || !["per_person", "per_unit", "flat"].includes(parsed.price.price_basis ?? "")) return null;
    return parsed as CommerceDraft;
  } catch {
    return null;
  }
}

function extractOfferingId(data: unknown) {
  if (data && typeof data === "object" && "offering_id" in data) return String((data as { offering_id: unknown }).offering_id);
  return String(data ?? "");
}

function ReviewCommerceDraft() {
  const { tenant, canManage } = useTenant();
  const [draft] = React.useState<CommerceDraft | null>(() => parseDraft());
  const [pending, setPending] = React.useState(false);
  const [result, setResult] = React.useState<{ offeringId: string; sellableId: string; priceId: string } | null>(null);
  const tenantMatches = Boolean(draft && tenant?.id === draft.tenant_id);
  const canCreate = Boolean(draft && tenantMatches && canManage && !pending && !result);

  async function approve() {
    if (!draft || !canCreate) return;
    setPending(true);
    try {
      const { data: operation, error: operationError } = await supabase
        .from("operations")
        .select("id")
        .eq("id", draft.operation_id)
        .eq("tenant_id", draft.tenant_id)
        .eq("experience_id", draft.experience_id)
        .maybeSingle();
      if (operationError) throw operationError;
      if (!operation) throw new Error("A operação informada não pertence a esta Experience no tenant atual.");

      let offeringId = "";
      const { data: existingOffering, error: offeringLookupError } = await supabase
        .from("offerings")
        .select("id, experience_id")
        .eq("tenant_id", draft.tenant_id)
        .eq("slug", draft.offering.slug.toLowerCase())
        .maybeSingle();
      if (offeringLookupError) throw offeringLookupError;
      if (existingOffering) {
        if (existingOffering.experience_id !== draft.experience_id) throw new Error("Já existe uma Offering com este slug em outra Experience.");
        offeringId = existingOffering.id;
      } else {
        const optional: Record<string, string | number> = {};
        if (draft.offering.capacity != null) optional["_capacity"] = draft.offering.capacity;
        if (draft.offering.currency_code.trim()) optional["_currency_code"] = draft.offering.currency_code.trim().toUpperCase();
        const { data: offeringData, error: offeringError } = await supabase.rpc("create_offering", {
          _tenant_id: draft.tenant_id,
          _experience_id: draft.experience_id,
          _name: draft.offering.name.trim(),
          _slug: draft.offering.slug.trim().toLowerCase(),
          _idempotency_key: draft.offering.idempotency_key,
          ...optional,
        });
        if (offeringError) throw offeringError;
        offeringId = extractOfferingId(offeringData);
        if (!isUuid(offeringId)) throw new Error("A Offering foi criada sem um identificador válido.");
      }

      let sellableId = "";
      const { data: existingSellables, error: sellableLookupError } = await supabase
        .from("sellables")
        .select("id")
        .eq("tenant_id", draft.tenant_id)
        .eq("offering_id", offeringId)
        .eq("sellable_kind", "offering")
        .neq("status", "archived")
        .limit(1);
      if (sellableLookupError) throw sellableLookupError;
      if (existingSellables?.[0]?.id) {
        sellableId = existingSellables[0].id;
      } else {
        const sellableArgs: SellableArgs = {
          _tenant_id: draft.tenant_id,
          _sellable_kind: "offering",
          _offering_id: offeringId,
          _metadata: {
            ...(draft.sellable.metadata ?? {}),
            qa: true,
            environment: "test",
            source: "chat_assisted_commerce",
            operation_id: draft.operation_id,
          },
        };
        if (draft.sellable.description?.trim()) sellableArgs._description = draft.sellable.description.trim();
        const { data: sellableData, error: sellableError } = await supabase.rpc("create_sellable", sellableArgs);
        if (sellableError) throw sellableError;
        sellableId = String(sellableData ?? "");
        if (!isUuid(sellableId)) throw new Error("O Sellable foi criado sem um identificador válido.");
      }

      let priceId = "";
      const { data: existingPrices, error: priceLookupError } = await supabase
        .from("prices")
        .select("id")
        .eq("tenant_id", draft.tenant_id)
        .eq("sellable_id", sellableId)
        .eq("status", "active")
        .eq("currency", draft.price.currency.toUpperCase())
        .eq("unit_amount_minor", draft.price.unit_amount_minor)
        .eq("price_basis", draft.price.price_basis)
        .limit(1);
      if (priceLookupError) throw priceLookupError;
      if (existingPrices?.[0]?.id) {
        priceId = existingPrices[0].id;
      } else {
        const priceArgs: PriceArgs = {
          _sellable_id: sellableId,
          _currency: draft.price.currency.toUpperCase(),
          _unit_amount_minor: draft.price.unit_amount_minor,
          _price_basis: draft.price.price_basis,
        };
        if (draft.price.description?.trim()) priceArgs._description = draft.price.description.trim();
        const { data: priceData, error: priceError } = await supabase.rpc("create_price", priceArgs);
        if (priceError) throw priceError;
        priceId = String(priceData ?? "");
        if (!isUuid(priceId)) throw new Error("O preço foi criado sem um identificador válido.");
      }

      setResult({ offeringId, sellableId, priceId });
      feedback.success("Camada comercial QA criada sem publicação e sem pagamento.");
    } catch (error) {
      feedback.error(error instanceof Error ? error.message : "Não foi possível criar a camada comercial QA.");
    } finally {
      setPending(false);
    }
  }

  if (!draft) return <section className="surface-panel space-y-3 p-5"><h2 className="text-xl font-semibold">Draft comercial inválido ou ausente</h2><p className="text-sm text-muted-foreground">Abra esta página por um link de revisão gerado pelo assistente do COBS.</p></section>;

  return <div className="space-y-5">
    <header className="surface-panel p-5"><div className="flex items-center gap-2"><Bot className="size-5" aria-hidden="true" /><h2 className="text-2xl font-semibold">Revisar camada comercial assistida</h2></div><p className="mt-2 max-w-2xl text-sm text-muted-foreground">Este gate cria apenas Offering, Sellable e Price QA. Não publica checkout, não cria pedido e não inicia Pix.</p></header>
    <section className="surface-panel space-y-4 p-5">
      <div className="flex items-center gap-2"><ShoppingBag className="size-4"/><h3 className="font-semibold">Comércio QA proposto</h3></div>
      <dl className="grid gap-3 sm:grid-cols-2">{[
        ["Offering", draft.offering.name],
        ["Slug", draft.offering.slug],
        ["Capacidade", draft.offering.capacity == null ? "Não definida" : String(draft.offering.capacity)],
        ["Moeda", draft.offering.currency_code],
        ["Preço", `${(draft.price.unit_amount_minor / 100).toLocaleString("pt-BR", { style: "currency", currency: draft.price.currency })} · ${draft.price.price_basis}`],
        ["Ambiente", "TEST / QA"],
        ["Operação", draft.operation_id],
        ["Experience", draft.experience_id],
      ].map(([label,value])=><div key={label} className="rounded-lg border border-border bg-elevated/50 px-3 py-2"><dt className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">{label}</dt><dd className="mt-1 break-words text-sm">{value}</dd></div>)}</dl>
      <p className="rounded-lg border border-border bg-elevated/50 p-3 text-sm text-muted-foreground">A Offering permanece no estado padrão de criação. Este gate não chama activate_offering, não cria Order e não chama Mercado Pago.</p>
      {!tenantMatches ? <p className="rounded-lg border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive">Este draft pertence a outro tenant.</p> : null}
      {!canManage ? <p className="rounded-lg border border-border bg-elevated/50 p-3 text-sm text-muted-foreground">Sua função atual não permite criar a camada comercial.</p> : null}
      {result ? <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-elevated/50 p-4"><div className="flex items-center gap-2"><CheckCircle2 className="size-5"/><span className="text-sm font-medium">Offering, Sellable e Price QA preparados com sucesso.</span></div><Button asChild><Link to="/settings/catalog">Abrir catálogo</Link></Button></div> : <div className="flex justify-end"><Button disabled={!canCreate} onClick={()=>void approve()}>{pending ? "Criando…" : "Aprovar camada comercial QA"}</Button></div>}
    </section>
  </div>;
}

function ChatAssistedCommercePage() {
  return <AppShell activeId="commerce" title="Cadastro comercial assistido"><div className="mx-auto w-full max-w-5xl space-y-4"><Button asChild variant="ghost" size="sm" className="-ml-2 min-h-9"><Link to="/operations"><ArrowLeft className="mr-2 size-4"/>Voltar para operações</Link></Button><RequireTenant><ReviewCommerceDraft/></RequireTenant></div></AppShell>;
}
