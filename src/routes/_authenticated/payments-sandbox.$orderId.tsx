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
      { title: "Pagamento PIX — COBS OS" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: MercadoPagoSandboxE2E,
});

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
};

function MercadoPagoSandboxE2E() {
  const { orderId } = Route.useParams();
  const [payerEmail, setPayerEmail] = React.useState("");
  const [result, setResult] = React.useState<ChargeResult | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(false);
  const [copied, setCopied] = React.useState(false);

  React.useEffect(() => {
    void supabase.auth.getUser().then(({ data }) => {
      if (data.user?.email) setPayerEmail(data.user.email);
    });
  }, []);

  async function createSandboxPix() {
    setLoading(true);
    setError(null);
    setCopied(false);
    try {
      const { data, error: invokeError } = await supabase.functions.invoke("payments-create-charge", {
        body: {
          order_id: orderId,
          payer_email: payerEmail,
        },
      });
      if (invokeError) throw invokeError;
      setResult((data ?? null) as ChargeResult | null);
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : String(cause);
      setError(message);
    } finally {
      setLoading(false);
    }
  }

  async function copyPixCode() {
    if (!result?.pix?.qr_code) return;
    await navigator.clipboard.writeText(result.pix.qr_code);
    setCopied(true);
  }

  return (
    <AppShell activeId="commerce" title="Pagamento PIX">
      <RequireTenant>
        <div className="mx-auto w-full max-w-3xl space-y-6">
          <section className="overflow-hidden rounded-2xl border border-border bg-card">
            <div className="border-b border-border bg-primary/5 p-6 sm:p-8">
              <p className="text-sm font-medium uppercase tracking-[0.18em] text-primary">BSBTUR · COBS OS</p>
              <h1 className="mt-3 text-2xl font-semibold tracking-tight sm:text-3xl">
                Bem-vindo à melhor viagem da sua vida ✨
              </h1>
              <p className="mt-3 max-w-2xl text-sm leading-6 text-muted-foreground sm:text-base">
                Sua experiência começa aqui. Conclua o pagamento com PIX e deixe o restante com a gente.
                A confirmação é feita automaticamente, com segurança, pelo Mercado Pago.
              </p>
            </div>

            <div className="p-6 sm:p-8">
              <div className="rounded-xl border border-border bg-background p-4">
                <p className="font-medium">Pagamento seguro via PIX</p>
                <p className="mt-1 text-sm leading-6 text-muted-foreground">
                  Gere o QR Code, pague pelo aplicativo do seu banco e pronto. Não é necessário enviar
                  comprovante: o COBS reconhece a confirmação automaticamente.
                </p>
              </div>

              <div className="mt-6 grid gap-4">
                <div className="space-y-1.5">
                  <Label htmlFor="payment-email">E-mail do pagador</Label>
                  <Input
                    id="payment-email"
                    type="email"
                    value={payerEmail}
                    onChange={(event) => setPayerEmail(event.target.value)}
                    placeholder="seuemail@exemplo.com"
                  />
                  <p className="text-xs text-muted-foreground">
                    Usado somente para identificar esta cobrança junto ao provedor de pagamento.
                  </p>
                </div>

                <Button
                  type="button"
                  className="min-h-12 text-base"
                  disabled={loading || !payerEmail}
                  onClick={() => void createSandboxPix()}
                >
                  {loading ? "Gerando seu PIX…" : "Gerar QR Code PIX"}
                </Button>
              </div>

              {error ? (
                <div className="mt-4 rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
                  Não foi possível gerar o PIX agora. Tente novamente em instantes.
                </div>
              ) : null}
            </div>
          </section>

          {result ? (
            <section className="rounded-2xl border border-border bg-card p-6 sm:p-8">
              <div>
                <p className="text-sm font-medium text-primary">PIX gerado com sucesso</p>
                <h2 className="mt-1 text-xl font-semibold">Agora é só concluir o pagamento</h2>
                <p className="mt-2 text-sm leading-6 text-muted-foreground">
                  Abra o aplicativo do seu banco, escaneie o QR Code ou use o código PIX Copia e Cola.
                  Após o pagamento, a confirmação será registrada automaticamente no seu pedido.
                </p>
              </div>

              {result.pix?.qr_code_base64 ? (
                <div className="mt-6 flex justify-center sm:justify-start">
                  <img
                    src={`data:image/png;base64,${result.pix.qr_code_base64}`}
                    alt="QR Code para pagamento PIX"
                    className="h-64 w-64 rounded-xl border border-border bg-white p-3"
                  />
                </div>
              ) : null}

              {result.pix?.qr_code ? (
                <div className="mt-6 space-y-3">
                  <Label htmlFor="pix-copy">PIX Copia e Cola</Label>
                  <textarea
                    id="pix-copy"
                    readOnly
                    value={result.pix.qr_code}
                    className="min-h-28 w-full rounded-md border border-border bg-background p-3 text-xs"
                  />
                  <Button type="button" variant="outline" className="min-h-11" onClick={() => void copyPixCode()}>
                    {copied ? "Código PIX copiado ✓" : "Copiar código PIX"}
                  </Button>
                </div>
              ) : null}

              {result.pix?.ticket_url ? (
                <a
                  href={result.pix.ticket_url}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-5 inline-flex text-sm font-medium text-primary underline underline-offset-4"
                >
                  Abrir pagamento no Mercado Pago
                </a>
              ) : null}

              <div className="mt-6 rounded-xl border border-border bg-muted/30 p-4 text-sm leading-6 text-muted-foreground">
                Seu pagamento é identificado de forma única pelo COBS. Reprocessamentos ou notificações
                repetidas do provedor não criam cobranças financeiras duplicadas.
              </div>
            </section>
          ) : null}
        </div>
      </RequireTenant>
    </AppShell>
  );
}
