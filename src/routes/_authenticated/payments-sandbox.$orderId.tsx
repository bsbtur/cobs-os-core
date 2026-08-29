import * as React from "react";
import { createFileRoute } from "@tanstack/react-router";

import { AppShell } from "@/app/shell/app-shell";
import { RequireTenant } from "@/app/shell/require-tenant";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/_authenticated/payments-sandbox/$orderId")({
  head: () => ({
    meta: [
      { title: "Mercado Pago Production Smoke — COBS OS" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: MercadoPagoProductionSmoke,
});

const SMOKE_SUPABASE_URL = "https://nktohbqmcpgonlizzcka.supabase.co";
const SMOKE_SUPABASE_PUBLISHABLE_KEY = "sb_publishable_yF0oXJtt-_ik8kq_FiGrdQ_2IwM4tzJ";
const CREATE_CHARGE_URL = `${SMOKE_SUPABASE_URL}/functions/v1/payments-create-charge`;

// Existing CLEAN BUILD QA fixtures intentionally reused for this temporary smoke only.
// The sellable is an active isolated R$ 1.00 QA item with no operation/capacity impact.
const SMOKE_TENANT_ID = "bb25410b-4c7a-4d4c-965c-ee43d7084068";
const SMOKE_BUYER_PERSON_ID = "cac2b2a9-93f4-4ec7-b517-3c2097493e4c";
const SMOKE_SELLABLE_ID = "dfa38372-147e-4f7a-9c52-112d77087dae";

type ChargeResult = {
  charge_id?: string;
  attempt_id?: string;
  provider_order_id?: string;
  provider_payment_id?: string | null;
  status?: string;
  provider_status?: string | null;
  provider_status_detail?: string | null;
  environment?: string;
  reused?: boolean;
  reconciled?: boolean;
  pix?: {
    qr_code?: string | null;
    qr_code_base64?: string | null;
    ticket_url?: string | null;
  };
  error?: string;
  details?: unknown;
};

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => {
      window.setTimeout(() => reject(new Error(`${label}_timeout_${ms}ms`)), ms);
    }),
  ]);
}

