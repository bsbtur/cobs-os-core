import * as React from "react";
import { createFileRoute } from "@tanstack/react-router";

import { AppShell } from "@/app/shell/app-shell";
import { RequireTenant } from "@/app/shell/require-tenant";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";

const QA_CHARGE_ID = "cc742926-612a-480c-8dc1-7ec7816abb59";
const QA_ORDER_ID = "9f590714-63eb-4947-888b-1a09ed52cb19";
const QA_PAYER_EMAIL = "contato.bsbtur@gmail.com";

export const Route = createFileRoute("/_authenticated/commerce/payment-qa")({
  head: () => ({
    meta: [
      { title: "CIOSP 2027 Payment QA — COBS OS" },
      { name: "robots", content: "noindex,nofollow" },
    ],
  }),
  component: PaymentQaPage,
});

function PaymentQaPage() {
  const [running, setRunning] = React.useState(false);
  const [result, setResult] = React.useState<unknown>(null);
  const [error, setError] = React.useState<string | null>(null);

  async function runPaymentQa() {
    setRunning(true);
    setResult(null);
    setError(null);

    try {
      const { data, error: invokeError } = await supabase.functions.invoke("payments-create-charge", {
        body: {
          charge_id: QA_CHARGE_ID,
          payer_email: QA_PAYER_EMAIL,
        },
      });

      if (invokeError) throw invokeError;
      setResult(data);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Falha desconhecida ao iniciar o Pix QA");
    } finally {
      setRunning(false);
    }
  }

  return (
    <AppShell activeId="commerce" title="CIOSP 2027 · Payment QA">
      <RequireTenant>
        <div className="mx-auto max-w-2xl space-y-6 p-4 sm:p-6">
          <section className="rounded-xl border border-border bg-card p-5">
            <h1 className="text-xl font-semibold">P0 · Entrada CIOSP 2027 · Mercado Pago Pix QA</h1>
            <p className="mt-2 text-sm text-muted-foreground">
              Runner temporário e autenticado da branch comercial. Executa somente a cobrança de entrada vinculada ao pedido comercial de QA no STAGING.
            </p>
            <dl className="mt-4 grid gap-2 text-sm">
              <div><dt className="font-medium">Pedido comercial QA</dt><dd className="break-all text-muted-foreground">{QA_ORDER_ID}</dd></div>
              <div><dt className="font-medium">Cobrança de entrada</dt><dd className="break-all text-muted-foreground">{QA_CHARGE_ID}</dd></div>
              <div><dt className="font-medium">Valor esperado</dt><dd className="text-muted-foreground">R$ 2.490,00</dd></div>
              <div><dt className="font-medium">Ambiente esperado</dt><dd className="text-muted-foreground">Mercado Pago test</dd></div>
            </dl>
            <Button className="mt-5 min-h-11" onClick={runPaymentQa} disabled={running}>
              {running ? "Gerando Pix QA…" : "Gerar Pix QA de R$ 2.490,00"}
            </Button>
          </section>

          {error && (
            <section className="rounded-xl border border-destructive/50 bg-destructive/5 p-5">
              <h2 className="font-semibold">Falhou</h2>
              <pre className="mt-2 whitespace-pre-wrap break-words text-xs">{error}</pre>
            </section>
          )}

          {result !== null && (
            <section className="rounded-xl border border-border bg-card p-5">
              <h2 className="font-semibold">Resposta da Edge Function</h2>
              <pre className="mt-3 max-h-[28rem] overflow-auto whitespace-pre-wrap break-words rounded-lg bg-muted p-3 text-xs">
                {JSON.stringify(result, null, 2)}
              </pre>
            </section>
          )}
        </div>
      </RequireTenant>
    </AppShell>
  );
}
