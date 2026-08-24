import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import {
  Activity,
  AlertTriangle,
  BedDouble,
  Building2,
  CalendarClock,
  CheckCircle2,
  Clock3,
  Gauge,
  Megaphone,
  Route as RouteIcon,
  Users,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useTenant } from "@/lib/tenant";

type OperationStatus = "draft" | "planning" | "ready" | "active" | "completed" | "cancelled";
type ActivityDomain = "Jornada" | "Mobilidade" | "Hospedagem" | "Eventos" | "Comunicação";
type MetricRows = Array<[string, string]>;

type OperationRow = {
  id: string;
  name: string;
  status: OperationStatus;
  planned_start: string;
  planned_end: string;
  archived_at: string | null;
  updated_at: string;
};

type RawActivity = {
  id: string;
  operation_id: string | null;
  event_type: string;
  occurred_at: string;
};

type ActivityItem = {
  id: string;
  operationName: string;
  domain: ActivityDomain;
  type: string;
  occurredAt: string;
};

const STATUS_LABEL: Record<OperationStatus, string> = {
  draft: "Rascunho",
  planning: "Planejamento",
  ready: "Pronto",
  active: "Em execução",
  completed: "Concluída",
  cancelled: "Cancelada",
};

const STATUS_ORDER: OperationStatus[] = [
  "active",
  "ready",
  "planning",
  "draft",
  "completed",
  "cancelled",
];

const EVENT_LABELS: Record<string, string> = {
  MESSAGE_READ: "Mensagem lida",
  MESSAGE_PUBLISHED: "Mensagem publicada",
  IN_APP_DELIVERY_CREATED: "Entrega no app criada",
  EVENT_STARTED: "Evento iniciado",
  EVENT_COMPLETED: "Evento concluído",
  SESSION_STARTED: "Sessão iniciada",
  SESSION_COMPLETED: "Sessão concluída",
  STAY_COMPLETED: "Hospedagem encerrada",
  ROOM_RELEASED: "Quarto liberado",
  STAY_CHECKOUT_COMPLETED: "Check-out do grupo concluído",
  GUEST_CHECKED_OUT: "Check-out confirmado",
  GUEST_CHECKED_IN: "Check-in confirmado",
  STAY_CHECKIN_OPENED: "Check-in aberto",
  STAY_CONFIRMED: "Hospedagem confirmada",
  ROOM_ASSIGNED: "Quarto atribuído",
  DESTINATION_ARRIVED: "Chegada ao destino",
  LEG_DEPARTED: "Veículo partiu",
  VEHICLE_AT_PICKUP: "Veículo no ponto de embarque",
  VEHICLE_EN_ROUTE_TO_PICKUP: "Veículo a caminho do embarque",
  VEHICLE_REQUESTED: "Veículo solicitado",
  DRIVER_ASSIGNED: "Motorista designado",
  VEHICLE_ASSIGNED: "Veículo designado",
  STEP_STARTED: "Etapa iniciada",
  STEP_COMPLETED: "Etapa concluída",
  BOARDING_STARTED: "Embarque iniciado",
  BOARDING_COMPLETED: "Embarque concluído",
  DEPARTURE_AUTHORIZED: "Saída autorizada",
  GROUP_DEPARTED: "Grupo iniciou o deslocamento",
  ARRIVED: "Chegada registrada",
};

function formatDateTime(value: string | null | undefined) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function minutesBetween(actual: string, planned: string) {
  return Math.round((new Date(actual).getTime() - new Date(planned).getTime()) / 60_000);
}

function humanizeEventType(value: string) {
  if (EVENT_LABELS[value]) return EVENT_LABELS[value];
  const text = value.replaceAll("_", " ").toLowerCase();
  return text.charAt(0).toUpperCase() + text.slice(1);
}

function formatDeviation(minutes: number) {
  const absolute = Math.abs(minutes);
  const hours = Math.floor(absolute / 60);
  const mins = absolute % 60;
  const amount = hours > 0 ? `${hours}h${String(mins).padStart(2, "0")}` : `${mins} min`;
  if (minutes < -5) return `${amount} adiantado`;
  if (minutes > 5) return `${amount} atrasado`;
  return "Dentro da tolerância";
}

