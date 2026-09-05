import * as React from "react";
import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import {
  ArrowUpRight,
  CalendarClock,
  CircleDollarSign,
  Clock3,
  Receipt,
  TicketCheck,
  TicketMinus,
  Tickets,
  UserRound,
} from "lucide-react";

import { EmptyState } from "@/components/feedback/empty-state";
import { PanelSkeleton } from "@/components/feedback/loading";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { formatDate, formatMoney } from "@/lib/format";
import { useI18n } from "@/lib/i18n";

type DashboardEnvironment = "production" | "qa";

type PaymentScheduleItem = {
  installment_number: number;
  kind: "entry" | "installment";
  amount_minor: number;
  due_date?: string;
  due_rule?: string;
};

type DashboardOrder = {
  id: string;
  status: string;
  buyer_name: string | null;
  buyer_person_id: string;
  participants: Array<{ id: string; name: string }>;
  grand_total_minor: number;
  received_minor: number;
  confirmed_seats: number;
  reserved_seats: number;
  awaiting_pix: boolean;
  payment_schedule: PaymentScheduleItem[];
  created_at: string;
};

type CiospDashboardData = {
  environment: DashboardEnvironment;
  operation_id: string;
  offering_id: string;
  offering_name: string;
  currency: string;
  capacity: number;
  confirmed_seats: number;
  reserved_seats: number;
  available_seats: number;
  received_minor: number;
  outstanding_minor: number;
  awaiting_pix_orders: number;
  orders: DashboardOrder[];
  generated_at: string;
};

function nextInstallment(order: DashboardOrder) {
  let previousTotal = 0;
  for (const installment of order.payment_schedule) {
    const installmentEnd = previousTotal + installment.amount_minor;
    if (order.received_minor < installmentEnd) {
      return {
        ...installment,
        remaining_minor: installmentEnd - Math.max(order.received_minor, previousTotal),
      };
    }
    previousTotal = installmentEnd;
  }
  return null;
}

function Metric({
  icon: Icon,
  label,
  value,
  detail,
}: {
  icon: typeof Tickets;
  label: string;
  value: React.ReactNode;
  detail?: string;
}) {
  return (
    <article className="rounded-xl border border-border/70 bg-background/40 p-4">
      <p className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
        <Icon className="size-4 text-primary" aria-hidden="true" />
        {label}
      </p>
      <p className="mt-2 text-2xl font-semibold tabular-nums">{value}</p>
      {detail ? <p className="mt-1 text-xs text-muted-foreground">{detail}</p> : null}
    </article>
  );
}

