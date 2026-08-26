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
      { title: "Mercado Pago Sandbox E2E — COBS OS" },
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

  React.useEffect(() => {
    void supabase.auth.getUser().then(({ data }) => {
      if (data.user?.email) setPayerEmail(data.user.email);
    });
  }, []);

  async function createSandboxPix() {
    setLoading(true);
    setError(null);
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

  return (
    <AppShell activeId="commerce" title="Mercado Pago Sandbox E2E">
      <RequireTenant>
        <div className="mx-auto w-full max-w-3xl space-y-6">
          <section className="rounded-xl border border-border bg-card p-5">
            <h1 className="text-xl font-semibold">PIX Sandbox · Mercado Pago</h1>
            <p className="mt-2 text-sm text-muted-foreground">
              Rota interna de QA. Cria uma cobrança PIX real no ambiente de teste usando a Edge Function
              ativa do COBS. Não registre pagamentos manualmente nesta tela.
            </p>
            <div className="mt-5 grid gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="sandbox-order">Order ID</Label>
                <Input id="sandbox-order" value={orderId} readOnly />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="sandbox-email">Payer email</Label>
                <Input
                  id="sandbox-email"
                  type="email"
                  value={payerEmail}
                  onChange={(event) => setPayerEmail(event.target.value)}
                />
              </div>
              <Button
                type="button"
                className="min-h-11"
                disabled={loading || !payerEmail}
                onClick={() => void createSandboxPix()}
              >
                {loading ? "Gerando PIX Sandbox…" : "Gerar PIX Mercado Pago (Sandbox)"}
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
                    alt="QR Code PIX Sandbox"
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