export function OperationalDashboardV2() {
  const { tenant, role } = useTenant();
  const tenantId = tenant?.id;

  const dashboard = useQuery({
    queryKey: ["command-center-v2", tenantId],
    enabled: Boolean(tenantId),
    refetchInterval: 60_000,
    queryFn: async () => {
      const [
        operationsResult,
        participationsResult,
        journeyEventsResult,
        transportLegsResult,
        transportEventsResult,
        hospitalityStaysResult,
        hospitalityEventsResult,
        eventsResult,
        eventRuntimeResult,
        messagesResult,
        recipientsResult,
        deliveriesResult,
        communicationEventsResult,
      ] = await Promise.all([
        supabase
          .from("operations")
          .select("id,name,status,planned_start,planned_end,archived_at,updated_at")
          .eq("tenant_id", tenantId!),
        supabase
          .from("operation_participations")
          .select("id,operation_id,participation_kind,cancelled_at")
          .eq("tenant_id", tenantId!),
        supabase
          .from("journey_events")
          .select("id,operation_id,event_type,occurred_at")
          .eq("tenant_id", tenantId!)
          .order("occurred_at", { ascending: false })
          .limit(40),
        supabase
          .from("transport_legs")
          .select("id,operation_id,planned_departure")
          .eq("tenant_id", tenantId!),
        supabase
          .from("transport_events")
          .select("id,operation_id,transport_leg_id,event_type,occurred_at")
          .eq("tenant_id", tenantId!)
          .order("occurred_at", { ascending: false })
          .limit(80),
        supabase
          .from("hospitality_stays")
          .select("id,operation_id,status,planned_check_out")
          .eq("tenant_id", tenantId!),
        supabase
          .from("hospitality_events")
          .select("id,operation_id,event_type,occurred_at")
          .eq("tenant_id", tenantId!)
          .order("occurred_at", { ascending: false })
          .limit(40),
        supabase.from("events").select("id,operation_id,status").eq("tenant_id", tenantId!),
        supabase
          .from("event_runtime_events")
          .select("id,operation_id,event_type,occurred_at")
          .eq("tenant_id", tenantId!)
          .order("occurred_at", { ascending: false })
          .limit(40),
        supabase.from("messages").select("id,status").eq("tenant_id", tenantId!),
        supabase
          .from("message_recipients")
          .select("id,message_id,in_app_eligible,first_read_at")
          .eq("tenant_id", tenantId!),
        supabase.from("message_deliveries").select("id,message_id").eq("tenant_id", tenantId!),
        supabase
          .from("communication_events")
          .select("id,operation_id,event_type,occurred_at")
          .eq("tenant_id", tenantId!)
          .order("occurred_at", { ascending: false })
          .limit(40),
      ]);

      if (operationsResult.error) throw operationsResult.error;
      if (participationsResult.error) throw participationsResult.error;

      const operations = (operationsResult.data ?? []) as OperationRow[];
      const visibleOperations = operations.filter((operation) => !operation.archived_at);
      const operationMap = new Map(operations.map((operation) => [operation.id, operation.name]));
      const now = Date.now();

      const statusCounts = STATUS_ORDER.reduce<Record<OperationStatus, number>>(
        (acc, status) => {
          acc[status] = visibleOperations.filter((operation) => operation.status === status).length;
          return acc;
        },
        { draft: 0, planning: 0, ready: 0, active: 0, completed: 0, cancelled: 0 },
      );

      const upcoming = visibleOperations
        .filter((operation) => {
          const start = new Date(operation.planned_start).getTime();
          return ["planning", "ready"].includes(operation.status) && start >= now;
        })
        .sort((a, b) => new Date(a.planned_start).getTime() - new Date(b.planned_start).getTime())
        .slice(0, 5);

      const recentOperations = [...visibleOperations]
        .sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime())
        .slice(0, 5);

      const participations = (participationsResult.data ?? []).filter((item) => !item.cancelled_at);
      const participantCount = participations.filter(
        (item) => item.participation_kind === "participant",
      ).length;
      const crewCount = participations.filter((item) => item.participation_kind === "crew").length;

      const alerts: Array<{ label: string; operationId?: string }> = [];
      for (const operation of visibleOperations) {
        if (operation.status === "active" && new Date(operation.planned_end).getTime() < now) {
          alerts.push({
            label: `${operation.name}: operação ativa após o fim planejado`,
            operationId: operation.id,
          });
        }
      }

      const stays = hospitalityStaysResult.error ? null : (hospitalityStaysResult.data ?? []);
      if (stays) {
        for (const stay of stays.filter((item) => ["confirmed", "active"].includes(item.status))) {
          if (new Date(stay.planned_check_out).getTime() < now) {
            alerts.push({
              label: `${operationMap.get(stay.operation_id) ?? "Operação"}: hospedagem aberta após o check-out planejado`,
              operationId: stay.operation_id,
            });
          }
        }
      }

      const legs = transportLegsResult.error ? null : (transportLegsResult.data ?? []);
      const transportEvents = transportEventsResult.error
        ? null
        : (transportEventsResult.data ?? []);
      let timing: {
        samples: number;
        early: number;
        onTime: number;
        late: number;
        rate: number;
        average: number;
      } | null = null;
      let departed = 0;
      let arrived = 0;

      if (legs && transportEvents) {
        const legMap = new Map(legs.map((leg) => [leg.id, leg]));
        const departures = transportEvents.filter((event) => event.event_type === "LEG_DEPARTED");
        const arrivals = transportEvents.filter(
          (event) => event.event_type === "DESTINATION_ARRIVED",
        );
        departed = new Set(departures.map((event) => event.transport_leg_id)).size;
        arrived = new Set(arrivals.map((event) => event.transport_leg_id)).size;

        const samples = departures
          .map((event) => {
            const leg = event.transport_leg_id ? legMap.get(event.transport_leg_id) : undefined;
            return leg?.planned_departure
              ? minutesBetween(event.occurred_at, leg.planned_departure)
              : null;
          })
          .filter((value): value is number => value !== null);

        if (samples.length > 0) {
          const early = samples.filter((value) => value < -5).length;
          const onTime = samples.filter((value) => value >= -5 && value <= 5).length;
          const late = samples.filter((value) => value > 5).length;
          timing = {
            samples: samples.length,
            early,
            onTime,
            late,
            rate: Math.round((onTime / samples.length) * 100),
            average: Math.round(samples.reduce((sum, value) => sum + value, 0) / samples.length),
          };
        }
      }

      const messages = messagesResult.error ? null : (messagesResult.data ?? []);
      const recipients = recipientsResult.error ? null : (recipientsResult.data ?? []);
      const deliveries = deliveriesResult.error ? null : (deliveriesResult.data ?? []);
      const communication =
        messages && recipients && deliveries
          ? (() => {
              const publishedIds = new Set(
                messages
                  .filter((message) => message.status === "published")
                  .map((message) => message.id),
              );
              const scopedRecipients = recipients.filter((recipient) =>
                publishedIds.has(recipient.message_id),
              );
              const readable = scopedRecipients.filter((recipient) => recipient.in_app_eligible);
              const reads = readable.filter((recipient) => Boolean(recipient.first_read_at));
              return {
                published: publishedIds.size,
                deliveries: deliveries.filter((delivery) => publishedIds.has(delivery.message_id))
                  .length,
                reads: reads.length,
                readRate:
                  readable.length > 0 ? Math.round((reads.length / readable.length) * 100) : null,
              };
            })()
          : null;

      const events = eventsResult.error ? null : (eventsResult.data ?? []);
      const runtime = eventRuntimeResult.error ? null : (eventRuntimeResult.data ?? []);
      const eventSummary =
        events && runtime
          ? {
              total: events.length,
              closed: events.filter((event) => event.status === "closed_out").length,
              sessionsCompleted: runtime.filter((event) => event.event_type === "SESSION_COMPLETED")
                .length,
            }
          : null;

      const hospitalitySummary = stays
        ? {
            total: stays.length,
            active: stays.filter((stay) => ["active", "confirmed"].includes(stay.status)).length,
            completed: stays.filter((stay) => stay.status === "completed").length,
          }
        : null;

      const activitySources: Array<{ domain: ActivityDomain; rows: RawActivity[] }> = [
        {
          domain: "Jornada",
          rows: journeyEventsResult.error ? [] : (journeyEventsResult.data ?? []),
        },
        {
          domain: "Mobilidade",
          rows: transportEventsResult.error ? [] : (transportEventsResult.data ?? []),
        },
        {
          domain: "Hospedagem",
          rows: hospitalityEventsResult.error ? [] : (hospitalityEventsResult.data ?? []),
        },
        { domain: "Eventos", rows: runtime ?? [] },
        {
          domain: "Comunicação",
          rows: communicationEventsResult.error ? [] : (communicationEventsResult.data ?? []),
        },
      ];

      const recentActivity: ActivityItem[] = activitySources
        .flatMap(({ domain, rows }) =>
          rows.flatMap((row) => {
            if (!row.operation_id) return [];
            return [
              {
                id: `${domain}-${row.id}`,
                operationName: operationMap.get(row.operation_id) ?? "Operação",
                domain,
                type: humanizeEventType(row.event_type),
                occurredAt: row.occurred_at,
              },
            ];
          }),
        )
        .sort((a, b) => new Date(b.occurredAt).getTime() - new Date(a.occurredAt).getTime())
        .slice(0, 12);

      return {
        operations: visibleOperations,
        statusCounts,
        upcoming,
        recentOperations,
        participation: {
          total: participations.length,
          participants: participantCount,
          crew: crewCount,
        },
        alerts,
        timing,
        mobility: legs ? { total: legs.length, departed, arrived } : null,
        hospitality: hospitalitySummary,
        events: eventSummary,
        communication,
        recentActivity,
      };
    },
  });

  if (dashboard.isLoading) {
    return (
      <section className="surface-panel p-6 text-sm text-muted-foreground">
        Carregando indicadores reais…
      </section>
    );
  }

  if (dashboard.isError || !dashboard.data) {
    return (
      <section className="surface-panel border-destructive/30 p-6" role="alert">
        <p className="font-semibold text-destructive">Não foi possível carregar o dashboard.</p>
        <Button
          type="button"
          variant="outline"
          className="mt-3"
          onClick={() => void dashboard.refetch()}
        >
          Tentar novamente
        </Button>
      </section>
    );
  }

  const data = dashboard.data;
  const maxStatusCount = Math.max(1, ...STATUS_ORDER.map((status) => data.statusCounts[status]));
  const timingRows: MetricRows | null = data.timing
    ? [
        ["Amostras de partida", String(data.timing.samples)],
        ["Pontuais (± 5 min)", `${data.timing.rate}% (${data.timing.onTime})`],
        ["Adiantadas (> 5 min)", String(data.timing.early)],
        ["Atrasadas (> 5 min)", String(data.timing.late)],
        ["Desvio médio", formatDeviation(data.timing.average)],
      ]
    : null;

  return (
    <div className="space-y-6">
      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Kpi
          title="Em execução"
          value={data.statusCounts.active}
          detail={`${data.operations.length} operações não arquivadas`}
          icon={Activity}
        />
        <Kpi
          title="Próximas operações"
          value={data.upcoming.length}
          detail="Planejamento ou pronto com início futuro"
          icon={CalendarClock}
        />
        <Kpi
          title="Pessoas envolvidas"
          value={data.participation.total}
          detail={`${data.participation.participants} participantes · ${data.participation.crew} equipe`}
          icon={Users}
        />
        <Kpi
          title="Atenções objetivas"
          value={data.alerts.length}
          detail="Somente regras derivadas de fatos"
          icon={AlertTriangle}
        />
      </section>

      <section className="grid gap-6 xl:grid-cols-2">
        <article className="surface-panel p-5">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h3 className="font-semibold">Operações por estado</h3>
              <p className="mt-1 text-sm text-muted-foreground">
                Distribuição real das operações não arquivadas.
              </p>
            </div>
            <Button asChild variant="outline" size="sm">
              <Link to="/operations">Abrir operações</Link>
            </Button>
          </div>
          <div className="mt-5 space-y-3">
            {STATUS_ORDER.map((status) => {
              const value = data.statusCounts[status];
              const width = value === 0 ? 0 : Math.max(8, (value / maxStatusCount) * 100);
              return (
                <div
                  key={status}
                  className="grid grid-cols-[112px_1fr_32px] items-center gap-3 text-sm"
                >
                  <span className="text-muted-foreground">{STATUS_LABEL[status]}</span>
                  <div className="h-2 overflow-hidden rounded-full bg-muted">
                    <div
                      className="h-full rounded-full bg-primary"
                      style={{ width: `${width}%` }}
                    />
                  </div>
                  <span className="text-right font-mono">{value}</span>
                </div>
              );
            })}
          </div>
        </article>

        <article className="surface-panel p-5">
          <h3 className="font-semibold">Atenções operacionais</h3>
          <p className="mt-1 text-sm text-muted-foreground">
            Alertas determinísticos, sem inferência subjetiva.
          </p>
          <div className="mt-4 space-y-2">
            {data.alerts.length === 0 ? (
              <NoData text="Nenhuma atenção objetiva detectada agora." />
            ) : (
              data.alerts.map((alert) => (
                <div key={alert.label} className="rounded-lg border p-3 text-sm">
                  {alert.label}
                </div>
              ))
            )}
          </div>
        </article>
      </section>

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <DomainCard icon={Gauge} title="Desempenho operacional" rows={timingRows} />
        <DomainCard
          icon={RouteIcon}
          title="Mobilidade"
          rows={
            data.mobility
              ? [
                  ["Trechos", String(data.mobility.total)],
                  ["Partiram", String(data.mobility.departed)],
                  ["Chegaram", String(data.mobility.arrived)],
                ]
              : null
          }
        />
        <DomainCard
          icon={BedDouble}
          title="Hospedagem"
          rows={
            data.hospitality
              ? [
                  ["Hospedagens", String(data.hospitality.total)],
                  ["Ativas / confirmadas", String(data.hospitality.active)],
                  ["Encerradas", String(data.hospitality.completed)],
                ]
              : null
          }
        />
        <DomainCard
          icon={CalendarClock}
          title="Eventos"
          rows={
            data.events
              ? [
                  ["Eventos", String(data.events.total)],
                  ["Encerrados", String(data.events.closed)],
                  ["Sessões concluídas", String(data.events.sessionsCompleted)],
                ]
              : null
          }
        />
      </section>

      <section className="grid gap-6 xl:grid-cols-[0.9fr_1.1fr]">
        <article className="surface-panel p-5">
          <h3 className="flex items-center gap-2 font-semibold">
            <Megaphone className="size-4" /> Comunicação
          </h3>
          {data.communication ? (
            <div className="mt-5 grid grid-cols-2 gap-3">
              <MiniMetric label="Publicadas" value={data.communication.published} />
              <MiniMetric label="Entregas" value={data.communication.deliveries} />
              <MiniMetric label="Leituras" value={data.communication.reads} />
              <MiniMetric
                label="Taxa de leitura"
                value={
                  data.communication.readRate === null ? "—" : `${data.communication.readRate}%`
                }
              />
            </div>
          ) : (
            <NoData />
          )}
        </article>
        <article className="surface-panel p-5">
          <h3 className="font-semibold">Próximas e recentes</h3>
          <div className="mt-4 grid gap-5 md:grid-cols-2">
            <OperationList title="Próximas operações" operations={data.upcoming} />
            <OperationList title="Atualizadas recentemente" operations={data.recentOperations} />
          </div>
        </article>
      </section>

      <article className="surface-panel p-5">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="font-semibold">Atividade recente</h3>
            <p className="mt-1 text-sm text-muted-foreground">Fatos em linguagem operacional.</p>
          </div>
          <Clock3 className="size-4 text-muted-foreground" />
        </div>
        <div className="mt-4 divide-y">
          {data.recentActivity.length === 0 ? (
            <NoData />
          ) : (
            data.recentActivity.map((item) => (
              <div
                key={item.id}
                className="grid gap-1 py-3 sm:grid-cols-[120px_1fr_auto] sm:items-center sm:gap-4"
              >
                <span className="text-xs font-medium text-primary">{item.domain}</span>
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{item.operationName}</p>
                  <p className="truncate text-sm text-muted-foreground">{item.type}</p>
                </div>
                <time className="text-xs text-muted-foreground">
                  {formatDateTime(item.occurredAt)}
                </time>
              </div>
            ))
          )}
        </div>
      </article>

      <section className="surface-panel flex flex-wrap items-center justify-between gap-3 p-4">
        <div className="flex items-center gap-3">
          <Building2 className="size-4 text-primary" />
          <div>
            <p className="text-sm font-medium">{tenant?.name ?? "Organização"}</p>
            <p className="text-xs text-muted-foreground">
              Papel atual: {role ?? "—"} · dados atualizados automaticamente
            </p>
          </div>
        </div>
        <div className="flex gap-2">
          <Button asChild variant="outline" size="sm">
            <Link to="/people">Pessoas</Link>
          </Button>
          <Button asChild variant="outline" size="sm">
            <Link to="/operations">Operações</Link>
          </Button>
        </div>
      </section>
    </div>
  );
}

