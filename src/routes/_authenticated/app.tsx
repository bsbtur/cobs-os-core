import * as React from "react";
import { createFileRoute } from "@tanstack/react-router";

import { AppShell } from "@/app/shell/app-shell";
import { RequireTenant } from "@/app/shell/require-tenant";
import { Button } from "@/components/ui/button";
import {
  DashboardHeaderV2,
  OperationalDashboardV2,
} from "@/components/dashboard/operational-dashboard-v2";
import { supabase } from "@/integrations/supabase/client";
import { useI18n } from "@/lib/i18n";

const PRODUCTION_SMOKE_ORDER_ID = "1fd1ff52-c2bf-4d8e-b650-d908a2870612";

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

export const Route = createFileRoute("/_authenticated/app")({
  head: () => ({
    meta: [
      { title: "Centro de comando — COBS OS" },
      {
        name: "description",
        content: "Dashboard executivo e operacional do COBS OS com dados reais da organização.",
      },
      { property: "og:title", content: "Centro de comando — COBS OS" },
      { property: "og:type", content: "website" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: CommandCenter,
});

function ProductionPaymentSmokeRunner() {
  const [running, setRunning] = React.useState(false);
  const [result, setResult] = React.useState<ChargeResult | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [payerEmail, setPayerEmail] = React.useState("");

  React.useEffect(() => {
    void supabase.auth.getUser().then(({ data }) => {
      if (data.user?.email) setPayerEmail(data.user.email);
    });
  }, []);

  async function runSmoke() {
    setRunning(true);
    setError(null);
    setResult(null);
    try {
      const { data, error: invokeError } = await supabase.functions.invoke("payments-create-charge", {
        body: {
          order_id: PRODUCTION_SMOKE_ORDER_ID,
          payer_email: payerEmail,
        },
      });
      if (invokeError) throw invokeError;
      setResult((data ?? null) as ChargeResult | null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setRunning(false);
    }
  }

  return (
    <section className="rounded-xl border border-amber-500/50 bg-amber-500/5 p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-amber-500">Temporário · Production Smoke</p>
          <h2 className="mt-1 text-lg font-semibold">Mercado Pago · PIX real de R$ 1,00</h2>
          <p className="mt-2 max-w-3xl text-sm text-muted-foreground">
            Runner isolado desta branch. Usa somente o pedido QA de R$ 1,00 do CLEAN BUILD. Não abre vendas do CIOSP e não altera o preço comercial.
          </p>
        </div>
        <span className="rounded-full border border-amber-500/40 px-2.5 py-1 text-xs">CLEAN BUILD</span>
      </div>

      <dl className="mt-4 grid gap-2 text-sm sm:grid-cols-2">
        <div><dt className="text-muted-foreground">Order ID</dt><dd className="break-all">{PRODUCTION_SMOKE_ORDER_ID}</dd></div>
        <div><dt className="text-muted-foreground">Payer</dt><dd className="break-all">{payerEmail || "carregando sessão…"}</dd></div>
      </dl>

      <Button className="mt-5 min-h-11" disabled={running || !payerEmail} onClick={() => void runSmoke()}>
        {running ? "Gerando PIX real de R$ 1,00…" : "Gerar PIX REAL de R$ 1,00"}
      </Button>

      {error ? (
        <div className="mt-4 rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
          {error}
        </div>
      ) : null}

      {result ? (
        <div className="mt-5 rounded-lg border border-border bg-background/60 p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="font-semibold">Resposta da cobrança</h3>
            <span className="rounded-full border border-border px-2.5 py-1 text-xs">
              {result.environment ?? "—"} · {result.status ?? "—"}
            </span>
          </div>
          <dl className="mt-3 grid gap-2 text-sm sm:grid-cols-2">
            <div><dt className="text-muted-foreground">Charge</dt><dd className="break-all">{result.charge_id ?? "—"}</dd></div>
            <div><dt className="text-muted-foreground">Attempt</dt><dd className="break-all">{result.attempt_id ?? "—"}</dd></div>
            <div><dt className="text-muted-foreground">Provider order</dt><dd className="break-all">{result.provider_order_id ?? "—"}</dd></div>
            <div><dt className="text-muted-foreground">Provider status</dt><dd>{result.provider_status ?? "—"}</dd></div>
          </dl>
          {result.pix?.qr_code_base64 ? (
            <img src={`data:image/png;base64,${result.pix.qr_code_base64}`} alt="QR Code PIX real de teste" className="mt-4 h-56 w-56 rounded-lg bg-white p-2" />
          ) : null}
          {result.pix?.qr_code ? (
            <textarea readOnly value={result.pix.qr_code} className="mt-4 min-h-28 w-full rounded-md border border-border bg-background p-3 text-xs" />
          ) : null}
          {result.pix?.ticket_url ? (
            <a href={result.pix.ticket_url} target="_blank" rel="noreferrer" className="mt-4 inline-flex text-sm font-medium text-primary underline underline-offset-4">
              Abrir ticket PIX no Mercado Pago
            </a>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}

function CommandCenter() {
  const { t } = useI18n();

  return (
    <AppShell activeId="overview" title={t("overview.title")}>
      <div className="mx-auto w-full max-w-7xl space-y-6">
        <ProductionPaymentSmokeRunner />
        <DashboardHeaderV2 />
        <RequireTenant>
          <div className="animate-rise" style={{ animationDelay: "80ms" }}>
            <OperationalDashboardV2 />
          </div>
        </RequireTenant>
      </div>
    </AppShell>
  );
}
