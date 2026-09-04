import { FormEvent, useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { ArrowLeft, Copy, Loader2, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/ciosp-2027/reserva")({
  head: () => ({
    meta: [
      { title: "Reserva CIOSP 2027 — BSBTUR" },
      {
        name: "description",
        content: "Checkout público da Caravana CIOSP 2027 da BSBTUR, condicionado à abertura oficial das vendas no COBS.",
      },
      { name: "robots", content: "noindex,nofollow" },
    ],
  }),
  component: CiospReservationPage,
});

type PixState = {
  qr_code?: string | null;
  qr_code_base64?: string | null;
  ticket_url?: string | null;
  amount_minor?: number | null;
  stage?: string | null;
  environment?: string | null;
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

function CiospReservationPage() {
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [consent, setConsent] = useState(false);
  const [loading, setLoading] = useState(false);
  const [closed, setClosed] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pix, setPix] = useState<PixState | null>(null);
  const idempotencyKey = useMemo(() => crypto.randomUUID(), []);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (loading || !consent) return;
    setLoading(true);
    setClosed(false);
    setError(null);
    setPix(null);

    try {
      const { data: checkout, error: checkoutError } = await supabase.functions.invoke("ciosp-public-checkout", {
        body: {
          full_name: fullName,
          email,
          phone,
          idempotency_key: idempotencyKey,
          checkout_key: "commercial",
        },
      });

      if (checkoutError) {
        const code = await edgeErrorCode(checkoutError);
        if (code === "sales_not_open") {
          setClosed(true);
          return;
        }
        throw checkoutError;
      }

      if (!checkout?.order_id || !checkout?.checkout_token || !checkout?.payer_email) {
        throw new Error("checkout_response_invalid");
      }

      const { data: pixData, error: pixError } = await supabase.functions.invoke("ciosp-public-create-pix", {
        body: {
          order_id: checkout.order_id,
          checkout_token: checkout.checkout_token,
          payer_email: checkout.payer_email,
        },
      });

      if (pixError) {
        const code = await edgeErrorCode(pixError);
        if (code === "sales_not_open") {
          setClosed(true);
          return;
        }
        if (code === "mercado_pago_not_configured") {
          setError("A cobrança ainda não está disponível. Nenhum pagamento foi concluído. Entre em contato com a BSBTUR.");
          return;
        }
        throw pixError;
      }

      if (!pixData?.pix?.qr_code && !pixData?.pix?.ticket_url) {
        throw new Error("pix_response_invalid");
      }

      setPix({
        ...pixData.pix,
        amount_minor: pixData.amount_minor ?? null,
        stage: pixData.stage ?? null,
        environment: pixData.environment ?? null,
        order_id: checkout.order_id,
      });
    } catch {
      setError("Não foi possível iniciar a reserva agora. Tente novamente ou fale com a BSBTUR.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="min-h-screen bg-[#070706] px-5 py-10 text-white sm:px-8 sm:py-14">
      <section className="mx-auto max-w-xl">
        <a href="/ciosp-2027" className="inline-flex min-h-11 items-center gap-2 text-sm font-semibold text-[#E4CA91] underline underline-offset-4">
          <ArrowLeft className="size-4" aria-hidden="true" /> Voltar para CIOSP 2027
        </a>

        <div className="mt-8 rounded-3xl border border-white/10 bg-white/[0.03] p-6 shadow-2xl sm:p-8">
          <div className="flex items-start gap-3">
            <ShieldCheck className="mt-1 size-6 shrink-0 text-[#D6B56D]" aria-hidden="true" />
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.2em] text-[#D6B56D]">Reserva oficial</p>
              <h1 className="mt-2 text-3xl font-semibold tracking-tight">Caravana CIOSP 2027</h1>
              <p className="mt-3 text-sm leading-6 text-white/55">
                Este checkout só funciona quando a oferta estiver oficialmente liberada no COBS. O valor aplicável é calculado pela oferta ativa e será mostrado antes do pagamento via Pix.
              </p>
            </div>
          </div>

          {pix ? (
            <div className="mt-8 rounded-2xl border border-emerald-500/25 bg-emerald-500/5 p-5" role="status" aria-live="polite">
              <p className="text-xs font-bold uppercase tracking-[0.18em] text-emerald-300">Pix gerado</p>
              <p className="mt-2 text-3xl font-semibold">
                R$ {((pix.amount_minor ?? 0) / 100).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
              </p>
              <p className="mt-1 text-sm text-white/50">Etapa: {pix.stage === "entry" ? "entrada" : "saldo"}</p>
              {pix.qr_code_base64 && (
                <img className="mx-auto mt-5 w-full max-w-[280px] rounded-2xl bg-white p-3" src={`data:image/png;base64,${pix.qr_code_base64}`} alt="QR Code Pix da reserva CIOSP 2027" />
              )}
              {pix.qr_code && (
                <Button type="button" variant="outline" className="mt-5 w-full border-white/15 bg-black/30" onClick={() => navigator.clipboard.writeText(pix.qr_code ?? "")}>
                  <Copy className="mr-2 size-4" aria-hidden="true" /> Copiar Pix copia e cola
                </Button>
              )}
              {pix.ticket_url && (
                <a className="mt-4 block text-center text-sm font-semibold text-[#E4CA91] underline underline-offset-4" href={pix.ticket_url} target="_blank" rel="noreferrer">
                  Abrir cobrança Pix
                </a>
              )}
              <p className="mt-5 text-xs leading-5 text-white/40">Pedido: {pix.order_id}. A confirmação definitiva depende da conciliação do pagamento pelo COBS.</p>
            </div>
          ) : (
            <form onSubmit={submit} className="mt-8 space-y-4">
              <label className="block space-y-1.5 text-sm">Nome completo<Input required minLength={2} maxLength={120} value={fullName} onChange={(event) => setFullName(event.target.value)} autoComplete="name" className="border-white/15 bg-black/40 text-white" /></label>
              <label className="block space-y-1.5 text-sm">WhatsApp<Input required value={phone} onChange={(event) => setPhone(event.target.value)} autoComplete="tel" placeholder="(61) 99999-9999" className="border-white/15 bg-black/40 text-white" /></label>
              <label className="block space-y-1.5 text-sm">E-mail<Input required type="email" value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="email" className="border-white/15 bg-black/40 text-white" /></label>

              <label className="flex items-start gap-3 rounded-xl border border-white/10 bg-black/30 p-4 text-sm leading-6 text-white/65">
                <input required type="checkbox" checked={consent} onChange={(event) => setConsent(event.target.checked)} className="mt-1 size-4" />
                <span>Confirmo meus dados, autorizo o contato relacionado à Caravana CIOSP 2027 e entendo que, quando as vendas estiverem oficialmente abertas, o envio deste formulário poderá criar pedido, reserva e cobrança Pix.</span>
              </label>

              <p className="text-xs leading-5 text-white/45">
                Consulte o <a href="/privacidade-ciosp-2027" className="font-semibold text-[#E4CA91] underline underline-offset-4">Aviso de Privacidade</a> antes de prosseguir.
              </p>

              {closed && (
                <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 text-sm leading-6 text-amber-200" role="status">
                  As vendas ainda não foram oficialmente abertas. Nenhuma cobrança foi criada por esta tentativa.
                </div>
              )}
              {error && <div className="rounded-xl border border-red-900/50 bg-red-950/20 p-4 text-sm text-red-300" role="alert">{error}</div>}

              <Button type="submit" size="lg" className="w-full bg-[#D6B56D] text-black hover:bg-[#E4CA91]" disabled={loading || !consent}>
                {loading ? <><Loader2 className="mr-2 size-4 animate-spin" aria-hidden="true" /> Preparando reserva...</> : "Gerar reserva e Pix"}
              </Button>
            </form>
          )}
        </div>
      </section>
    </main>
  );
}