export function CiospCommercialDashboard({ tenantId }: { tenantId: string }) {
  const { locale } = useI18n();
  const [environment, setEnvironment] = React.useState<DashboardEnvironment>("production");

  const dashboard = useQuery({
    queryKey: ["ciosp-commercial-dashboard", tenantId, environment],
    queryFn: async () => {
      // The RPC is introduced by the migration in this release. The generated
      // database types are refreshed after deployment, so keep the boundary local.
      const { data, error } = await supabase.rpc(
        "get_ciosp_commercial_dashboard" as never,
        { _tenant_id: tenantId, _environment: environment } as never,
      );
      if (error) throw error;
      return data as unknown as CiospDashboardData;
    },
    refetchInterval: 30_000,
  });

  return (
    <section className="surface-panel overflow-hidden">
      <div className="flex flex-wrap items-start justify-between gap-4 border-b border-border/70 p-5">
        <div>
          <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-primary">
            Comercial · CIOSP 2027
          </p>
          <h3 className="mt-1 text-xl font-semibold">Vendas e recebimentos</h3>
          <p className="mt-1 text-xs text-muted-foreground">
            Atualização automática a cada 30 segundos, baseada nos registros canônicos.
          </p>
        </div>

        <div className="flex items-center gap-2" aria-label="Ambiente dos dados comerciais">
          <label htmlFor="ciosp-dashboard-environment" className="text-xs text-muted-foreground">
            Ambiente obrigatório
          </label>
          <select
            id="ciosp-dashboard-environment"
            className="h-11 rounded-md border border-border bg-background px-3 text-sm font-medium"
            value={environment}
            onChange={(event) => setEnvironment(event.target.value as DashboardEnvironment)}
          >
            <option value="production">Produção</option>
            <option value="qa">QA / testes</option>
          </select>
        </div>
      </div>

      {environment === "qa" ? (
        <div className="border-b border-amber-500/30 bg-amber-500/10 px-5 py-3 text-xs font-medium text-amber-700 dark:text-amber-300">
          Ambiente QA: estes pedidos, valores e vagas não entram nos indicadores de produção.
        </div>
      ) : null}

      <div className="p-5">
        {dashboard.isLoading ? <PanelSkeleton rows={5} /> : null}
        {dashboard.isError ? (
          <EmptyState
            icon={Receipt}
            title="Não foi possível carregar o painel comercial"
            body="Tente novamente. Nenhum dado financeiro foi alterado."
          />
        ) : null}

        {dashboard.data ? (
          <div className="space-y-5">
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
              <Metric
                icon={TicketCheck}
                label="Vagas confirmadas"
                value={dashboard.data.confirmed_seats}
              />
              <Metric
                icon={Clock3}
                label="Reservadas"
                value={dashboard.data.reserved_seats}
                detail="Reservas ainda válidas"
              />
              <Metric
                icon={Tickets}
                label="Disponíveis"
                value={dashboard.data.available_seats}
                detail={`de ${dashboard.data.capacity}`}
              />
              <Metric
                icon={CircleDollarSign}
                label="Efetivamente recebido"
                value={formatMoney(dashboard.data.received_minor, {
                  locale,
                  currency: dashboard.data.currency,
                })}
              />
              <Metric
                icon={TicketMinus}
                label="Saldo a receber"
                value={formatMoney(dashboard.data.outstanding_minor, {
                  locale,
                  currency: dashboard.data.currency,
                })}
                detail="Somente pedidos confirmados"
              />
              <Metric
                icon={Receipt}
                label="Aguardando Pix"
                value={dashboard.data.awaiting_pix_orders}
                detail="Pedidos enviados"
              />
            </div>

            <div className="overflow-x-auto rounded-xl border border-border/70">
              <table className="w-full min-w-[960px] text-left text-sm">
                <thead className="bg-muted/40 text-xs text-muted-foreground">
                  <tr>
                    <th className="px-4 py-3 font-medium">Comprador / participante</th>
                    <th className="px-4 py-3 font-medium">Situação</th>
                    <th className="px-4 py-3 font-medium">Vagas</th>
                    <th className="px-4 py-3 font-medium">Recebido</th>
                    <th className="px-4 py-3 font-medium">Próxima parcela</th>
                    <th className="px-4 py-3 text-right font-medium">Pedido</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/70">
                  {dashboard.data.orders.map((order) => {
                    const installment = nextInstallment(order);
                    const participantNames = order.participants.map((person) => person.name);
                    return (
                      <tr key={order.id} className="align-top">
                        <td className="px-4 py-3">
                          <p className="flex items-center gap-2 font-medium">
                            <UserRound className="size-4 text-primary" aria-hidden="true" />
                            {order.buyer_name ?? "Comprador não identificado"}
                          </p>
                          <p className="mt-1 text-xs text-muted-foreground">
                            {participantNames.length > 0
                              ? `Participante: ${participantNames.join(", ")}`
                              : "Participante ainda não vinculado"}
                          </p>
                        </td>
                        <td className="px-4 py-3">
                          <span className="rounded-full border border-border px-2 py-1 text-xs">
                            {order.awaiting_pix ? "Aguardando Pix" : order.status}
                          </span>
                        </td>
                        <td className="px-4 py-3 tabular-nums">
                          {order.confirmed_seats > 0
                            ? `${order.confirmed_seats} confirmada(s)`
                            : `${order.reserved_seats} reservada(s)`}
                        </td>
                        <td className="px-4 py-3 font-medium tabular-nums">
                          {formatMoney(order.received_minor, {
                            locale,
                            currency: dashboard.data.currency,
                          })}
                        </td>
                        <td className="px-4 py-3">
                          {installment ? (
                            <>
                              <p className="flex items-center gap-2 font-medium">
                                <CalendarClock className="size-4 text-primary" aria-hidden="true" />
                                {installment.installment_number}/4 ·{" "}
                                {formatMoney(installment.remaining_minor, {
                                  locale,
                                  currency: dashboard.data.currency,
                                })}
                              </p>
                              <p className="mt-1 text-xs text-muted-foreground">
                                {installment.due_date
                                  ? `Vencimento: ${formatDate(`${installment.due_date}T12:00:00-03:00`, { locale, timeZone: "America/Sao_Paulo" })}`
                                  : "Vencimento no aceite da contratação"}
                              </p>
                            </>
                          ) : (
                            <span className="text-xs text-muted-foreground">Quitado</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-right">
                          <Button asChild variant="outline" size="sm">
                            <Link to="/commerce/$orderId" params={{ orderId: order.id }}>
                              Abrir
                              <ArrowUpRight className="ml-1 size-4" aria-hidden="true" />
                            </Link>
                          </Button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              {dashboard.data.orders.length === 0 ? (
                <div className="p-8 text-center text-sm text-muted-foreground">
                  Nenhum pedido neste ambiente.
                </div>
              ) : null}
            </div>
          </div>
        ) : null}
      </div>
    </section>
  );
}