function Kpi({
  title,
  value,
  detail,
  icon: Icon,
}: {
  title: string;
  value: number;
  detail: string;
  icon: typeof Activity;
}) {
  return (
    <article className="surface-panel p-4">
      <div className="flex items-start justify-between">
        <div>
          <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
            {title}
          </p>
          <p className="mt-2 text-3xl font-semibold">{value}</p>
        </div>
        <span className="grid size-10 place-items-center rounded-lg bg-primary-soft text-primary">
          <Icon className="size-4" />
        </span>
      </div>
      <p className="mt-3 text-xs text-muted-foreground">{detail}</p>
    </article>
  );
}

function DomainCard({
  icon: Icon,
  title,
  rows,
}: {
  icon: typeof Activity;
  title: string;
  rows: MetricRows | null;
}) {
  return (
    <article className="surface-panel p-4">
      <span className="grid size-9 place-items-center rounded-lg bg-primary-soft text-primary">
        <Icon className="size-4" />
      </span>
      <h3 className="mt-4 font-semibold">{title}</h3>
      {rows ? (
        <dl className="mt-3 space-y-2">
          {rows.map(([label, value]) => (
            <div key={label} className="flex items-center justify-between gap-3 text-sm">
              <dt className="text-muted-foreground">{label}</dt>
              <dd className="text-right font-medium tabular-nums">{value}</dd>
            </div>
          ))}
        </dl>
      ) : (
        <NoData />
      )}
    </article>
  );
}