function MercadoPagoProductionSmoke() {
  const { orderId } = Route.useParams();
  const [payerEmail, setPayerEmail] = React.useState("");
  const [result, setResult] = React.useState<ChargeResult | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(false);
  const [creatingOrder, setCreatingOrder] = React.useState(false);
  const [step, setStep] = React.useState("Pronto para iniciar.");
  const smokeKeyRef = React.useRef(`mp-prod-smoke-${crypto.randomUUID()}`);

  React.useEffect(() => {
    void supabase.auth.getUser().then(({ data }) => {
      if (data.user?.email) setPayerEmail(data.user.email);
    });
  }, []);

  async function createFreshSmokeOrder() {
    if (creatingOrder || loading) return;
    setCreatingOrder(true);
    setError(null);
    setResult(null);
    try {
      setStep("Criando novo Order QA de R$ 1,00 pelos comandos W09…");
      const key = smokeKeyRef.current;
      const { data: newOrderId, error: createError } = await supabase.rpc("create_order", {
        _tenant_id: SMOKE_TENANT_ID,
        _buyer_person_id: SMOKE_BUYER_PERSON_ID,
        _currency: "BRL",
        _operation_id: null,
        _reference_label: "QA MP PROD SMOKE R$1",
        _notes: "Temporary isolated Mercado Pago production smoke test. Do not use as commercial sale.",
        _idempotency_key: `${key}-create`,
      });
      if (createError) throw createError;
      if (!newOrderId) throw new Error("create_order retornou order_id vazio");

      setStep("Adicionando item QA de R$ 1,00…");
      const { error: itemError } = await supabase.rpc("add_order_item", {
        _order_id: newOrderId,
        _sellable_id: SMOKE_SELLABLE_ID,
        _quantity: 1,
        _discount_minor: 0,
        _beneficiary_person_id: null,
      });
      if (itemError && !String(itemError.message).includes("duplicate")) throw itemError;

      setStep("Submetendo Order QA e calculando saldo de R$ 1,00…");
      const { error: submitError } = await supabase.rpc("submit_order", {
        _order_id: newOrderId,
        _idempotency_key: `${key}-submit`,
      });
      if (submitError) throw submitError;

      setStep("Novo Order QA criado. Abrindo runner…");
      window.location.assign(`/payments-sandbox/${newOrderId}`);
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : String(cause);
      setError(message);
      setStep("Falha controlada ao criar Order QA. Não houve cobrança.");
    } finally {
      setCreatingOrder(false);
    }
  }

  async function createProductionPix() {
    if (loading || creatingOrder) return;
    setLoading(true);
    setError(null);
    setResult(null);

    try {
      setStep("Lendo sessão autenticada…");
      const sessionResponse = await withTimeout(supabase.auth.getSession(), 8_000, "session");
      const accessToken = sessionResponse.data.session?.access_token;
      if (!accessToken) throw new Error("Sessão autenticada não encontrada. Faça login novamente neste Preview.");

      setStep("Enviando POST autenticado ao CLEAN BUILD…");
      const controller = new AbortController();
      const timer = window.setTimeout(() => controller.abort(), 20_000);
      let response: Response;
      try {
        response = await fetch(CREATE_CHARGE_URL, {
          method: "POST",
          signal: controller.signal,
          headers: {
            Authorization: `Bearer ${accessToken}`,
            apikey: SMOKE_SUPABASE_PUBLISHABLE_KEY,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            order_id: orderId,
            payer_email: payerEmail,
          }),
        });
      } finally {
        window.clearTimeout(timer);
      }

      setStep(`Resposta HTTP ${response.status}. Lendo retorno…`);
      const payload = (await response.json().catch(() => ({}))) as ChargeResult;
      if (!response.ok) {
        const details = payload.details ? ` · ${JSON.stringify(payload.details)}` : "";
        throw new Error(`${payload.error ?? `HTTP ${response.status}`}${details}`);
      }

      if (payload.environment !== "production") {
        throw new Error(`Bloqueado por segurança: backend respondeu environment=${payload.environment ?? "ausente"}.`);
      }

      setResult(payload);
      setStep("Cobrança criada/reconciliada em PRODUÇÃO. Confira o valor antes de pagar.");
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : String(cause);
      setError(message);
      setStep("Falha controlada. Nenhum novo clique até revisar o erro.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <AppShell activeId="commerce" title="Mercado Pago · Production Smoke">
      <RequireTenant>
        <div className="mx-auto w-full max-w-3xl space-y-6">
          <section className="rounded-xl border border-amber-500/40 bg-card p-5">
            <div className="mb-3 inline-flex rounded-full border border-amber-500/40 px-2.5 py-1 text-xs font-medium text-amber-500">
              TEMPORÁRIO · PRODUÇÃO · R$ 1,00
            </div>
            <h1 className="text-xl font-semibold">PIX real · Mercado Pago</h1>
            <p className="mt-2 text-sm text-muted-foreground">
              Smoke test controlado no COBS OS CLEAN BUILD. O runner usa somente comandos W09 autorizados para criar um
              Order QA isolado e chama a Edge Function de produção com sessão autenticada.
            </p>
            <div className="mt-5 grid gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="smoke-order">Order ID</Label>
                <Input id="smoke-order" value={orderId} readOnly />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="smoke-email">Payer email</Label>
                <Input
                  id="smoke-email"
                  type="email"
                  value={payerEmail}
                  onChange={(event) => setPayerEmail(event.target.value)}
                />
              </div>
              <div className="rounded-md border border-border bg-background/50 p-3 text-xs text-muted-foreground">
                Etapa: {step}
              </div>
              <Button
                type="button"
                variant="outline"
                className="min-h-11"
                disabled={loading || creatingOrder}
                onClick={() => void createFreshSmokeOrder()}
              >
                {creatingOrder ? "Criando novo Order QA de R$ 1,00…" : "Criar NOVO Order QA de R$ 1,00"}
              </Button>
              <Button
                type="button"
                className="min-h-11"
                disabled={loading || creatingOrder || !payerEmail}
                onClick={() => void createProductionPix()}
              >
                {loading ? "Gerando PIX REAL de R$ 1,00…" : "Gerar PIX REAL de R$ 1,00"}
              </Button>
            </div>
            {error ? (
              <div className="mt-4 rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
                {error}
              </div>
            ) : null}
          </section>

          {result ? (
            <section className="rounded-xl border border-border bg-card p-5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 className="font-semibold">Resultado do provider</h2>
                <span className="rounded-full border border-border px-2.5 py-1 text-xs">
                  {result.environment ?? "—"} · {result.status ?? "—"}
                </span>
              </div>
              <dl className="mt-4 grid gap-2 text-sm sm:grid-cols-2">
                <div><dt className="text-muted-foreground">Charge</dt><dd className="break-all">{result.charge_id ?? "—"}</dd></div>
                <div><dt className="text-muted-foreground">Attempt</dt><dd className="break-all">{result.attempt_id ?? "—"}</dd></div>
                <div><dt className="text-muted-foreground">Provider order</dt><dd className="break-all">{result.provider_order_id ?? "—"}</dd></div>
                <div><dt className="text-muted-foreground">Provider payment</dt><dd className="break-all">{result.provider_payment_id ?? "—"}</dd></div>
                <div><dt className="text-muted-foreground">Provider status</dt><dd>{result.provider_status ?? "—"}</dd></div>
                <div><dt className="text-muted-foreground">Status detail</dt><dd>{result.provider_status_detail ?? "—"}</dd></div>
              </dl>

              {result.pix?.qr_code_base64 ? (
                <div className="mt-5">
                  <img
                    src={`data:image/png;base64,${result.pix.qr_code_base64}`}
                    alt="QR Code PIX real de R$ 1,00"
                    className="h-56 w-56 rounded-lg bg-white p-2"
                  />
                </div>
              ) : null}

              {result.pix?.qr_code ? (
                <div className="mt-5 space-y-1.5">
                  <Label htmlFor="pix-copy">PIX copia e cola</Label>
                  <textarea
                    id="pix-copy"
                    readOnly
                    value={result.pix.qr_code}
                    className="min-h-28 w-full rounded-md border border-border bg-background p-3 text-xs"
                  />
                </div>
              ) : null}

              {result.pix?.ticket_url ? (
                <a
                  href={result.pix.ticket_url}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-4 inline-flex text-sm font-medium text-primary underline underline-offset-4"
                >
                  Abrir ticket PIX no Mercado Pago
                </a>
              ) : null}
            </section>
          ) : null}
        </div>
      </RequireTenant>
    </AppShell>
  );
}
