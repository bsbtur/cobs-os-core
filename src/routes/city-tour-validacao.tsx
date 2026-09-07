import { FormEvent, useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import {
  ArrowRight,
  BadgeCheck,
  CheckCircle2,
  Copy,
  Landmark,
  Loader2,
  MapPinned,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  Users,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/city-tour-validacao")({
  head: () => ({
    meta: [
      { title: "City Tour Brasília — Validação R$ 1 | BSBTUR" },
      {
        name: "description",
        content:
          "Página de validação do Golden Path BSBTUR: City Tour Brasília por R$ 1,00 em ambiente TEST, sem cobrança de produção.",
      },
      { property: "og:title", content: "City Tour Brasília — Validação R$ 1 | BSBTUR" },
      {
        property: "og:description",
        content: "Uma experiência curta em Brasília usada para validar o fluxo completo do COBS em ambiente TEST.",
      },
    ],
  }),
  component: CityTourValidationLanding,
});

const gold = "#D6B56D";

const inclusions = [
  [Landmark, "Brasília monumental", "Uma experiência curta para representar um produto turístico real."],
  [MapPinned, "Operação City Tour QA", "Produto conectado à operação de validação já cadastrada no STAGING."],
  [ShieldCheck, "Ambiente TEST", "O checkout usa exclusivamente o caminho Mercado Pago TEST."],
  [BadgeCheck, "Golden Path", "Base para validar pedido, reserva, pagamento TEST, viajante e contrato."],
] as const;

type PixState = {
  order_id?: string;
  amount_minor?: number;
  status?: string;
  environment?: string;
  checkout_token?: string;
  confirmation?: unknown;
  pix?: {
    qr_code?: string | null;
    qr_code_base64?: string | null;
    ticket_url?: string | null;
  };
};

type OrderStatus = {
  order_id?: string;
  order_status?: string;
  payment_status?: string;
  payment_environment?: string;
  received_minor?: number;
  balance_minor?: number;
  participation_ready?: boolean;
  session_state?: string;
};

function Brand() {
  return (
    <div className="flex items-center gap-3">
      <span
        className="grid size-10 place-items-center rounded-full border text-sm font-bold"
        style={{ borderColor: gold, color: gold }}
      >
        B
      </span>
      <span>
        <span className="block text-base font-semibold tracking-[0.18em] text-white">BSBTUR</span>
        <span className="block text-[9px] uppercase tracking-[0.28em] text-white/45">
          Turismo & Experiências
        </span>
      </span>
    </div>
  );
}

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