function MiniMetric({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-lg border p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 text-2xl font-semibold tabular-nums">{value}</p>
    </div>
  );
}

function NoData({ text = "Sem dados suficientes." }: { text?: string }) {
  return (
    <p className="mt-4 rounded-lg border border-dashed p-3 text-sm text-muted-foreground">{text}</p>
  );
}

function OperationList({ title, operations }: { title: string; operations: OperationRow[] }) {
  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{title}</p>
      <div className="mt-2 space-y-2">
        {operations.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nenhuma operação neste recorte.</p>
        ) : (
          operations.map((operation) => (
            <Link
              key={operation.id}
              to="/operations/$operationId"
              params={{ operationId: operation.id }}
              className="block rounded-lg border p-3 hover:bg-muted/40"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{operation.name}</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {formatDateTime(operation.planned_start)}
                  </p>
                </div>
                <span className="shrink-0 text-[10px] font-semibold uppercase text-primary">
                  {STATUS_LABEL[operation.status]}
                </span>
              </div>
            </Link>
          ))
        )}
      </div>
    </div>
  );
}

export function DashboardHeaderV2() {
  return (
    <section className="animate-rise flex flex-wrap items-end justify-between gap-4">
      <div>
        <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-primary">
          Inteligência operacional
        </p>
        <h2 className="mt-1 text-2xl font-semibold lg:text-3xl">Centro de comando</h2>
        <p className="mt-2 max-w-3xl text-sm text-muted-foreground">
          Dados reais do tenant atual. O COBS mostra estado, atenção e evidência — nunca números
          simulados.
        </p>
      </div>
      <div className="flex items-center gap-2 rounded-lg border px-3 py-2 text-xs text-muted-foreground">
        <CheckCircle2 className="size-4 text-primary" /> Atualização automática a cada 60 s
      </div>
    </section>
  );
}
