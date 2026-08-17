import * as React from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery } from "@tanstack/react-query";
import { ArrowLeft, Copy, ExternalLink, QrCode } from "lucide-react";

import { AppShell } from "@/app/shell/app-shell";
import { RequireTenant } from "@/app/shell/require-tenant";
import { supabase } from "@/integrations/supabase/client";
import { humanizeError } from "@/lib/auth";
import { useI18n } from "@/lib/i18n";
import { useTenant } from "@/lib/tenant";
import { formatMoney } from "@/lib/format";
import { rpcArgs, type OrderListRow } from "@/lib/w09";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { EmptyState } from "@/components/feedback/empty-state";
import { PanelSkeleton } from "@/components/feedback/loading";
import { feedback } from "@/components/feedback/feedback";

export const Route = createFileRoute("/_authenticated/commerce/payments")({
  head: () => ({
    meta: [
      { title: "COBS Payments — Mercado Pago Pix" },
      {
        name: "description",
        content: "Geração de cobrança Pix do Mercado Pago para pedidos comerciais do COBS OS.",
      },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: PaymentsPage,
});

type PixResult = {
  charge_id: string;
  attempt_id: string;
  provider_order_id?: string | null;
  provider_payment_id?: string | null;
  status?: string | null;
  provider_status?: string | null;
  provider_status_detail?: string | null;
  pix?: {
    qr_code?: string | null;
    qr_code_base64?: string | null;
    ticket_url?: string | null;
  };
  reused?: boolean;
  environment?: string;
};

function PaymentsWorkspace() {
  const { tenant } = useTenant();
  const { locale } = useI18n();
  const tenantId = tenant!.id;
  const [orderId, setOrderId] = React.useState("");
  const [payerEmail, setPayerEmail] = React.useState("");
  const [result, setResult] = React.useState<PixResult | null>(null);

  React.useEffect(() => {
    void supabase.auth.getUser().then(({ data }) => {
      if (data.user?.email) setPayerEmail(data.user.email);
    });
  }, []);

  const orders = useQuery({
    queryKey: ["payments", "orders", tenantId],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("list_orders", rpcArgs({ _tenant_id: tenantId }));
      if (error) throw error;
      return (data ?? []) as unknown as OrderListRow[];
    },
  });

  const payable = React.useMemo(
    () => (orders.data ?? []).filter((order) => order.status === "submitted" || order.status === "confirmed"),
    [orders.data],
  );

  React.useEffect(() => {
    if (!orderId && payable.length > 0) setOrderId(payable[0].id);
  }, [orderId, payable]);

  const createPix = useMutation({
    mutationFn: async () => {
      if (!orderId) throw new Error("Selecione um pedido.");
      if (!payerEmail.trim()) throw new Error("Informe o e-mail do pagador.");

      const { data, error } = await supabase.functions.invoke("payments-create-charge", {
        body: {
          order_id: orderId,
          payer_email: payerEmail.trim().toLowerCase(),
        },
      });

      if (error) throw error;
      return data as PixResult;
    },
    onSuccess: (data) => {
      setResult(data);
      feedback.success(data.reused ? "Cobrança Pix recuperada." : "Cobrança Pix criada.");
    },
    onError: (error) => feedback.error(humanizeError(error, locale)),
  });

  if (orders.isLoading) return <PanelSkeleton />;
  if (orders.isError) {
    return (
      <EmptyState
        icon={QrCode}
        title="Não foi possível carregar os pedidos"
        body={humanizeError(orders.error, locale)}
      />
    );
  }

  const selected = payable.find((order) => order.id === orderId);
  const qrBase64 = result?.pix?.qr_code_base64;
  const qrSrc = qrBase64
    ? qrBase64.startsWith("data:")
      ? qrBase64
      : `data:image/png;base64,${qrBase64}`
    : null;

  return (
    <div className="space-y-6">
      <Button asChild variant="ghost" className="min-h-11 px-2">
        <Link to="/commerce">
          <ArrowLeft className="mr-2 size-4" aria-hidden />
          Voltar ao comércio
        </Link>
      </Button>

      <header className="space-y-1">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary">COBS Payments</p>
        <h1 className="text-2xl font-semibold tracking-tight">Cobrança Pix · Mercado Pago</h1>
        <p className="text-sm text-muted-foreground">
          Gere uma cobrança Pix para um pedido enviado ou confirmado. O status final é atualizado pelo webhook.
        </p>
      </header>

      <section className="rounded-lg border border-border bg-card p-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="payment-order">Pedido</Label>
            <select
              id="payment-order"
              className="h-11 w-full rounded-md border border-border bg-background px-3 text-sm"
              value={orderId}
              onChange={(event) => {
                setOrderId(event.target.value);
                setResult(null);
              }}
            >
              {payable.length === 0 && <option value="">Nenhum pedido disponível</option>}
              {payable.map((order) => (
                <option key={order.id} value={order.id}>
                  {order.buyer_name ?? "Pedido"}
                  {order.reference_label ? ` · ${order.reference_label}` : ""}
                  {typeof order.grand_total_minor === "number"
                    ? ` · ${formatMoney(order.grand_total_minor, { locale, currency: order.currency })}`
                    : ""}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="payer-email">E-mail do pagador</Label>
            <Input
              id="payer-email"
              type="email"
              value={payerEmail}
              onChange={(event) => setPayerEmail(event.target.value)}
              placeholder="pagador@exemplo.com"
            />
            <p className="text-xs text-muted-foreground">
              Usado pelo Mercado Pago na criação da Order Pix. Não é uma credencial.
            </p>
          </div>
        </div>

        {selected && (
          <div className="mt-4 rounded-md border border-border bg-background p-3 text-sm">
            <p className="font-medium">
              {selected.buyer_name ?? "Pedido"}
              {selected.reference_label ? ` · ${selected.reference_label}` : ""}
            </p>
            <p className="text-xs text-muted-foreground">Status: {selected.status}</p>
          </div>
        )}

        <Button
          className="mt-4 min-h-11"
          disabled={createPix.isPending || !orderId || !payerEmail.trim()}
          onClick={() => createPix.mutate()}
        >
          <QrCode className="mr-2 size-4" aria-hidden />
          {createPix.isPending ? "Gerando Pix…" : "Gerar cobrança Pix"}
        </Button>
      </section>

      {result && (
        <section className="rounded-lg border border-border bg-card p-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary">Mercado Pago</p>
              <h2 className="mt-1 text-lg font-semibold">Pix gerado</h2>
              <p className="text-sm text-muted-foreground">
                Status: {result.provider_status ?? result.status ?? "pendente"}
                {result.environment ? ` · Ambiente: ${result.environment}` : ""}
              </p>
            </div>
            {result.reused && (
              <span className="rounded-full bg-muted px-2.5 py-1 text-xs font-medium">Cobrança reutilizada</span>
            )}
          </div>

          <div className="mt-5 grid gap-5 md:grid-cols-[220px_minmax(0,1fr)]">
            <div className="flex min-h-52 items-center justify-center rounded-lg border border-border bg-white p-3">
              {qrSrc ? (
                <img src={qrSrc} alt="QR Code Pix" className="h-48 w-48 object-contain" />
              ) : (
                <div className="text-center text-sm text-muted-foreground">
                  <QrCode className="mx-auto mb-2 size-10" aria-hidden />
                  QR Code em imagem não retornado.
                </div>
              )}
            </div>

            <div className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="pix-code">Pix copia e cola</Label>
                <Textarea id="pix-code" readOnly value={result.pix?.qr_code ?? ""} className="min-h-28" />
                <Button
                  type="button"
                  variant="outline"
                  className="min-h-11"
                  disabled={!result.pix?.qr_code}
                  onClick={async () => {
                    if (!result.pix?.qr_code) return;
                    await navigator.clipboard.writeText(result.pix.qr_code);
                    feedback.success("Código Pix copiado.");
                  }}
                >
                  <Copy className="mr-2 size-4" aria-hidden />
                  Copiar código Pix
                </Button>
              </div>

              {result.pix?.ticket_url && (
                <Button asChild variant="outline" className="min-h-11">
                  <a href={result.pix.ticket_url} target="_blank" rel="noreferrer">
                    <ExternalLink className="mr-2 size-4" aria-hidden />
                    Abrir página do Pix
                  </a>
                </Button>
              )}

              <div className="rounded-md bg-muted p-3 text-xs text-muted-foreground">
                Charge: {result.charge_id}
                <br />
                Order Mercado Pago: {result.provider_order_id ?? "—"}
              </div>
            </div>
          </div>
        </section>
      )}
    </div>
  );
}

function PaymentsPage() {
  return (
    <AppShell activeId="commerce" title="COBS Payments">
      <RequireTenant>
        <PaymentsWorkspace />
      </RequireTenant>
    </AppShell>
  );
}
