import * as React from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft, Bot, CheckCircle2, QrCode } from "lucide-react";

import { AppShell } from "@/app/shell/app-shell";
import { RequireTenant } from "@/app/shell/require-tenant";
import { Button } from "@/components/ui/button";
import { feedback } from "@/components/feedback/feedback";
import { supabase } from "@/integrations/supabase/client";
import { useTenant } from "@/lib/tenant";

type PixDraft = {
  tenant_id: string;
  order_id: string;
  expected_total_minor: 100;
  environment: "test";
};

type ChargeResult = {
  charge_id?: string;
  attempt_id?: string;
  status?: string;
  pix_qr_code?: string | null;
  pix_ticket_url?: string | null;
  environment?: string;
};

export const Route = createFileRoute("/_authenticated/chat-assisted-pix")({
  head: () => ({
    meta: [{ title: "Pix TEST assistido — COBS OS" }, { name: "robots", content: "noindex" }],
  }),
  component: ChatAssistedPixPage,
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

function parseDraft(): PixDraft | null {
  if (typeof window === "undefined") return null;
  const encoded = new URLSearchParams(window.location.search).get("draft");
  if (!encoded) return null;
  try {
    const parsed = JSON.parse(decodeBase64Url(encoded)) as Partial<PixDraft>;
    if (!isUuid(parsed.tenant_id) || !isUuid(parsed.order_id) || parsed.expected_total_minor !== 100 || parsed.environment !== "test") return null;
    return parsed as PixDraft;
  } catch {
    return null;
  }
}

function isOrderEntryWithId(value: unknown): value is { id: string } {
  return typeof value === "object" && value !== null && "id" in value && typeof (value as { id?: unknown }).id === "string";
}

function ReviewPixDraft() {
  const { tenant, canManage } = useTenant();
  const [draft] = React.useState<PixDraft | null>(() => parseDraft());
  const [pending, setPending] = React.useState(false);
  const [result, setResult] = React.useState<ChargeResult | null>(null);
  const tenantMatches = Boolean(draft && tenant?.id === draft.tenant_id);
  const canCreate = Boolean(draft && tenantMatches && canManage && !pending && !result);

  async function approve() {
    if (!draft || !canCreate) return;
    setPending(true);
    try {
      const { data: order, error: orderError } = await supabase
        .from("orders")
        .select("id,tenant_id,status,currency,grand_total_minor,reference_label")
        .eq("id", draft.order_id)
        .eq("tenant_id", draft.tenant_id)
        .maybeSingle();
      if (orderError) throw orderError;
      if (!order || order.status !== "submitted" || order.currency !== "BRL" || Number(order.grand_total_minor) !== 100) {
        throw new Error("Pedido QA não está elegível para o Pix TEST de R$ 1,00.");
      }

      const { data: qaOrders, error: qaError } = await supabase.rpc("list_orders_by_environment", {
        _tenant_id: draft.tenant_id,
        _environment: "qa",
        _limit: 500,
      });
      if (qaError) throw qaError;
      if (!Array.isArray(qaOrders) || !qaOrders.some((entry) => isOrderEntryWithId(entry) && entry.id === draft.order_id)) {
        throw new Error("FAIL CLOSED: pedido não foi classificado como QA. Pix não criado.");
      }

      const { data: authData, error: authError } = await supabase.auth.getUser();
      if (authError || !authData.user?.email) {
        throw new Error("Sessão autenticada sem e-mail válido para o payer TEST.");
      }

      const { data, error } = await supabase.functions.invoke("payments-create-charge", {
        body: { order_id: draft.order_id, payer_email: authData.user.email },
      });
      if (error) throw error;
      const charge = (data ?? {}) as ChargeResult;
      if (charge.environment !== "test") {
        throw new Error("FAIL CLOSED: motor financeiro não confirmou environment=test.");
      }
      if (!charge.charge_id || !charge.attempt_id) {
        throw new Error("Pix TEST retornou sem charge/attempt válidos.");
      }
      setResult(charge);
      feedback.success("Pix TEST de R$ 1,00 criado pelo motor oficial de pagamentos.");
    } catch (error) {
      feedback.error(error instanceof Error ? error.message : "Não foi possível criar o Pix TEST.");
    } finally {
      setPending(false);
    }
  }

  if (!draft) {
    return (
      <section className="surface-panel p-5">
        <h2 className="text-xl font-semibold">Draft Pix inválido ou ausente</h2>
      </section>
    );
  }

  return (
    <div className="space-y-5">
      <header className="surface-panel p-5">
        <div className="flex items-center gap-2">
          <Bot className="size-5" />
          <h2 className="text-2xl font-semibold">Revisar Pix TEST assistido</h2>
        </div>
        <p className="mt-2 text-sm text-muted-foreground">
          Este é o primeiro gate que chama o Mercado Pago. O pedido precisa ser classificado como QA e o motor precisa retornar environment=test.
        </p>
      </header>
      <section className="surface-panel space-y-4 p-5">
        <div className="flex items-center gap-2">
          <QrCode className="size-4" />
          <h3 className="font-semibold">Cobrança proposta</h3>
        </div>
        <dl className="grid gap-3 sm:grid-cols-2">
          {[
            ["Valor", "R$ 1,00"],
            ["Moeda", "BRL"],
            ["Ambiente obrigatório", "TEST"],
            ["Order", draft.order_id],
            ["Provider", "Mercado Pago"],
            ["Produção", "Bloqueada neste gate"],
          ].map(([label, value]) => (
            <div key={label} className="rounded-lg border border-border bg-elevated/50 px-3 py-2">
              <dt className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">{label}</dt>
              <dd className="mt-1 break-words text-sm">{value}</dd>
            </div>
          ))}
        </dl>
        {!tenantMatches ? (
          <p className="rounded-lg border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive">Este draft pertence a outro tenant.</p>
        ) : null}
        {!canManage ? (
          <p className="rounded-lg border border-border bg-elevated/50 p-3 text-sm text-muted-foreground">Sua função atual não permite criar cobranças.</p>
        ) : null}
        {result ? (
          <div className="space-y-3 rounded-lg border border-border bg-elevated/50 p-4">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="size-5" />
              <span className="text-sm font-medium">Pix TEST criado. Environment confirmado: TEST.</span>
            </div>
            {result.pix_qr_code ? (
              <textarea readOnly className="min-h-24 w-full rounded-md border bg-background p-3 font-mono text-xs" value={result.pix_qr_code} />
            ) : null}
            {result.pix_ticket_url ? (
              <a className="text-sm underline" href={result.pix_ticket_url} target="_blank" rel="noreferrer">
                Abrir Pix TEST no provider
              </a>
            ) : null}
          </div>
        ) : (
          <div className="flex justify-end">
            <Button disabled={!canCreate} onClick={() => void approve()}>
              {pending ? "Gerando Pix TEST…" : "Gerar Pix TEST de R$ 1,00"}
            </Button>
          </div>
        )}
      </section>
    </div>
  );
}

function ChatAssistedPixPage() {
  return (
    <AppShell activeId="commerce" title="Pix TEST assistido">
      <div className="mx-auto w-full max-w-5xl space-y-4">
        <Button asChild variant="ghost" size="sm" className="-ml-2 min-h-9">
          <Link to="/commerce" search={{ environment: "qa" }}>
            <ArrowLeft className="mr-2 size-4" />
            Voltar para comércio QA
          </Link>
        </Button>
        <RequireTenant>
          <ReviewPixDraft />
        </RequireTenant>
      </div>
    </AppShell>
  );
}
