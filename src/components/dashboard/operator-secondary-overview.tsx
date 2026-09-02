import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import {
  BedDouble,
  CalendarClock,
  CheckCircle2,
  Clock3,
  Megaphone,
  Route as RouteIcon,
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

const EVENT_LABELS: Record<string, string> = {
  MESSAGE_READ: "Mensagem lida",
  MESSAGE_PUBLISHED: "Mensagem publicada",
  EVENT_STARTED: "Evento iniciado",
  EVENT_COMPLETED: "Evento concluído",
  SESSION_STARTED: "Sessão iniciada",
  SESSION_COMPLETED: "Sessão concluída",
  STAY_COMPLETED: "Hospedagem encerrada",
  STAY_CHECKOUT_COMPLETED: "Check-out do grupo concluído",
  GUEST_CHECKED_OUT: "Check-out confirmado",
  GUEST_CHECKED_IN: "Check-in confirmado",
  STAY_CHECKIN_OPENED: "Check-in aberto",
  DESTINATION_ARRIVED: "Chegada ao destino",
  LEG_DEPARTED: "Veículo partiu",
  VEHICLE_AT_PICKUP: "Veículo no ponto de embarque",
  STEP_STARTED: "Etapa iniciada",
  STEP_COMPLETED: "Etapa concluída",
  BOARDING_STARTED: "Embarque iniciado",
  BOARDING_COMPLETED: "Embarque concluído",
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

function humanizeEventType(value: string) {
  if (EVENT_LABELS[value]) return EVENT_LABELS[value];
  const text = value.replaceAll("_", " ").toLowerCase();
  return text.charAt(0).toUpperCase() + text.slice(1);
}

export function OperatorDashboardHeader() {
  return (
    <section className="animate-rise flex flex-wrap items-end justify-between gap-4">
      <div>
        <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-primary">Operações</p>
        <h2 className="mt-1 text-2xl font-semibold lg:text-3xl">Centro operacional</h2>
        <p className="mt-2 max-w-3xl text-sm text-muted-foreground">
          Veja primeiro o que está acontecendo agora, o que exige atenção e, depois, o contexto operacional complementar.
        </p>
      </div>
      <div className="flex items-center gap-2 rounded-lg border px-3 py-2 text-xs text-muted-foreground">
        <CheckCircle2 className="size-4 text-primary" /> Atualização automática a cada 60 s
      </div>
    </section>
  );
}

export function OperatorSecondaryOverview() {
  const { tenant } = useTenant();
  const tenantId = tenant?.id;

  const overview = useQuery({
    queryKey: ["operator-secondary-overview", tenantId],
    enabled: Boolean(tenantId),
    refetchInterval: 60_000,
    queryFn: async () => {
      const [
        operationsResult,
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
          .select("id,name,status,planned_start,archived_at,updated_at")
          .eq("tenant_id", tenantId!),
        supabase
          .from("journey_events")
          .select("id,operation_id,event_type,occurred_at")
          .eq("tenant_id", tenantId!)
          .order("occurred_at", { ascending: false })
          .limit(40),
        supabase.from("transport_legs").select("id").eq("tenant_id", tenantId!),
        supabase
          .from("transport_events")
          .select("id,operation_id,transport_leg_id,event_type,occurred_at")
          .eq("tenant_id", tenantId!)
          .order("occurred_at", { ascending: false })
          .limit(80),
        supabase
          .from("hospitality_stays")
          .select("id,status")
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

      const operations = (operationsResult.data ?? []) as OperationRow[];
      const visibleOperations = operations.filter((operation) => !operation.archived_at);
      const operationMap = new Map(operations.map((operation) => [operation.id, operation.name]));
      const now = Date.now();

      const upcoming = visibleOperations
        .filter(
          (operation) =>
            ["planning", "ready"].includes(operation.status) &&
            new Date(operation.planned_start).getTime() >= now,
        )
        .sort(
          (a, b) =>
            new Date(a.planned_start).getTime() - new Date(b.planned_start).getTime(),
        )
        .slice(0, 5);

      const recentOperations = [...visibleOperations]
        .sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime())
        .slice(0, 5);

      const legs = transportLegsResult.error ? null : (transportLegsResult.data ?? []);
      const transportEvents = transportEventsResult.error ? null : (transportEventsResult.data ?? []);
      const departed = transportEvents
        ? new Set(
            transportEvents
              .filter((event) => event.event_type === "LEG_DEPARTED")
              .map((event) => event.transport_leg_id),
          ).size
        : 0;
      const arrived = transportEvents
        ? new Set(
            transportEvents
              .filter((event) => event.event_type === "DESTINATION_ARRIVED")
              .map((event) => event.transport_leg_id),
          ).size
        : 0;

      const stays = hospitalityStaysResult.error ? null : (hospitalityStaysResult.data ?? []);
      const hospitality = stays
        ? {
            total: stays.length,
            active: stays.filter((stay) => ["active", "confirmed"].includes(stay.status)).length,
            completed: stays.filter((stay) => stay.status === "completed").length,
          }
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
                deliveries: deliveries.filter((delivery) => publishedIds.has(delivery.message_id)).length,
                reads: reads.length,
                readRate: readable.length > 0 ? Math.round((reads.length / readable.length) * 100) : null,
              };
            })()
          : null;

      const activitySources: Array<{ domain: ActivityDomain; rows: RawActivity[] }> = [
        { domain: "Jornada", rows: journeyEventsResult.error ? [] : (journeyEventsResult.data ?? []) },
        { domain: "Mobilidade", rows: transportEvents ?? [] },
        { domain: "Hospedagem", rows: hospitalityEventsResult.error ? [] : (hospitalityEventsResult.data ?? []) },
        { domain: "Eventos", rows: runtime ?? [] },
        { domain: "Comunicação", rows: communicationEventsResult.error ? [] : (communicationEventsResult.data ?? []) },
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
        .slice(0, 10);

      return {
        upcoming,
        recentOperations,
        mobility: legs ? { total: legs.length, departed, arrived } : null,
        hospitality,
        events: eventSummary,
        communication,
        recentActivity,
      };
    },
  });

  if (overview.isLoading) {
    return (
      <section className="surface-panel p-6 text-sm text-muted-foreground" aria-busy="true">
        Carregando contexto operacional…
      </section>
    );
  }

  if (overview.isError || !overview.data) {
    return (
      <section className="surface-panel border-destructive/30 p-6" role="alert">
        <p className="font-semibold text-destructive">Não foi possível carregar o contexto operacional.</p>
        <Button type="button" variant="outline" className="mt-3" onClick={() => void overview.refetch()}>
          Tentar novamente
        </Button>
      </section>
    );
  }

  const data = overview.data;

  return (
    <div className="space-y-6">
      <section>
        <div>
          <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
            Contexto operacional
          </p>
          <h3 className="mt-1 text-lg font-semibold">Situação geral</h3>
          <p className="mt-1 text-sm text-muted-foreground">
            Indicadores complementares. Ação imediata continua concentrada nos blocos acima.
          </p>
        </div>
        <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
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
            title="Programação"
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
          <DomainCard
            icon={Megaphone}
            title="Comunicação"
            rows={
              data.communication
                ? [
                    ["Publicadas", String(data.communication.published)],
                    ["Entregas", String(data.communication.deliveries)],
                    ["Leituras", String(data.communication.reads)],
                    ["Taxa de leitura", data.communication.readRate === null ? "—" : `${data.communication.readRate}%`],
                  ]
                : null
            }
          />
        </div>
      </section>

      <section className="surface-panel p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="font-semibold">Operações para consultar</h3>
            <p className="mt-1 text-sm text-muted-foreground">Próximas operações e as que tiveram atualização recente.</p>
          </div>
          <Button asChild variant="outline" size="sm">
            <Link to="/operations">Ver todas</Link>
          </Button>
        </div>
        <div className="mt-4 grid gap-5 md:grid-cols-2">
          <OperationList title="Próximas operações" operations={data.upcoming} />
          <OperationList title="Atualizadas recentemente" operations={data.recentOperations} />
        </div>
      </section>

      <article className="surface-panel p-5">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="font-semibold">Atividade recente</h3>
            <p className="mt-1 text-sm text-muted-foreground">Fatos recentes registrados nas operações.</p>
          </div>
          <Clock3 className="size-4 text-muted-foreground" />
        </div>
        <div className="mt-4 divide-y">
          {data.recentActivity.length === 0 ? (
            <NoData text="Nenhuma atividade operacional recente neste recorte." />
          ) : (
            data.recentActivity.map((item) => (
              <div key={item.id} className="grid gap-1 py-3 sm:grid-cols-[120px_1fr_auto] sm:items-center sm:gap-4">
                <span className="text-xs font-medium text-primary">{item.domain}</span>
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{item.operationName}</p>
                  <p className="truncate text-sm text-muted-foreground">{item.type}</p>
                </div>
                <time className="text-xs text-muted-foreground">{formatDateTime(item.occurredAt)}</time>
              </div>
            ))
          )}
        </div>
      </article>
    </div>
  );
}

function DomainCard({ icon: Icon, title, rows }: { icon: typeof RouteIcon; title: string; rows: MetricRows | null }) {
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

function NoData({ text = "Sem dados suficientes." }: { text?: string }) {
  return <p className="mt-4 rounded-lg border border-dashed p-3 text-sm text-muted-foreground">{text}</p>;
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
                  <p className="mt-1 text-xs text-muted-foreground">{formatDateTime(operation.planned_start)}</p>
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