function CityTourValidationLanding() {
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [loading, setLoading] = useState(false);
  const [statusLoading, setStatusLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pix, setPix] = useState<PixState | null>(null);
  const [orderStatus, setOrderStatus] = useState<OrderStatus | null>(null);
  const idempotencyKey = useMemo(() => crypto.randomUUID(), []);

  async function loadOrderStatus(orderId: string, checkoutToken: string) {
    setStatusLoading(true);
    try {
      const { data, error: statusError } = await supabase.functions.invoke(
        "citytour-test-order-status",
        { body: { order_id: orderId, checkout_token: checkoutToken } },
      );
      if (statusError) throw statusError;
      if (data?.payment_environment !== "test") throw new Error("status_environment_invalid");
      setOrderStatus(data as OrderStatus);
    } catch {
      setError("Não foi possível atualizar o status TEST agora. Tente novamente.");
    } finally {
      setStatusLoading(false);
    }
  }

  async function submitCheckout(event: FormEvent) {
    event.preventDefault();
    if (loading || !termsAccepted) return;
    setLoading(true);
    setError(null);
    setPix(null);
    setOrderStatus(null);

    try {
      const { data: checkout, error: checkoutError } = await supabase.functions.invoke(
        "citytour-test-checkout",
        {
          body: {
            full_name: fullName,
            email,
            phone,
            idempotency_key: idempotencyKey,
            qa_terms_accepted: true,
          },
        },
      );
      if (checkoutError) {
        const code = await edgeErrorCode(checkoutError);
        if (code === "qa_capacity_reached") {
          setError("As duas vagas do primeiro ciclo de validação já foram utilizadas.");
          return;
        }
        throw checkoutError;
      }
      if (!checkout?.order_id || !checkout?.checkout_token || checkout?.environment !== "test") {
        throw new Error("checkout_response_invalid");
      }

      const { data: pixData, error: pixError } = await supabase.functions.invoke(
        "citytour-test-create-pix",
        {
          body: { order_id: checkout.order_id, checkout_token: checkout.checkout_token },
        },
      );
      if (pixError) throw pixError;
      if (pixData?.environment !== "test") throw new Error("pix_environment_invalid");
      if (!pixData?.pix?.qr_code && !pixData?.pix?.ticket_url && pixData?.status !== "approved") {
        throw new Error("pix_response_invalid");
      }

      setPix({ ...(pixData as PixState), checkout_token: checkout.checkout_token });
      await loadOrderStatus(checkout.order_id, checkout.checkout_token);
    } catch {
      setError(
        "Não foi possível concluir o checkout TEST agora. Nenhuma cobrança de produção foi iniciada.",
      );
    } finally {
      setLoading(false);
    }
  }

  const paid = orderStatus?.payment_status === "paid";
  const confirmed = orderStatus?.order_status === "confirmed";

  return (
    <div className="min-h-screen bg-[#070707] text-white">
      <header className="sticky top-0 z-30 border-b border-white/10 bg-black/80 backdrop-blur-xl">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-5 py-4">
          <Brand />
          <div className="rounded-full border border-amber-400/25 bg-amber-400/10 px-3 py-1.5 text-[10px] font-bold uppercase tracking-[0.2em] text-amber-200">
            QA · TEST
          </div>
        </div>
      </header>

      <main>
        <section className="relative overflow-hidden border-b border-white/10">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_25%_15%,rgba(214,181,109,.16),transparent_38%),radial-gradient(circle_at_90%_30%,rgba(255,255,255,.06),transparent_30%)]" />
          <div className="relative mx-auto grid max-w-6xl gap-12 px-5 py-20 lg:grid-cols-[1.25fr_.75fr] lg:py-28">
            <div>
              <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[.04] px-4 py-2 text-xs uppercase tracking-[.2em] text-white/60">
                <Sparkles className="size-4" style={{ color: gold }} /> Golden Path COBS
              </div>
              <h1 className="mt-7 max-w-4xl text-5xl font-semibold leading-[1.02] tracking-[-.04em] md:text-7xl">
                Viva um City Tour em Brasília e ajude a validar a experiência digital da BSBTUR.
              </h1>
              <p className="mt-6 max-w-2xl text-lg leading-8 text-white/55">
                Oferta controlada de QA por <strong className="text-white">R$ 1,00 por viajante</strong>. O objetivo é validar pedido, reserva, Pix TEST, financeiro, acesso do viajante e contrato sem tocar em Mercado Pago production.
              </p>
              <div className="mt-8 flex flex-wrap gap-3">
                <a href="#validacao">
                  <Button className="h-12 rounded-full px-6 text-black" style={{ backgroundColor: gold }}>
                    Comprar por R$ 1,00 <ArrowRight className="ml-2 size-4" />
                  </Button>
                </a>
                <span className="inline-flex h-12 items-center rounded-full border border-white/10 px-5 text-sm text-white/55">
                  Produto TEST · 2 vagas de validação
                </span>
              </div>
            </div>

            <aside className="rounded-[2rem] border border-white/10 bg-white/[.04] p-7 shadow-2xl shadow-black/30">
              <p className="text-xs font-semibold uppercase tracking-[.22em]" style={{ color: gold }}>
                Oferta de validação
              </p>
              <p className="mt-4 text-5xl font-semibold">R$ 1,00</p>
              <p className="mt-1 text-sm text-white/45">por viajante · somente TEST</p>
              <div className="mt-7 space-y-3 text-sm text-white/65">
                {["Produto turístico real de QA", "Até 2 viajantes no primeiro ciclo", "Pedido + reserva + Pix TEST", "Sem credencial Mercado Pago production"].map((item) => (
                  <div key={item} className="flex items-start gap-3">
                    <CheckCircle2 className="mt-0.5 size-4 shrink-0" style={{ color: gold }} />
                    <span>{item}</span>
                  </div>
                ))}
              </div>
            </aside>
          </div>
        </section>

        <section className="mx-auto max-w-6xl px-5 py-20">
          <div className="max-w-2xl">
            <p className="text-xs font-semibold uppercase tracking-[.22em]" style={{ color: gold }}>
              O que estamos validando
            </p>
            <h2 className="mt-3 text-3xl font-semibold tracking-[-.03em] md:text-5xl">
              Uma venda pequena para testar uma operação grande.
            </h2>
          </div>
          <div className="mt-10 grid gap-4 md:grid-cols-2">
            {inclusions.map(([Icon, title, description]) => (
              <article key={title} className="rounded-3xl border border-white/10 bg-white/[.03] p-6">
                <Icon className="size-6" style={{ color: gold }} />
                <h3 className="mt-5 text-xl font-semibold">{title}</h3>
                <p className="mt-2 leading-7 text-white/50">{description}</p>
              </article>
            ))}
          </div>
        </section>

        <section id="validacao" className="border-y border-white/10 bg-white/[.025]">
          <div className="mx-auto grid max-w-6xl gap-10 px-5 py-20 lg:grid-cols-[.85fr_1.15fr]">
            <div>
              <Users className="size-8" style={{ color: gold }} />
              <h2 className="mt-5 text-4xl font-semibold tracking-[-.03em]">Primeiro ciclo: dois viajantes.</h2>
              <p className="mt-4 leading-7 text-white/50">
                Cada envio cria um pedido QA de R$ 1,00 e uma reserva no STAGING. O Pix usa somente a credencial de teste. O aceite abaixo é exclusivamente para a validação técnica e não representa revisão jurídica ou contrato real.
              </p>
            </div>

            <div className="rounded-[2rem] border border-white/10 bg-black/40 p-6 md:p-8">
              {pix ? (
                <div role="status" aria-live="polite" className="py-3 text-center">
                  <CheckCircle2 className="mx-auto size-10" style={{ color: gold }} />
                  <p className="mt-4 text-xs font-semibold uppercase tracking-[.2em] text-emerald-300">
                    {confirmed ? "Pedido TEST confirmado" : paid ? "Pagamento TEST recebido" : "Checkout TEST criado"}
                  </p>
                  <h3 className="mt-2 text-3xl font-semibold">
                    R$ {((pix.amount_minor ?? 100) / 100).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                  </h3>
                  <p className="mt-2 text-sm text-white/45">
                    Pedido {pix.order_id} · ambiente {pix.environment}
                  </p>

                  {orderStatus && (
                    <div className="mt-5 grid gap-2 rounded-2xl border border-white/10 bg-white/[.03] p-4 text-left text-sm text-white/60">
                      <p>Pagamento: <strong className="text-white">{orderStatus.payment_status}</strong></p>
                      <p>Pedido: <strong className="text-white">{orderStatus.order_status}</strong></p>
                      <p>Participação: <strong className="text-white">{orderStatus.participation_ready ? "confirmada" : "aguardando confirmação"}</strong></p>
                      <p>Saldo TEST: <strong className="text-white">R$ {((orderStatus.balance_minor ?? 0) / 100).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</strong></p>
                    </div>
                  )}

                  {pix.pix?.qr_code_base64 && !paid && (
                    <img
                      className="mx-auto mt-5 w-full max-w-[260px] rounded-xl bg-white p-3"
                      src={`data:image/png;base64,${pix.pix.qr_code_base64}`}
                      alt="QR Code Pix TEST"
                    />
                  )}
                  {pix.pix?.qr_code && !paid && (
                    <Button
                      type="button"
                      variant="outline"
                      className="mt-5 w-full border-white/15 bg-black/40"
                      onClick={() => navigator.clipboard.writeText(pix.pix?.qr_code ?? "")}
                    >
                      <Copy className="mr-2 size-4" /> Copiar Pix TEST
                    </Button>
                  )}
                  {pix.pix?.ticket_url && !paid && (
                    <a
                      href={pix.pix.ticket_url}
                      target="_blank"
                      rel="noreferrer"
                      className="mt-4 inline-block text-sm underline"
                      style={{ color: gold }}
                    >
                      Abrir página TEST do pagamento
                    </a>
                  )}

                  {pix.order_id && pix.checkout_token && (
                    <Button
                      type="button"
                      variant="outline"
                      disabled={statusLoading}
                      className="mt-5 w-full border-white/15 bg-black/40"
                      onClick={() => loadOrderStatus(pix.order_id!, pix.checkout_token!)}
                    >
                      {statusLoading ? (
                        <Loader2 className="mr-2 size-4 animate-spin" />
                      ) : (
                        <RefreshCw className="mr-2 size-4" />
                      )}
                      Atualizar status TEST
                    </Button>
                  )}

                  <p className="mt-5 text-xs leading-5 text-white/35">
                    Nenhuma credencial ou cobrança de produção é usada neste fluxo.
                  </p>
                </div>
              ) : (
                <form onSubmit={submitCheckout} className="space-y-4">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[.2em]" style={{ color: gold }}>
                      Comprar por R$ 1,00
                    </p>
                    <h3 className="mt-2 text-2xl font-semibold">Dados do viajante</h3>
                  </div>
                  <label className="block space-y-1.5 text-sm text-white/65">
                    Nome completo
                    <Input required minLength={2} maxLength={120} value={fullName} onChange={(event) => setFullName(event.target.value)} autoComplete="name" className="border-white/15 bg-black/50 text-white" />
                  </label>
                  <label className="block space-y-1.5 text-sm text-white/65">
                    E-mail
                    <Input required type="email" value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="email" className="border-white/15 bg-black/50 text-white" />
                  </label>
                  <label className="block space-y-1.5 text-sm text-white/65">
                    WhatsApp
                    <Input value={phone} onChange={(event) => setPhone(event.target.value)} autoComplete="tel" placeholder="(61) 99999-9999" className="border-white/15 bg-black/50 text-white" />
                  </label>
                  <label className="flex items-start gap-3 rounded-xl border border-white/10 bg-white/[.025] p-4 text-sm text-white/55">
                    <input required type="checkbox" checked={termsAccepted} onChange={(event) => setTermsAccepted(event.target.checked)} className="mt-1 size-4" />
                    <span>
                      Confirmo que esta compra de R$ 1,00 é uma validação técnica em ambiente TEST e não representa um contrato juridicamente revisado.
                    </span>
                  </label>
                  {error && (
                    <div role="alert" className="rounded-xl border border-red-900/50 bg-red-950/20 p-4 text-sm text-red-300">
                      {error}
                    </div>
                  )}
                  <Button disabled={loading || !termsAccepted} type="submit" className="h-12 w-full rounded-full text-black" style={{ backgroundColor: gold }}>
                    {loading ? (
                      <><Loader2 className="mr-2 size-4 animate-spin" /> Criando Pix TEST...</>
                    ) : (
                      <>Continuar com Pix TEST <ArrowRight className="ml-2 size-4" /></>
                    )}
                  </Button>
                  <p className="text-center text-xs leading-5 text-white/35">
                    STAGING · TEST · valor fixo R$ 1,00 · máximo 2 pedidos ativos.
                  </p>
                </form>
              )}
            </div>
          </div>
        </section>
      </main>

      <footer className="mx-auto flex max-w-6xl flex-col gap-4 px-5 py-8 text-xs text-white/35 md:flex-row md:items-center md:justify-between">
        <Brand />
        <p>BSBTUR · City Tour Brasília · Golden Path QA</p>
      </footer>
    </div>
  );
}
