import { FormEvent, useEffect, useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { CheckCircle2, Copy, Loader2, QrCode } from "lucide-react";

import { BrandLockup } from "@/app/shell/brand";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/ciosp-2027")({
  head: () => ({
    meta: [
      { title: "CIOSP 2027 — Reserva QA | BSBTUR" },
      {
        name: "description",
        content: "Checkout público mínimo de QA para a operação CIOSP 2027 da BSBTUR.",
      },
    ],
  }),
  component: CiospCheckout,
});

type PixResult = {
  charge_id?: string;
  attempt_id?: string;
  status: string;
  order_status?: string;
  provider_status?: string | null;
  provider_status_detail?: string | null;
  reconciled?: boolean;
  already_paid?: boolean;
  pix?: {
    qr_code?: string | null;
    qr_code_base64?: string | null;
    ticket_url?: string | null;
  };
};

function CiospCheckout() {
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [orderId, setOrderId] = useState<string | null>(null);
  const [checkoutToken, setCheckoutToken] = useState<string | null>(null);
  const [amountMinor, setAmountMinor] = useState<number | null>(null);
  const [pix, setPix] = useState<PixResult | null>(null);
  const idempotencyKey = useMemo(() => crypto.randomUUID(), []);

  const amountLabel = amountMinor == null
    ? "Valor calculado pelo servidor"
    : new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(amountMinor / 100);

  const paymentConfirmed = pix?.status === "approved" || pix?.order_status === "confirmed" || pix?.already_paid === true;

  useEffect(() => {
    if (!pix || paymentConfirmed || !orderId || !checkoutToken || !email) return;

    let cancelled = false;
    const timer = window.setInterval(async () => {
      try {
        const { data, error: reconcileError } = await supabase.functions.invoke("payments-create-charge", {
          body: {
            order_id: orderId,
            payer_email: email,
            checkout_token: checkoutToken,
          },
        });
        if (cancelled || reconcileError || !data) return;
        const next = data as PixResult;
        if (next.status === "approved" || next.order_status === "confirmed" || next.already_paid === true) {
          setPix((current) => ({
            ...(current ?? {}),
            ...next,
            status: "approved",
            pix: next.pix ?? current?.pix,
          }));
        }
      } catch {
        // Polling is best-effort. The next interval retries without interrupting checkout UX.
      }
    }, 4000);

    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [checkoutToken, email, orderId, paymentConfirmed, pix]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (loading) return;
    setLoading(true);
    setError(null);
    try {
      const { data: checkout, error: checkoutError } = await supabase.functions.invoke("ciosp-public-checkout", {
        body: {
          full_name: fullName,
          email,
          phone,
          idempotency_key: idempotencyKey,
        },
      });
      if (checkoutError) throw checkoutError;
      if (!checkout?.order_id || !checkout?.checkout_token) throw new Error("checkout_response_invalid");
      setOrderId(checkout.order_id);
      setCheckoutToken(checkout.checkout_token);
      setAmountMinor(Number(checkout.grand_total_minor ?? 0));

      const { data: payment, error: paymentError } = await supabase.functions.invoke("payments-create-charge", {
        body: {
          order_id: checkout.order_id,
          payer_email: email,
          checkout_token: checkout.checkout_token,
        },
      });
      if (paymentError) throw paymentError;
      setPix(payment as PixResult);
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : "Não foi possível iniciar o checkout.";
      setError(message);
    } finally {
      setLoading(false);
    }
  }

  async function copyPix() {
    if (pix?.pix?.qr_code) await navigator.clipboard.writeText(pix.pix.qr_code);
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border bg-background/95">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-5 py-5 lg:px-8">
          <BrandLockup />
          <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground">CIOSP 2027 · QA</span>
        </div>
      </header>

      <main className="mx-auto grid max-w-5xl gap-8 px-5 py-10 lg:grid-cols-[1.05fr_0.95fr] lg:px-8 lg:py-16">
        <section>
          <p className="font-mono text-xs uppercase tracking-[0.18em] text-primary">Caravana acadêmica · São Paulo</p>
          <h1 className="mt-4 text-4xl font-semibold leading-tight">CIOSP 2027 com a BSBTUR</h1>
          <p className="mt-4 max-w-xl text-base leading-relaxed text-muted-foreground">
            Reserve sua vaga no fluxo comercial de QA. O valor e a disponibilidade são calculados pelo COBS OS no servidor e a reserva é protegida antes da geração do Pix.
          </p>
          <div className="mt-7 rounded-xl border border-border bg-surface p-5">
            <p className="text-sm text-muted-foreground">Valor do pacote neste ambiente</p>
            <p className="mt-1 text-2xl font-semibold">{amountLabel}</p>
            <p className="mt-2 text-xs text-muted-foreground">Ambiente de teste · nenhum valor de produção é exibido aqui.</p>
          </div>
        </section>

        <section className="rounded-2xl border border-border bg-card p-5 shadow-sm sm:p-6">
          {!pix ? (
            <form onSubmit={submit} className="space-y-4">
              <div>
                <h2 className="text-xl font-semibold">Dados do viajante</h2>
                <p className="mt-1 text-sm text-muted-foreground">Preencha somente o necessário para criar a reserva.</p>
              </div>
              <label className="block space-y-1.5 text-sm font-medium">
                Nome completo
                <Input required minLength={2} maxLength={120} value={fullName} onChange={(e) => setFullName(e.target.value)} autoComplete="name" />
              </label>
              <label className="block space-y-1.5 text-sm font-medium">
                E-mail
                <Input required type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" />
              </label>
              <label className="block space-y-1.5 text-sm font-medium">
                WhatsApp
                <Input required value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="(61) 99999-9999" autoComplete="tel" />
              </label>
              {error && <div className="rounded-lg border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive">{error}</div>}
              <Button type="submit" size="lg" className="w-full" disabled={loading}>
                {loading ? <><Loader2 className="mr-2 size-4 animate-spin" />Preparando Pix...</> : "Reservar e gerar Pix"}
              </Button>
              <p className="text-center text-xs text-muted-foreground">Pedido, preço e reserva são criados no W09. O navegador não define o valor.</p>
            </form>
          ) : paymentConfirmed ? (
            <div className="space-y-5 text-center">
              <span className="mx-auto grid size-14 place-items-center rounded-full bg-success/10 text-success"><CheckCircle2 className="size-7" /></span>
              <div>
                <h2 className="text-2xl font-semibold">Pagamento confirmado</h2>
                <p className="mt-2 text-sm text-muted-foreground">Pedido {orderId?.slice(0, 8)} confirmado pelo COBS OS.</p>
              </div>
              <div className="rounded-lg border border-success/30 bg-success/5 p-4 text-sm text-left">
                O pagamento foi reconciliado com o Mercado Pago. Pedido, reserva e participação são confirmados pelo mesmo fluxo comercial.
              </div>
            </div>
          ) : (
            <div className="space-y-5">
              <div className="flex items-start gap-3">
                <span className="grid size-10 shrink-0 place-items-center rounded-full bg-success/10 text-success"><QrCode className="size-5" /></span>
                <div>
                  <h2 className="text-xl font-semibold">Pix gerado</h2>
                  <p className="mt-1 text-sm text-muted-foreground">Pedido {orderId?.slice(0, 8)} · status {pix.status}</p>
                  <p className="mt-1 text-xs text-muted-foreground">O COBS verifica a aprovação automaticamente.</p>
                </div>
              </div>
              {pix.pix?.qr_code_base64 && (
                <div className="mx-auto max-w-xs rounded-xl border border-border bg-white p-4">
                  <img alt="QR Code Pix" className="w-full" src={`data:image/png;base64,${pix.pix.qr_code_base64}`} />
                </div>
              )}
              {pix.pix?.qr_code && (
                <Button type="button" variant="outline" className="w-full" onClick={copyPix}>
                  <Copy className="mr-2 size-4" />Copiar Pix copia e cola
                </Button>
              )}
              {pix.pix?.ticket_url && (
                <Button asChild className="w-full">
                  <a href={pix.pix.ticket_url} target="_blank" rel="noreferrer">Abrir pagamento no Mercado Pago</a>
                </Button>
              )}
              <div className="flex gap-2 rounded-lg border border-success/30 bg-success/5 p-3 text-sm">
                <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-success" />
                <span>Reserva criada antes da cobrança. Após aprovação, o COBS confirma pedido, reserva e participação automaticamente.</span>
              </div>
            </div>
          )}
        </section>
      </main>
    </div>
  );
}
