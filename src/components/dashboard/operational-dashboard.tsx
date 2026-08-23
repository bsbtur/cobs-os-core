import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import {
  Activity,
  AlertTriangle,
  ArrowRight,
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

type OperationRow = {
  id: string;
  name: string;
  code: string;
  status: OperationStatus;
  planned_start: string;
  planned_end: string;
  completed_at: string | null;
  cancelled_at: string | null;
  archived_at: string | null;
  updated_at: string;
};

type ActivityDomain = "Jornada" | "Mobilidade" | "Hospedagem" | "Eventos" | "Comunicação";
type RawActivity = { id: string; operation_id: string | null; event_type: string; occurred_at: string };
type ActivityItem = {
  id: string;
  operationId: string;
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

const STATUS_ORDER: OperationStatus[] = ["active", "ready", "planning", "draft", "completed", "cancelled"];

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

export function OperationalDashboard() {
  const { tenant, role } = useTenant();
  const tenantId = tenant?.id;

  const dashboard = useQuery({
    queryKey: ["command-center-v1", tenantId],
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
        messageRecipientsResult,
        messageDeliveriesResult,
        communicationEventsResult,
      ] = await Promise.all([
        supabase
          .from("operations")
          .select("id,name,code,status,planned_start,planned_end,completed_at,cancelled_at,archived_at,updated_at")
          .eq("tenant_id", tenantId!)
          .order("planned_start", { ascending: false }),
        supabase
          .from("operation_participations")
          .select("id,operation_id,participation_kind,status,cancelled_at")
          .eq("tenant_id", tenantId!),
        supabase
          .from("journey_events")
          .select("id,operation_id,event_type,occurred_at")
          .eq("tenant_id", tenantId!)
          .order("occurred_at", { ascending: false })
          .limit(40),
        supabase.from("transport_legs").select("id,operation_id,planned_departure,planned_arrival").eq("tenant_id", tenantId!),
        supabase
          .from("transport_events")
          .select("id,operation_id,transport_leg_id,event_type,occurred_at")
          .eq("tenant_id", tenantId!)
          .order("occurred_at", { ascending: false })
          .limit(80),
        supabase
          .from("hospitality_stays")
          .select("id,operation_id,status,planned_check_in,planned_check_out")
          .eq("tenant_id", tenantId!),
        supabase
          .from("hospitality_events")
          .select("id,operation_id,event_type,occurred_at")
          .eq("tenant_id", tenantId!)
          .order("occurred_at", { ascending: false })
          .limit(40),
        supabase.from("events").select("id,operation_id,status,closed_out_at").eq("tenant_id", tenantId!),
        supabase
          .from("event_runtime_events")
          .select("id,operation_id,event_type,occurred_at")
          .eq("tenant_id", tenantId!)
          .order("occurred_at", { ascending: false })
          .limit(40),
        supabase
          .from("messages")
          .select("id,operation_id,status,published_at,recipient_count,in_app_reachable_count")
          .eq("tenant_id", tenantId!),
        supabase
          .from("message_recipients")
          .select("id,message_id,in_app_eligible,first_read_at")
          .eq("tenant_id", tenantId!),
        supabase.from("message_deliveries").select("id,message_id,status,delivered_at").eq("tenant_id", tenantId!),
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
        .filter(
          (operation) =>
            ["planning", "ready"].includes(operation.status) && new Date(operation.planned_start).getTime() >= now,
        )
        .sort((a, b) => new Date(a.planned_start).getTime() - new Date(b.planned_start).getTime())
        .slice(0, 5);

      const recentOperations = [...visibleOperations]
        .sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime())
        .slice(0, 5);

      const activeParticipations = (participationsResult.data ?? []).filter((item) => !item.cancelled_at);
      const participants = activeParticipations.filter((item) => item.participation_kind === "participant").length;
      const crew = activeParticipations.filter((item) => item.participation_kind === "crew").length;

      const alerts: Array<{ label: string; operationId?: string }> = [];
      for (const operation of visibleOperations) {
        if (operation.status === "active" && new Date(operation.planned_end).getTime() < now) {
          alerts.push({ label: `${operation.name}: operação ativa após o fim planejado`, operationId: operation.id });
        }
        const start = new Date(operation.planned_start).getTime();
        if (["planning", "ready"].includes(operation.status) && start >= now && start - now <= 86_400_000) {
          alerts.push({ label: `${operation.name}: inicia nas próximas 24 horas`, operationId: operation.id });
        }
      }

      const stays = hospitalityStaysResult.error ? null : (hospitalityStaysResult.data ?? []);
      if (stays) {
        for (const stay of stays.filter((item) => ["confirmed", "active"].includes(item.status))) {
          if (new Date(stay.planned_check_out).getTime() < now) {
            alerts.push({
              label: `${operationMap.get(stay.operation_id) ?? "Operação"}: hospedagem ainda aberta após o check-out planejado`,
              operationId: stay.operation_id,
            });
          }
        }
      }

      const transportLegs = transportLegsResult.error ? null : (transportLegsResult.data ?? []);
      const transportEvents = transportEventsResult.error ? null : (transportEventsResult.data ?? []);
      let punctuality: { samples: number; avgDelay: number; rate: number } | null = null;
      let departedLegs: number | null = null;
      let arrivedLegs: number | null = null;

      if (transportLegs && transportEvents) {
        const legMap = new Map(transportLegs.map((leg) => [leg.id, leg]));
        const departures = transportEvents.filter((event) => event.event_type === "LEG_DEPARTED");
        const arrivals = transportEvents.filter((event) => event.event_type === "DESTINATION_ARRIVED");
        departedLegs = new Set(departures.map((event) => event.transport_leg_id)).size;
        arrivedLegs = new Set(arrivals.map((event) => event.transport_leg_id)).size;
        const delaySamples = departures
          .map((event) => {
            const leg = event.transport_leg_id ? legMap.get(event.transport_leg_id) : undefined;
            return leg?.planned_departure ? minutesBetween(event.occurred_at, leg.planned_departure) : null;
          })
          .filter((value): value is number => value !== null);
        if (delaySamples.length > 0) {
          const onTime = delaySamples.filter((delay) => delay <= 5).length;
          punctuality = {
            samples: delaySamples.length,
            avgDelay: Math.round(delaySamples.reduce((sum, value) => sum + value, 0) / delaySamples.length),
            rate: Math.round((onTime / delaySamples.length) * 100),
          };
        }
      }

      const messages = messagesResult.error ? null : (messagesResult.data ?? []);
      const recipients = messageRecipientsResult.error ? null : (messageRecipientsResult.data ?? []);
      const deliveries = messageDeliveriesResult.error ? null : (messageDeliveriesResult.data ?? []);
      const communication =
        messages && recipients && deliveries
          ? (() => {
              const publishedIds = new Set(messages.filter((message) => message.status === "published").map((message) => message.id));
              const scopedRecipients = recipients.filter((recipient) => publishedIds.has(recipient.message_id));
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

      const events = eventsResult.error ? null : (eventsResult.data ?? []);
      const eventRuntime = eventRuntimeResult.error ? null : (eventRuntimeResult.data ?? []);
      const eventSummary =
        events && eventRuntime
          ? {
              total: events.length,
              closed: events.filter((event) => event.status === "closed_out").length,
              sessionsCompleted: eventRuntime.filter((event) => event.event_type === "SESSION_COMPLETED").length,
            }
          : null;

      const hospitalitySummary = stays
        ? {
            total: stays.length,
            active: stays.filter((stay) => stay.status === "active").length,
            confirmed: stays.filter((stay) => stay.status === "confirmed").length,
            completed: stays.filter((stay) => stay.status === "completed").length,
          }
        : null;

      const activitySources: Array<{ domain: ActivityDomain; rows: RawActivity[] }> = [
        { domain: "Jornada", rows: journeyEventsResult.error ? [] : (journeyEventsResult.data ?? []) },
        { domain: "Mobilidade", rows: transportEventsResult.error ? [] : (transportEventsResult.data ?? []) },
        { domain: "Hospedagem", rows: hospitalityEventsResult.error ? [] : (hospitalityEventsResult.data ?? []) },
        { domain: "Eventos", rows: eventRuntimeResult.error ? [] : (eventRuntimeResult.data ?? []) },
        { domain: "Comunicação", rows: communicationEventsResult.error ? [] : (communicationEventsResult.data ?? []) },
      ];

      const recentActivity: ActivityItem[] = activitySources
        .flatMap(({ domain, rows }) =>
          rows.flatMap((row) => {
            if (!row.operation_id) return [];
            return [{
              id: `${domain}-${row.id}`,
              operationId: row.operation_id,
              operationName: operationMap.get(row.operation_id) ?? "Operação",
              domain,
              type: row.event_type,
              occurredAt: row.occurred_at,
            }];
          }),
        )
        .sort((a, b) => new Date(b.occurredAt).getTime() - new Date(a.occurredAt).getTime())
        .slice(0, 12);

      return {
        operations: visibleOperations,
        statusCounts,
        upcoming,
        recentOperations,
        participation: { total: activeParticipations.length, participants, crew },
        alerts,
        punctuality,
        mobility: transportLegs ? { total: transportLegs.length, departed: departedLegs ?? 0, arrived: arrivedLegs ?? 0 } : null,
        hospitality: hospitalitySummary,
        events: eventSummary,
        communication,
        recentActivity,
      };
    },
  });

  if (dashboard.isLoading) {
    return <section className="surface-panel p-6 text-sm text-muted-foreground">Carregando indicadores reais…</section>;
  }
  if (dashboard.isError || !dashboard.data) {
    return (
      <section className="surface-panel border-destructive/30 p-6" role="alert">
        <p className="font-semibold text-destructive">Não foi possível carregar o dashboard.</p>
        <p className="mt-1 text-sm text-muted-foreground">Nenhum número é estimado. Tente novamente para consultar os dados reais da organização.</p>
        <Button type="button" variant="outline" className="mt-3" onClick={() => void dashboard.refetch()}>Tentar novamente</Button>
      </section>
    );
  }

  const data = dashboard.data;
  const maxStatusCount = Math.max(1, ...STATUS_ORDER.map((status) => data.statusCounts[status]));
  const kpis = [
    { icon: Activity, label: "Em execução", value: data.statusCounts.active, helper: `${data.operations.length} operação(ões) não arquivada(s)` },
    { icon: CalendarClock, label: "Próximas operações", value: data.upcoming.length, helper: "Planejamento ou pronto com início futuro" },
    { icon: Users, label: "Pessoas envolvidas", value: data.participation.total, helper: `${data.participation.participants} participante(s) · ${data.participation.crew} equipe` },
    { icon: AlertTriangle, label: "Atenções objetivas", value: data.alerts.length, helper: "Somente regras derivadas de datas e estados reais" },
  ];

  return (
    <div className="space-y-6">
      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4" aria-label="KPIs principais">
        {kpis.map(({ icon: Icon, label, value, helper }) => (
          <article key={label} className="surface-panel p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">{label}</p>
                <p className="mt-2 text-3xl font-semibold tabular-nums">{value}</p>
              </div>
              <span className="grid size-10 place-items-center rounded-lg bg-primary-soft text-primary"><Icon className="size-4" /></span>
            </div>
            <p className="mt-3 text-xs text-muted-foreground">{helper}</p>
          </article>
        ))}
      </section>

      <section className="grid gap-6 xl:grid-cols-[1.05fr_0.95fr]">
        <article className="surface-panel p-5">
          <div className="flex items-center justify-between gap-3">
            <div><h3 className="text-base font-semibold">Operações por estado</h3><p className="mt-1 text-sm text-muted-foreground">Distribuição real das operações não arquivadas.</p></div>
            <Button asChild variant="outline" size="sm"><Link to="/operations">Abrir operações</Link></Button>
          </div>
          <div className="mt-5 space-y-3">
            {STATUS_ORDER.map((status) => {
              const value = data.statusCounts[status];
              const width = value === 0 ? 0 : Math.max(8, (value / maxStatusCount) * 100);
              return (
                <div key={status} className="grid grid-cols-[112px_1fr_32px] items-center gap-3 text-sm">
                  <span className="text-muted-foreground">{STATUS_LABEL[status]}</span>
                  <div className="h-2 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full bg-primary" style={{ width: `${width}%` }} /></div>
                  <span className="text-right font-mono tabular-nums">{value}</span>
                </div>
              );
            })}
          </div>
        </article>

        <article className="surface-panel p-5">
          <h3 className="text-base font-semibold">Atenções operacionais</h3>
          <p className="mt-1 text-sm text-muted-foreground">Alertas determinísticos, sem inferência subjetiva.</p>
          <div className="mt-4 space-y-2">
            {data.alerts.length === 0 ? <NoData text="Nenhuma atenção objetiva detectada agora." /> : data.alerts.slice(0, 6).map((alert) => (
              <div key={alert.label} className="flex items-start gap-3 rounded-lg border p-3 text-sm">
                <AlertTriangle className="mt-0.5 size-4 shrink-0 text-primary" />
                <div className="min-w-0 flex-1"><p>{alert.label}</p>{alert.operationId ? <Link to="/operations/$operationId" params={{ operationId: alert.operationId }} className="mt-1 inline-flex items-center gap-1 text-xs text-primary hover:underline">Abrir operação <ArrowRight className="size-3" /></Link> : null}</div>
              </div>
            ))}
          </div>
        </article>
      </section>

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <DomainCard icon={Gauge} title="Desempenho operacional" rows={data.punctuality ? [["Amostras de partida", String(data.punctuality.samples)], ["Pontuais (≤ 5 min)", `${data.punctuality.rate}%`], ["Atraso médio", `${data.punctuality.avgDelay} min`]] : null} />
        <DomainCard icon={RouteIcon} title="Mobilidade" rows={data.mobility ? [["Trechos", String(data.mobility.total)], ["Partiram", String(data.mobility.departed)], ["Chegaram", String(data.mobility.arrived)]] : null} />
        <DomainCard icon={BedDouble} title="Hospedagem" rows={data.hospitality ? [["Hospedagens", String(data.hospitality.total)], ["Ativas / confirmadas", String(data.hospitality.active + data.hospitality.confirmed)], ["Encerradas", String(data.hospitality.completed)]] : null} />
        <DomainCard icon={CalendarClock} title="Eventos" rows={data.events ? [["Eventos", String(data.events.total)], ["Encerrados", String(data.events.closed)], ["Sessões concluídas", String(data.events.sessionsCompleted)]] : null} />
      </section>

      <section className="grid gap-6 xl:grid-cols-[0.9fr_1.1fr]">
        <article className="surface-panel p-5">
          <h3 className="flex items-center gap-2 text-base font-semibold"><Megaphone className="size-4" /> Comunicação</h3>
          <p className="mt-1 text-sm text-muted-foreground">Publicação, entrega e leitura registradas como fatos.</p>
          {data.communication ? <div className="mt-5 grid grid-cols-2 gap-3"><MiniMetric label="Publicadas" value={data.communication.published} /><MiniMetric label="Entregas" value={data.communication.deliveries} /><MiniMetric label="Leituras" value={data.communication.reads} /><MiniMetric label="Taxa de leitura" value={data.communication.readRate === null ? "—" : `${data.communication.readRate}%`} /></div> : <NoData />}
        </article>
        <article className="surface-panel p-5">
          <h3 className="text-base font-semibold">Próximas e recentes</h3>
          <div className="mt-4 grid gap-5 md:grid-cols-2"><OperationList title="Próximas operações" operations={data.upcoming} /><OperationList title="Atualizadas recentemente" operations={data.recentOperations} /></div>
        </article>
      </section>

      <article className="surface-panel p-5">
        <div className="flex items-center justify-between gap-3"><div><h3 className="text-base font-semibold">Atividade recente</h3><p className="mt-1 text-sm text-muted-foreground">Fatos mais recentes registrados pelos domínios operacionais.</p></div><Clock3 className="size-4 text-muted-foreground" /></div>
        <div className="mt-4 divide-y">{data.recentActivity.length === 0 ? <NoData /> : data.recentActivity.map((item) => <div key={item.id} className="grid gap-1 py-3 sm:grid-cols-[120px_1fr_auto] sm:items-center sm:gap-4"><span className="text-xs font-medium text-primary">{item.domain}</span><div className="min-w-0"><p className="truncate text-sm font-medium">{item.operationName}</p><p className="truncate font-mono text-[11px] text-muted-foreground">{item.type}</p></div><time className="text-xs text-muted-foreground">{formatDateTime(item.occurredAt)}</time></div>)}</div>
      </article>

      <section className="surface-panel flex flex-wrap items-center justify-between gap-3 p-4">
        <div className="flex items-center gap-3"><Building2 className="size-4 text-primary" /><div><p className="text-sm font-medium">{tenant?.name ?? "Organização"}</p><p className="text-xs text-muted-foreground">Papel atual: {role ?? "—"} · dados atualizados automaticamente</p></div></div>
        <div className="flex gap-2"><Button asChild variant="outline" size="sm"><Link to="/people">Pessoas</Link></Button><Button asChild variant="outline" size="sm"><Link to="/operations">Operações</Link></Button></div>
      </section>
    </div>
  );
}

function DomainCard({ icon: Icon, title, rows }: { icon: typeof Activity; title: string; rows: Array<[string, string]> | null }) {
  return <article className="surface-panel p-4"><div className="flex items-center justify-between gap-3"><span className="grid size-9 place-items-center rounded-lg bg-primary-soft text-primary"><Icon className="size-4" /></span><Button asChild variant="ghost" size="sm"><Link to="/operations">Abrir</Link></Button></div><h3 className="mt-4 font-semibold">{title}</h3>{rows ? <dl className="mt-3 space-y-2">{rows.map(([label, value]) => <div key={label} className="flex items-center justify-between gap-3 text-sm"><dt className="text-muted-foreground">{label}</dt><dd className="font-medium tabular-nums">{value}</dd></div>)}</dl> : <NoData />}</article>;
}

function MiniMetric({ label, value }: { label: string; value: string | number }) {
  return <div className="rounded-lg border p-3"><p className="text-xs text-muted-foreground">{label}</p><p className="mt-1 text-2xl font-semibold tabular-nums">{value}</p></div>;
}

function NoData({ text = "Sem dados suficientes." }: { text?: string }) {
  return <p className="mt-4 rounded-lg border border-dashed p-3 text-sm text-muted-foreground">{text}</p>;
}

function OperationList({ title, operations }: { title: string; operations: OperationRow[] }) {
  return <div><p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{title}</p><div className="mt-2 space-y-2">{operations.length === 0 ? <p className="text-sm text-muted-foreground">Nenhuma operação neste recorte.</p> : operations.map((operation) => <Link key={operation.id} to="/operations/$operationId" params={{ operationId: operation.id }} className="block rounded-lg border p-3 transition-colors hover:bg-muted/40"><div className="flex items-start justify-between gap-3"><div className="min-w-0"><p className="truncate text-sm font-medium">{operation.name}</p><p className="mt-1 text-xs text-muted-foreground">{formatDateTime(operation.planned_start)}</p></div><span className="shrink-0 text-[10px] font-semibold uppercase text-primary">{STATUS_LABEL[operation.status]}</span></div></Link>)}</div></div>;
}

export function DashboardHeader() {
  return <section className="animate-rise flex flex-wrap items-end justify-between gap-4"><div><p className="font-mono text-[10px] uppercase tracking-[0.16em] text-primary">Inteligência operacional</p><h2 className="mt-1 text-2xl font-semibold lg:text-3xl">Centro de comando</h2><p className="mt-2 max-w-3xl text-sm text-muted-foreground">Dados reais do tenant atual. O COBS mostra estado, atenção e evidência — nunca números simulados.</p></div><div className="flex items-center gap-2 rounded-lg border px-3 py-2 text-xs text-muted-foreground"><CheckCircle2 className="size-4 text-primary" /> Atualização automática a cada 60 s</div></section>;
}
