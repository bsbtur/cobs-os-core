import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { ArrowLeft, Copy, Loader2, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import { CIOSP_PUBLIC_SALES_OPEN } from "@/lib/ciosp-public-sales";

const COMMERCIAL_TERMS_VERSION = "ciosp-2027-v2";
const CANCELLATION_POLICY_VERSION = "ciosp-2027-cancellation-v1";
const CHECKOUT_IDEMPOTENCY_SESSION_KEY = "cobs:ciosp-2027:reserva:idempotency-key";

export const Route = createFileRoute("/ciosp-2027_/reserva")({
  head: () => ({
    meta: [
      { title: "Reserva CIOSP 2027 — BSBTUR" },
      { name: "description", content: "Checkout da CIOSP Experience 2027 da BSBTUR." },
      { name: "robots", content: "noindex,nofollow" },
    ],
  }),
  component: CiospReservationPage,
});

type CardFormData = { token?: string; payment_method_id?: string; installments?: number; payer?: { email?: string } };
type MercadoPagoBrickController = { unmount?: () => void };
type MercadoPagoBricks = { create: (brickName: string, containerId: string, configuration: { initialization: { amount: number; payer: { email: string } }; customization: { paymentMethods: { minInstallments: number; maxInstallments: number } }; callbacks: { onReady: () => void; onError: () => void; onSubmit: (formData: CardFormData) => Promise<void> } }) => Promise<MercadoPagoBrickController> };
type MercadoPagoClient = { bricks: () => MercadoPagoBricks };
type MercadoPagoConstructor = new (publicKey: string, options: { locale: string }) => MercadoPagoClient;

declare global { interface Window { MercadoPago?: MercadoPagoConstructor } }

type OrderStatus = { total_minor: number; received_minor: number; balance_minor: number; payment_status: string; order_status: string; next_installment?: { installment_number?: number; installment_count?: number; amount_minor?: number; due_at?: string | null; status?: string } | null; };

function CardBalanceBrick({ amountMinor, payerEmail, checkoutProof, onApproved, qaMode = false }: { amountMinor: number; payerEmail: string; checkoutProof: { order_id: string; checkout_token: string }; onApproved: () => void; qaMode?: boolean }) {
  const mounted = useRef(false);
  const controller = useRef<MercadoPagoBrickController | null>(null);
  const [brickError, setBrickError] = useState<string | null>(null);
  const productionPublicKey: string | undefined = import.meta.env["VITE_MERCADO_PAGO_PUBLIC_KEY"];
  const testPublicKey: string | undefined = import.meta.env["VITE_MERCADO_PAGO_TEST_PUBLIC_KEY"];
  const publicKey = qaMode ? testPublicKey : productionPublicKey;

  useEffect(() => {
    if (!publicKey || mounted.current) return;
    mounted.current = true;
    let cancelled = false;
    const boot = async () => {
      if (!window.MercadoPago) {
        await new Promise<void>((resolve, reject) => {
          const existing = document.querySelector('script[src="https://sdk.mercadopago.com/js/v2"]') as HTMLScriptElement | null;
          if (existing) { existing.addEventListener("load", () => resolve(), { once: true }); existing.addEventListener("error", () => reject(), { once: true }); return; }
          const script = document.createElement("script");
          script.src = "https://sdk.mercadopago.com/js/v2";
          script.onload = () => resolve();
          script.onerror = () => reject();
          document.head.appendChild(script);
        });
      }
      if (cancelled) return;
      if (cancelled || !window.MercadoPago) return;
      const mp = new window.MercadoPago(publicKey, { locale: "pt-BR" });
      const bricks = mp.bricks();
      controller.current = await bricks.create("cardPayment", "ciosp-card-balance-brick", {
        initialization: { amount: amountMinor / 100, payer: { email: payerEmail } },
        customization: { paymentMethods: { minInstallments: 1, maxInstallments: 12 } },
        callbacks: {
          onReady: () => setBrickError(null),
          onError: () => setBrickError("Não foi possível carregar o formulário seguro do cartão."),
          onSubmit: async (formData: CardFormData) => {
            setBrickError(null);
            const { data, error } = await supabase.functions.invoke("ciosp-public-pay-card", {
              body: {
                ...checkoutProof,
                card_token: formData?.token,
                payment_method_id: formData?.payment_method_id,
                installments: formData?.installments,
                payer_email: formData?.payer?.email ?? payerEmail,
              },
            });
            if (error || !data) {
              setBrickError("Não foi possível concluir o pagamento no cartão. Revise os dados e tente novamente.");
              throw error ?? new Error("card_payment_failed");
            }
            if (data.confirmed === true) onApproved();
            else if (data.status === "processing" || data.status === "pending") setBrickError("Pagamento em análise. A vaga será confirmada automaticamente após a aprovação.");
            else setBrickError("Pagamento não aprovado. Nenhum dado completo do cartão foi armazenado pelo COBS.");
          },
        },
      });
    };
    void boot().catch(() => setBrickError("Não foi possível iniciar o formulário seguro do cartão."));
    return () => { cancelled = true; void controller.current?.unmount?.(); controller.current = null; mounted.current = false; };
  }, [amountMinor, checkoutProof, onApproved, payerEmail, publicKey]);

  if (!publicKey) return <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 text-sm text-amber-200">{qaMode ? "QA bloqueado: configure a chave pública TEST do Mercado Pago antes de testar cartão." : "Pagamento por cartão aguardando configuração da chave pública do Mercado Pago."}</div>;
  return <div className="mt-5"><div id="ciosp-card-balance-brick" />{brickError && <p className="mt-3 text-sm text-amber-200">{brickError}</p>}<p className="mt-3 text-xs leading-5 text-white/40">Os dados completos do cartão e o CVV são processados diretamente pelo Mercado Pago e não são armazenados pelo COBS.</p></div>;
}

type PixState = {
  qr_code?: string | null;
  qr_code_base64?: string | null;
  ticket_url?: string | null;
  amount_minor?: number | null;
  installment_number?: number | null;
  installment_count?: number | null;
  due_at?: string | null;
  order_id?: string | null;
};

async function edgeErrorCode(error: unknown) {
  const context = (error as { context?: Response } | null)?.context;
  if (!context) return null;
  try {
    const payload = await context.clone().json();
    return typeof payload?.error === "string" ? payload.error : null;
  } catch {
    return null;
  }
}

function getCheckoutIdempotencyKey() {
  if (typeof window === "undefined") return crypto.randomUUID();

  try {
    const existing = window.sessionStorage.getItem(CHECKOUT_IDEMPOTENCY_SESSION_KEY);
    if (existing && existing.length >= 16 && existing.length <= 120) return existing;

    const created = crypto.randomUUID();
    window.sessionStorage.setItem(CHECKOUT_IDEMPOTENCY_SESSION_KEY, created);
    return created;
  } catch {
    return crypto.randomUUID();
  }
}

function CiospReservationPage() {
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [consent, setConsent] = useState(false);
  const [loading, setLoading] = useState(false);
  const [closed, setClosed] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pix, setPix] = useState<PixState | null>(null);
  const [checkoutProof, setCheckoutProof] = useState<{ order_id: string; checkout_token: string } | null>(null);
  const [orderStatus, setOrderStatus] = useState<OrderStatus | null>(null);
  const [cardApproved, setCardApproved] = useState(false);
  const idempotencyKey = useMemo(getCheckoutIdempotencyKey, []);
  const [salesQaMode, setSalesQaMode] = useState(false);

  useEffect(() => {
    setSalesQaMode(new URLSearchParams(window.location.search).get("sales_qa") === "1");
  }, []);

  useEffect(() => {
    if (!checkoutProof) return;
    let cancelled = false;
    const refresh = async () => {
      const { data, error: statusError } = await supabase.functions.invoke("ciosp-public-order-status", { body: checkoutProof });
      if (!cancelled && !statusError && data?.order_id) setOrderStatus(data as OrderStatus);
    };
    void refresh();
    const timer = window.setInterval(refresh, 5000);
    return () => { cancelled = true; window.clearInterval(timer); };
  }, [checkoutProof]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    // Public sales stay closed by default. Authorized staff may exercise the QA path;
    // the backend still requires x-ciosp-qa plus a valid owner/admin/operations_agent session.
    if (!CIOSP_PUBLIC_SALES_OPEN && !salesQaMode) return;
    if (loading || !consent) return;

    setLoading(true);
    setClosed(false);
    setError(null);
    setPix(null);

    try {
      const { data: checkout, error: checkoutError } = await supabase.functions.invoke(
        "ciosp-public-checkout",
        {
          ...(salesQaMode ? { headers: { "x-ciosp-qa": "1" } } : {}),
          body: {
            full_name: fullName,
            email,
            phone,
            idempotency_key: idempotencyKey,
            checkout_key: "commercial",
            terms_accepted: true,
            commercial_terms_version: COMMERCIAL_TERMS_VERSION,
            cancellation_policy_version: CANCELLATION_POLICY_VERSION,
            ...(salesQaMode ? { qa_resume_existing: true } : {}),
          },
        },
      );

      if (checkoutError) {
        const code = await edgeErrorCode(checkoutError);
        if (code === "sales_not_open") {
          setClosed(true);
          return;
        }
        if (
          code === "terms_acceptance_required" ||
          code === "commercial_terms_version_mismatch" ||
          code === "cancellation_policy_version_mismatch"
        ) {
          setError("Os termos comerciais foram atualizados. Recarregue a página antes de continuar.");
          return;
        }
        throw checkoutError;
      }

      if (!checkout?.order_id || !checkout?.checkout_token || !checkout?.payer_email) {
        throw new Error("checkout_response_invalid");
      }

      const proof = { order_id: checkout.order_id, checkout_token: checkout.checkout_token };
      setCheckoutProof(proof);

      // A repeated/resumed QA checkout rotates the checkout token for the same order.
      // If the entry is already recorded, resume directly at the card balance instead
      // of creating a legacy second Pix installment.
      const { data: resumedStatus, error: resumedStatusError } = await supabase.functions.invoke(
        "ciosp-public-order-status",
        { body: proof },
      );
      if (!resumedStatusError && resumedStatus?.order_id && resumedStatus.received_minor >= 349000 && resumedStatus.balance_minor > 0) {
        setOrderStatus(resumedStatus as OrderStatus);
        setPix({
          amount_minor: 349000,
          installment_number: 1,
          installment_count: 1,
          order_id: checkout.order_id,
        });
        return;
      }

      const { data: hostedData, error: hostedError } = await supabase.functions.invoke(
        "ciosp-public-create-preference",
        {
          body: {
            order_id: checkout.order_id,
            checkout_token: checkout.checkout_token,
            payer_email: checkout.payer_email,
          },
        },
      );

      if (hostedError) {
        const code = await edgeErrorCode(hostedError);
        if (code === "sales_not_open") {
          setClosed(true);
          return;
        }
        if (code === "mercado_pago_not_configured" || code === "mercado_pago_test_not_configured") {
          setError("O checkout ainda não está disponível. Nenhum pagamento foi concluído.");
          return;
        }
        throw hostedError;
      }

      if (!hostedData?.checkout_url) throw new Error("checkout_pro_response_invalid");
      window.location.assign(hostedData.checkout_url);
    } catch {
      setError("Não foi possível iniciar a reserva agora. Tente novamente ou fale com a BSBTUR.");
    } finally {
      setLoading(false);
    }
  }

  // Frontend lock (default CLOSED): public visitors still see the closed-sales screen.
  // ?sales_qa=1 only exposes the QA form; the backend remains the sovereign authorization gate.
  if (!CIOSP_PUBLIC_SALES_OPEN && !salesQaMode) {
    return (
      <main className="min-h-screen bg-[#070706] px-5 py-10 text-white sm:px-8 sm:py-14">
        <section className="mx-auto max-w-xl">
          <a
            href="/ciosp-2027"
            className="inline-flex min-h-11 items-center gap-2 text-sm font-semibold text-[#E4CA91] underline underline-offset-4"
          >
            <ArrowLeft className="size-4" />
            Voltar para CIOSP 2027
          </a>
          <div
            className="mt-8 rounded-3xl border border-white/10 bg-white/[0.03] p-6 shadow-2xl sm:p-8"
            role="status"
          >
            <p className="text-xs font-bold uppercase tracking-[0.2em] text-[#D6B56D]">
              Reservas em preparação
            </p>
            <h1 className="mt-2 text-3xl font-semibold tracking-tight">
              A contratação ainda não está aberta
            </h1>
            <p className="mt-3 text-sm leading-6 text-white/55">
              A condição comercial da CIOSP Experience 2027 está aprovada (R$ 12.490 por passageiro
              em acomodação dupla), mas as reservas ainda não foram liberadas. Nenhuma cobrança ou
              Pix pode ser gerado neste momento.
            </p>
            <a
              href="/ciosp-2027#reserva"
              className="mt-6 flex min-h-12 w-full items-center justify-center rounded-full bg-[#D6B56D] px-6 py-3 font-semibold text-black hover:bg-[#E4CA91]"
            >
              Entrar na lista prioritária
            </a>
          </div>
        </section>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[#070706] px-5 py-10 text-white sm:px-8 sm:py-14">
      <section className="mx-auto max-w-xl">
        <a
          href="/ciosp-2027"
          className="inline-flex min-h-11 items-center gap-2 text-sm font-semibold text-[#E4CA91] underline underline-offset-4"
        >
          <ArrowLeft className="size-4" />
          Voltar para CIOSP 2027
        </a>

        <div className="mt-8 rounded-3xl border border-white/10 bg-white/[0.03] p-6 shadow-2xl sm:p-8">
          <div className="flex items-start gap-3">
            <ShieldCheck className="mt-1 size-6 shrink-0 text-[#D6B56D]" />
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.2em] text-[#D6B56D]">{salesQaMode ? "QA interno · vendas fechadas" : "Reserva oficial"}</p>
              <h1 className="mt-2 text-3xl font-semibold tracking-tight">CIOSP Experience 2027</h1>
              <p className="mt-3 text-sm leading-6 text-white/55">
                Valor aprovado: R$ 12.490 por passageiro em acomodação dupla. Entrada de R$ 3.490 via Pix e saldo de R$ 9.000 no cartão, com parcelamento disponível no ambiente seguro do Mercado Pago.
              </p>
            </div>
          </div>

          {pix ? (
            <div className="mt-8 rounded-2xl border border-emerald-500/25 bg-emerald-500/5 p-5" role="status">
              <p className="text-xs font-bold uppercase tracking-[0.18em] text-emerald-300">Pix gerado</p>
              <p className="mt-2 text-3xl font-semibold">
                R$ {((pix.amount_minor ?? 0) / 100).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
              </p>
              <p className="mt-1 text-sm text-white/50">
                Cobrança de entrada {pix.installment_number ?? "—"}/{pix.installment_count ?? 1}
                {pix.due_at ? ` · vencimento ${new Date(pix.due_at).toLocaleDateString("pt-BR")}` : ""}
              </p>
              {pix.qr_code_base64 && (
                <img
                  className="mx-auto mt-5 w-full max-w-[280px] rounded-2xl bg-white p-3"
                  src={`data:image/png;base64,${pix.qr_code_base64}`}
                  alt="QR Code Pix da reserva CIOSP 2027"
                />
              )}
              {pix.qr_code && (
                <Button
                  type="button"
                  variant="outline"
                  className="mt-5 w-full border-white/15 bg-black/30"
                  onClick={() => navigator.clipboard.writeText(pix.qr_code ?? "")}
                >
                  <Copy className="mr-2 size-4" />
                  Copiar Pix copia e cola
                </Button>
              )}
              {pix.ticket_url && (
                <a
                  className="mt-4 block text-center text-sm font-semibold text-[#E4CA91] underline underline-offset-4"
                  href={pix.ticket_url}
                  target="_blank"
                  rel="noreferrer"
                >
                  Abrir cobrança Pix
                </a>
              )}
              {orderStatus && (
                <div className="mt-5 rounded-xl border border-white/10 bg-black/25 p-4 text-sm text-white/65">
                  <p><strong className="text-white">Total:</strong> R$ {(orderStatus.total_minor / 100).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</p>
                  <p className="mt-1"><strong className="text-white">Pago confirmado:</strong> R$ {(orderStatus.received_minor / 100).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</p>
                  <p className="mt-1"><strong className="text-white">Saldo:</strong> R$ {(orderStatus.balance_minor / 100).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</p>
                  {orderStatus.received_minor >= 349000 && orderStatus.balance_minor > 0 && <p className="mt-3 text-emerald-300">Entrada confirmada. Agora finalize o saldo no cartão para confirmar sua vaga.</p>}
                  {(cardApproved || orderStatus.balance_minor === 0) && <p className="mt-3 font-semibold text-emerald-300">Pagamento completo. Vaga confirmada.</p>}
                </div>
              )}
              {orderStatus && orderStatus.received_minor >= 349000 && orderStatus.balance_minor > 0 && checkoutProof && (
                <div className="mt-5 rounded-2xl border border-[#D6B56D]/25 bg-[#D6B56D]/5 p-5">
                  <p className="text-xs font-bold uppercase tracking-[0.18em] text-[#D6B56D]">Etapa 2 de 2</p>
                  <h2 className="mt-2 text-xl font-semibold">Parcele o saldo de R$ {(orderStatus.balance_minor / 100).toLocaleString("pt-BR", { minimumFractionDigits: 2 })} no cartão</h2>
                  <p className="mt-2 text-sm leading-6 text-white/55">A vaga é confirmada somente depois da aprovação deste pagamento.</p>
                  <CardBalanceBrick amountMinor={orderStatus.balance_minor} payerEmail={email} checkoutProof={checkoutProof} onApproved={() => setCardApproved(true)} qaMode={salesQaMode} />
                </div>
              )}
              <p className="mt-5 text-xs leading-5 text-white/40">
                Pedido: {pix.order_id}. Esta tela atualiza automaticamente após a conciliação do pagamento pelo COBS.
              </p>
            </div>
          ) : (
            <form onSubmit={submit} className="mt-8 space-y-4">
              <label className="block space-y-1.5 text-sm">
                Nome completo
                <Input
                  required
                  minLength={2}
                  maxLength={120}
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  autoComplete="name"
                  className="border-white/15 bg-black/40 text-white"
                />
              </label>
              <label className="block space-y-1.5 text-sm">
                WhatsApp
                <Input
                  required
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  autoComplete="tel"
                  placeholder="(61) 99999-9999"
                  className="border-white/15 bg-black/40 text-white"
                />
              </label>
              <label className="block space-y-1.5 text-sm">
                E-mail
                <Input
                  required
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  autoComplete="email"
                  className="border-white/15 bg-black/40 text-white"
                />
              </label>
              <label className="flex items-start gap-3 rounded-xl border border-white/10 bg-black/30 p-4 text-sm leading-6 text-white/65">
                <input
                  required
                  type="checkbox"
                  checked={consent}
                  onChange={(e) => setConsent(e.target.checked)}
                  className="mt-1 size-4"
                />
                <span>
                  Li e aceito os{" "}
                  <a
                    href="/termos-ciosp-2027"
                    target="_blank"
                    rel="noreferrer"
                    className="font-semibold text-[#E4CA91] underline underline-offset-4"
                  >
                    Termos Comerciais e Política de Cancelamento
                  </a>{" "}
                  da CIOSP Experience 2027 e autorizo o uso dos meus dados para esta contratação.
                </span>
              </label>
              <p className="text-xs leading-5 text-white/45">
                Consulte também o{" "}
                <a
                  href="/privacidade-ciosp-2027"
                  className="font-semibold text-[#E4CA91] underline underline-offset-4"
                >
                  Aviso de Privacidade
                </a>
                .
              </p>
              {closed && (
                <div
                  className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 text-sm leading-6 text-amber-200"
                  role="status"
                >
                  As vendas ainda estão em validação final. Nenhuma cobrança foi criada por esta tentativa.
                </div>
              )}
              {error && (
                <div className="rounded-xl border border-red-900/50 bg-red-950/20 p-4 text-sm text-red-300" role="alert">
                  {error}
                </div>
              )}
              <Button
                type="submit"
                size="lg"
                className="w-full bg-[#D6B56D] text-black hover:bg-[#E4CA91]"
                disabled={loading || !consent}
              >
                {loading ? (
                  <>
                    <Loader2 className="mr-2 size-4 animate-spin" />
                    Preparando reserva...
                  </>
                ) : (
                  "Continuar para pagamento"
                )}
              </Button>
            </form>
          )}
        </div>
      </section>
    </main>
  );
}
