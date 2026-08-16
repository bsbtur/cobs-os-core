import { useLocation } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import {
  BedDouble,
  Bus,
  CalendarDays,
  CheckCircle2,
  ClipboardCheck,
  Flag,
  MapPin,
  MessageSquare,
  Route,
  Users,
} from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { useI18n } from "@/lib/i18n";

type Domain =
  | "operation"
  | "journey"
  | "visit_points"
  | "presence"
  | "checklist"
  | "mobility"
  | "hospitality"
  | "events"
  | "communication";

type TimelineItem = {
  id: string;
  domain: Domain;
  label: string;
  occurredAt: string;
  note?: string | null;
  context?: string | null;
};

type ParticipationContext = {
  id: string;
  people: { full_name: string } | null;
};

const copy = (locale: string, pt: string, en: string) =>
  locale.toLowerCase().startsWith("pt") ? pt : en;

const quote = (value?: string | null) => (value ? `“${value}”` : null);

const fallback = (value: string | null | undefined, locale: string) => {
  if (!value) return copy(locale, "Evento registrado", "Event recorded");
  return value
    .toLowerCase()
    .replaceAll("_", " ")
    .replace(/^./, (char) => char.toUpperCase());
};

function journeyPhrase(type: string, locale: string, step?: string | null) {
  const subjectPt = step ? `Etapa ${quote(step)}` : "Etapa";
  const subjectEn = step ? `Step ${quote(step)}` : "Step";
  const targetPt = quote(step) ?? "etapa";
  const targetEn = quote(step) ?? "step";

  const pt: Record<string, string> = {
    STARTED: `${subjectPt} iniciada`,
    STEP_STARTED: `${subjectPt} iniciada`,
    ARRIVED: `Chegada registrada em ${targetPt}`,
    COMPLETED: `${subjectPt} concluída`,
    STEP_COMPLETED: `${subjectPt} concluída`,
    BOARDING_STARTED: `Embarque iniciado em ${targetPt}`,
    BOARDING_COMPLETED: `Embarque concluído em ${targetPt}`,
    DEPARTURE_AUTHORIZED: `Saída autorizada em ${targetPt}`,
    DEPARTED: `O grupo iniciou o deslocamento em ${targetPt}`,
    DISEMBARKATION_COMPLETED: `Desembarque concluído em ${targetPt}`,
    CANCELLED: `${subjectPt} cancelada`,
    STEP_CANCELLED: `${subjectPt} cancelada`,
    SKIPPED: `${subjectPt} ignorada`,
    STEP_SKIPPED: `${subjectPt} ignorada`,
  };

  const en: Record<string, string> = {
    STARTED: `${subjectEn} started`,
    STEP_STARTED: `${subjectEn} started`,
    ARRIVED: `Arrival recorded at ${targetEn}`,
    COMPLETED: `${subjectEn} completed`,
    STEP_COMPLETED: `${subjectEn} completed`,
    BOARDING_STARTED: `Boarding started at ${targetEn}`,
    BOARDING_COMPLETED: `Boarding completed at ${targetEn}`,
    DEPARTURE_AUTHORIZED: `Departure authorized at ${targetEn}`,
    DEPARTED: `Group departed from ${targetEn}`,
    DISEMBARKATION_COMPLETED: `Disembarkation completed at ${targetEn}`,
    CANCELLED: `${subjectEn} cancelled`,
    STEP_CANCELLED: `${subjectEn} cancelled`,
    SKIPPED: `${subjectEn} skipped`,
    STEP_SKIPPED: `${subjectEn} skipped`,
  };

  const map = locale.toLowerCase().startsWith("pt") ? pt : en;
  return map[type] ?? `${fallback(type, locale)}${step ? ` · ${step}` : ""}`;
}

function visitPointPhrase(type: string, locale: string, point?: string | null) {
  const target = quote(point) ?? copy(locale, "ponto da visita", "visit point");
  const pt: Record<string, string> = {
    VISITED: `Ponto ${target} apresentado`,
    UNAVAILABLE: `Ponto ${target} marcado como indisponível`,
    IGNORED: `Ponto ${target} ignorado`,
    RESTORED: `Ponto ${target} restaurado como disponível`,
  };
  const en: Record<string, string> = {
    VISITED: `Visit point ${target} presented`,
    UNAVAILABLE: `Visit point ${target} marked unavailable`,
    IGNORED: `Visit point ${target} skipped`,
    RESTORED: `Visit point ${target} restored as available`,
  };
  const map = locale.toLowerCase().startsWith("pt") ? pt : en;
  return map[type] ?? `${fallback(type, locale)} · ${point ?? "Visit point"}`;
}

function presencePhrase(
  type: string,
  locale: string,
  person?: string | null,
  step?: string | null,
) {
  const who = person ?? copy(locale, "Viajante", "Traveler");
  const where = step ? ` · ${step}` : "";
  const pt: Record<string, string> = {
    PRESENT_AT_MEETING_POINT: `${who} chegou ao ponto de encontro${where}`,
    ABSENCE_NOTED: `Ausência registrada para ${who}${where}`,
    NO_SHOW_CONFIRMED: `No-show confirmado para ${who}${where}`,
    BOARDED: `${who} embarcou${where}`,
    DISEMBARKED: `${who} desembarcou${where}`,
    PRESENCE_RETRACTED: `Registro de presença de ${who} foi corrigido/retraído${where}`,
  };
  const en: Record<string, string> = {
    PRESENT_AT_MEETING_POINT: `${who} arrived at the meeting point${where}`,
    ABSENCE_NOTED: `Absence recorded for ${who}${where}`,
    NO_SHOW_CONFIRMED: `No-show confirmed for ${who}${where}`,
    BOARDED: `${who} boarded${where}`,
    DISEMBARKED: `${who} disembarked${where}`,
    PRESENCE_RETRACTED: `${who}'s presence record was corrected/retracted${where}`,
  };
  const map = locale.toLowerCase().startsWith("pt") ? pt : en;
  return map[type] ?? `${fallback(type, locale)} · ${who}${where}`;
}

function checklistPhrase(
  action: string,
  locale: string,
  item?: string | null,
  step?: string | null,
) {
  const target = quote(item) ?? copy(locale, "item do checklist", "checklist item");
  const where = step ? ` · ${step}` : "";
  const pt: Record<string, string> = {
    COMPLETED: `Checklist ${target} concluído${where}`,
    CHECKED: `Checklist ${target} concluído${where}`,
    UNDONE: `Checklist ${target} reaberto${where}`,
    REOPENED: `Checklist ${target} reaberto${where}`,
    SKIPPED: `Checklist ${target} ignorado${where}`,
  };
  const en: Record<string, string> = {
    COMPLETED: `Checklist ${target} completed${where}`,
    CHECKED: `Checklist ${target} completed${where}`,
    UNDONE: `Checklist ${target} reopened${where}`,
    REOPENED: `Checklist ${target} reopened${where}`,
    SKIPPED: `Checklist ${target} skipped${where}`,
  };
  const map = locale.toLowerCase().startsWith("pt") ? pt : en;
  return map[action] ?? `${fallback(action, locale)} · ${item ?? "Checklist"}${where}`;
}

function mobilityPhrase(type: string, locale: string, leg?: string | null) {
  const target = quote(leg) ?? copy(locale, "deslocamento", "transport leg");
  const pt: Record<string, string> = {
    DISPATCHED: `${target} saiu para o deslocamento`,
    DEPARTED: `${target} iniciou o deslocamento`,
    ARRIVED: `${target} chegou ao destino`,
    DRIVER_ASSIGNED: `Motorista atribuído a ${target}`,
    VEHICLE_ASSIGNED: `Veículo atribuído a ${target}`,
    BOARDING_STARTED: `Embarque iniciado para ${target}`,
    INCIDENT_RECORDED: `Incidente registrado em ${target}`,
  };
  const en: Record<string, string> = {
    DISPATCHED: `${target} dispatched`,
    DEPARTED: `${target} departed`,
    ARRIVED: `${target} arrived at destination`,
    DRIVER_ASSIGNED: `Driver assigned to ${target}`,
    VEHICLE_ASSIGNED: `Vehicle assigned to ${target}`,
    BOARDING_STARTED: `Boarding started for ${target}`,
    INCIDENT_RECORDED: `Incident recorded on ${target}`,
  };
  const map = locale.toLowerCase().startsWith("pt") ? pt : en;
  return (
    map[type] ?? `${fallback(type, locale)} · ${leg ?? copy(locale, "Mobilidade", "Mobility")}`
  );
}

function hospitalityPhrase(type: string, locale: string, stay?: string | null) {
  const target = quote(stay) ?? copy(locale, "hospedagem", "stay");
  const pt: Record<string, string> = {
    CHECKIN_OPENED: `Check-in aberto em ${target}`,
    GUEST_CHECKED_IN: `Hóspede realizou check-in em ${target}`,
    GUEST_CHECKED_OUT: `Hóspede realizou checkout em ${target}`,
    CHECKOUT_COMPLETED: `Checkout concluído em ${target}`,
    COMPLETED: `${target} concluída`,
    ISSUE_RECORDED: `Pendência registrada em ${target}`,
    ROOM_RELEASED: `Quarto liberado em ${target}`,
  };
  const en: Record<string, string> = {
    CHECKIN_OPENED: `Check-in opened at ${target}`,
    GUEST_CHECKED_IN: `Guest checked in at ${target}`,
    GUEST_CHECKED_OUT: `Guest checked out at ${target}`,
    CHECKOUT_COMPLETED: `Checkout completed at ${target}`,
    COMPLETED: `${target} completed`,
    ISSUE_RECORDED: `Issue recorded at ${target}`,
    ROOM_RELEASED: `Room released at ${target}`,
  };
  const map = locale.toLowerCase().startsWith("pt") ? pt : en;
  return (
    map[type] ?? `${fallback(type, locale)} · ${stay ?? copy(locale, "Hospedagem", "Hospitality")}`
  );
}

function eventPhrase(type: string, locale: string, event?: string | null, session?: string | null) {
  const target = quote(session ?? event) ?? copy(locale, "evento", "event");
  const pt: Record<string, string> = {
    EVENT_STARTED: `${target} iniciado`,
    EVENT_COMPLETED: `${target} concluído`,
    SESSION_STARTED: `Sessão ${target} iniciada`,
    SESSION_COMPLETED: `Sessão ${target} concluída`,
    STARTED: `${target} iniciado`,
    COMPLETED: `${target} concluído`,
  };
  const en: Record<string, string> = {
    EVENT_STARTED: `${target} started`,
    EVENT_COMPLETED: `${target} completed`,
    SESSION_STARTED: `Session ${target} started`,
    SESSION_COMPLETED: `Session ${target} completed`,
    STARTED: `${target} started`,
    COMPLETED: `${target} completed`,
  };
  const map = locale.toLowerCase().startsWith("pt") ? pt : en;
  return (
    map[type] ??
    `${fallback(type, locale)} · ${session ?? event ?? copy(locale, "Eventos", "Events")}`
  );
}

function communicationPhrase(
  type: string,
  locale: string,
  message?: string | null,
  person?: string | null,
) {
  const target = quote(message) ?? copy(locale, "mensagem", "message");
  const recipient = person ? copy(locale, ` por ${person}`, ` by ${person}`) : "";
  const pt: Record<string, string> = {
    PUBLISHED: `${target} publicada`,
    RECIPIENT_MATERIALIZED: `Destinatário definido para ${target}`,
    DELIVERED: `${target} entregue${recipient}`,
    READ: `${target} lida${recipient}`,
    CANCELLED: `${target} cancelada`,
  };
  const en: Record<string, string> = {
    PUBLISHED: `${target} published`,
    RECIPIENT_MATERIALIZED: `Recipient resolved for ${target}`,
    DELIVERED: `${target} delivered${recipient}`,
    READ: `${target} read${recipient}`,
    CANCELLED: `${target} cancelled`,
  };
  const map = locale.toLowerCase().startsWith("pt") ? pt : en;
  return (
    map[type] ??
    `${fallback(type, locale)} · ${message ?? copy(locale, "Comunicação", "Communication")}`
  );
}

export function OperationHistoryTimeline({ operationId }: { operationId: string }) {
  const location = useLocation();
  const { locale } = useI18n();
  const path = `/operations/${operationId}`;
  const isOverview = location.pathname === path || location.pathname === `${path}/`;

  const query = useQuery({
    queryKey: ["px09-operation-history-human", operationId, locale],
    enabled: isOverview,
    queryFn: async () => {
      const eventIds =
        (await supabase.from("events").select("id").eq("operation_id", operationId)).data?.map(
          (row) => row.id,
        ) ?? [];

      const [
        operationAudit,
        journey,
        visitPointEvents,
        visitPoints,
        presence,
        checklist,
        mobility,
        hospitality,
        events,
        communication,
        steps,
        roster,
        items,
        legs,
        stays,
        eventDefs,
        sessions,
        messages,
      ] = await Promise.all([
        supabase
          .from("audit_events")
          .select("id,action,subject_id,occurred_at,metadata")
          .eq("subject_type", "operation")
          .eq("subject_id", operationId)
          .eq("action", "operation.completed"),
        supabase
          .from("journey_events")
          .select("id,journey_step_id,event_type,occurred_at,note")
          .eq("operation_id", operationId),
        supabase
          .from("journey_visit_point_events")
          .select("id,journey_step_id,visit_point_id,event_type,occurred_at,note")
          .eq("operation_id", operationId),
        supabase
          .from("journey_visit_points")
          .select("id,title,journey_step_id")
          .eq("operation_id", operationId),
        supabase
          .from("participant_presence_events")
          .select(
            "id,participation_id,journey_step_id,presence_fact,occurred_at,note,retracts_presence_event_id",
          )
          .eq("operation_id", operationId),
        supabase
          .from("playbook_executions")
          .select("id,playbook_item_id,journey_step_id,execution_action,occurred_at,note")
          .eq("operation_id", operationId),
        supabase
          .from("transport_events")
          .select("id,transport_leg_id,event_type,occurred_at,note")
          .eq("operation_id", operationId),
        supabase
          .from("hospitality_events")
          .select("id,stay_id,event_type,occurred_at,note")
          .eq("operation_id", operationId),
        supabase
          .from("event_runtime_events")
          .select("id,event_id,session_id,event_type,occurred_at,note")
          .eq("operation_id", operationId),
        supabase
          .from("communication_events")
          .select("id,message_id,person_id,event_type,occurred_at")
          .eq("operation_id", operationId),
        supabase.from("journey_steps").select("id,title").eq("operation_id", operationId),
        supabase
          .from("operation_participations")
          .select("id,people(full_name)")
          .eq("operation_id", operationId),
        supabase.from("playbook_items").select("id,title").eq("operation_id", operationId),
        supabase
          .from("transport_legs")
          .select("id,title,origin_label,destination_label")
          .eq("operation_id", operationId),
        supabase.from("hospitality_stays").select("id,name").eq("operation_id", operationId),
        supabase.from("events").select("id,name").eq("operation_id", operationId),
        eventIds.length
          ? supabase.from("event_sessions").select("id,title,event_id").in("event_id", eventIds)
          : Promise.resolve({ data: [], error: null }),
        supabase.from("messages").select("id,title").eq("operation_id", operationId),
      ]);

      const results = [
        operationAudit,
        journey,
        visitPointEvents,
        visitPoints,
        presence,
        checklist,
        mobility,
        hospitality,
        events,
        communication,
        steps,
        roster,
        items,
        legs,
        stays,
        eventDefs,
        sessions,
        messages,
      ];
      for (const result of results) if (result.error) throw result.error;

      const stepName = new Map((steps.data ?? []).map((row) => [row.id, row.title]));
      const pointName = new Map((visitPoints.data ?? []).map((row) => [row.id, row.title]));
      const personName = new Map(
        ((roster.data ?? []) as unknown as ParticipationContext[]).map((row) => [
          row.id,
          row.people?.full_name ?? copy(locale, "Viajante", "Traveler"),
        ]),
      );
      const itemName = new Map((items.data ?? []).map((row) => [row.id, row.title]));
      const legName = new Map(
        (legs.data ?? []).map((row) => [
          row.id,
          row.title ||
            `${row.origin_label ?? copy(locale, "Origem", "Origin")} → ${row.destination_label ?? copy(locale, "Destino", "Destination")}`,
        ]),
      );
      const stayName = new Map((stays.data ?? []).map((row) => [row.id, row.name]));
      const eventName = new Map((eventDefs.data ?? []).map((row) => [row.id, row.name]));
      const sessionName = new Map((sessions.data ?? []).map((row) => [row.id, row.title]));
      const messageName = new Map((messages.data ?? []).map((row) => [row.id, row.title]));

      const directPersonIds = [
        ...new Set((communication.data ?? []).map((row) => row.person_id).filter(Boolean)),
      ] as string[];
      const directPeople = directPersonIds.length
        ? await supabase.from("people").select("id,full_name").in("id", directPersonIds)
        : { data: [], error: null };
      if (directPeople.error) throw directPeople.error;
      const directPersonName = new Map(
        (directPeople.data ?? []).map((row) => [row.id, row.full_name]),
      );

      const timeline: TimelineItem[] = [
        ...(operationAudit.data ?? []).map((row) => ({
          id: row.id,
          domain: "operation" as const,
          label: copy(locale, "Operação concluída", "Operation completed"),
          occurredAt: row.occurred_at,
          note: null,
          context: null,
        })),
        ...(journey.data ?? []).map((row) => ({
          id: row.id,
          domain: "journey" as const,
          label: journeyPhrase(row.event_type, locale, stepName.get(row.journey_step_id ?? "")),
          occurredAt: row.occurred_at,
          note: row.note,
          context: stepName.get(row.journey_step_id ?? "") ?? null,
        })),
        ...(visitPointEvents.data ?? []).map((row) => ({
          id: row.id,
          domain: "visit_points" as const,
          label: visitPointPhrase(row.event_type, locale, pointName.get(row.visit_point_id ?? "")),
          occurredAt: row.occurred_at,
          note: row.note,
          context:
            pointName.get(row.visit_point_id ?? "") ??
            stepName.get(row.journey_step_id ?? "") ??
            null,
        })),
        ...(presence.data ?? []).map((row) => ({
          id: row.id,
          domain: "presence" as const,
          label: presencePhrase(
            row.presence_fact,
            locale,
            personName.get(row.participation_id ?? ""),
            stepName.get(row.journey_step_id ?? ""),
          ),
          occurredAt: row.occurred_at,
          note: row.note,
          context: personName.get(row.participation_id ?? "") ?? null,
        })),
        ...(checklist.data ?? []).map((row) => ({
          id: row.id,
          domain: "checklist" as const,
          label: checklistPhrase(
            row.execution_action,
            locale,
            itemName.get(row.playbook_item_id ?? ""),
            stepName.get(row.journey_step_id ?? ""),
          ),
          occurredAt: row.occurred_at,
          note: row.note,
          context: itemName.get(row.playbook_item_id ?? "") ?? null,
        })),
        ...(mobility.data ?? []).map((row) => ({
          id: row.id,
          domain: "mobility" as const,
          label: mobilityPhrase(row.event_type, locale, legName.get(row.transport_leg_id ?? "")),
          occurredAt: row.occurred_at,
          note: row.note,
          context: legName.get(row.transport_leg_id ?? "") ?? null,
        })),
        ...(hospitality.data ?? []).map((row) => ({
          id: row.id,
          domain: "hospitality" as const,
          label: hospitalityPhrase(row.event_type, locale, stayName.get(row.stay_id ?? "")),
          occurredAt: row.occurred_at,
          note: row.note,
          context: stayName.get(row.stay_id ?? "") ?? null,
        })),
        ...(events.data ?? []).map((row) => ({
          id: row.id,
          domain: "events" as const,
          label: eventPhrase(
            row.event_type,
            locale,
            eventName.get(row.event_id ?? ""),
            sessionName.get(row.session_id ?? ""),
          ),
          occurredAt: row.occurred_at,
          note: row.note,
          context:
            sessionName.get(row.session_id ?? "") ?? eventName.get(row.event_id ?? "") ?? null,
        })),
        ...(communication.data ?? []).map((row) => ({
          id: row.id,
          domain: "communication" as const,
          label: communicationPhrase(
            row.event_type,
            locale,
            messageName.get(row.message_id ?? ""),
            directPersonName.get(row.person_id ?? ""),
          ),
          occurredAt: row.occurred_at,
          note: null,
          context: messageName.get(row.message_id ?? "") ?? null,
        })),
      ].sort((a, b) => new Date(a.occurredAt).getTime() - new Date(b.occurredAt).getTime());

      return timeline;
    },
  });

  if (!isOverview) return null;
  if (query.isLoading) return <div className="surface-panel h-48 animate-pulse" />;
  if (query.isError) return null;

  const timeline = query.data ?? [];
  if (timeline.length === 0) return null;

  const domainMeta = {
    operation: { label: copy(locale, "Operação", "Operation"), icon: Flag },
    journey: { label: copy(locale, "Jornada", "Journey"), icon: Route },
    visit_points: { label: copy(locale, "Pontos da visita", "Visit points"), icon: MapPin },
    presence: { label: copy(locale, "Pessoas", "People"), icon: Users },
    checklist: { label: "Checklist", icon: ClipboardCheck },
    mobility: { label: copy(locale, "Mobilidade", "Mobility"), icon: Bus },
    hospitality: { label: copy(locale, "Hospedagem", "Hospitality"), icon: BedDouble },
    events: { label: copy(locale, "Eventos", "Events"), icon: CalendarDays },
    communication: { label: copy(locale, "Comunicação", "Communication"), icon: MessageSquare },
  } as const;

  const dateLocale = locale.toLowerCase().startsWith("pt") ? "pt-BR" : "en-US";

  return (
    <section
      className="surface-panel overflow-hidden"
      aria-label={copy(locale, "Histórico da operação", "Operation history")}
    >
      <div className="border-b border-border/70 px-5 py-4">
        <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-primary">
          PX09.1 · {copy(locale, "Histórico operacional", "Operational history")}
        </p>
        <div className="mt-1 flex items-center gap-2">
          <CheckCircle2 className="size-5 text-primary" aria-hidden="true" />
          <h2 className="text-xl font-semibold">
            {copy(locale, "Linha do tempo da operação", "Operation timeline")}
          </h2>
        </div>
        <p className="mt-1 text-sm text-muted-foreground">
          {copy(
            locale,
            "Fatos canônicos traduzidos para uma narrativa operacional legível.",
            "Canonical facts translated into a readable operational narrative.",
          )}
        </p>
      </div>

      <ol className="divide-y divide-border/60 px-5">
        {timeline.slice(-120).map((item) => {
          const meta = domainMeta[item.domain];
          const Icon = meta.icon;
          const date = new Date(item.occurredAt);
          return (
            <li key={`${item.domain}-${item.id}`} className="flex gap-3 py-3">
              <div className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full bg-primary-soft text-primary">
                <Icon className="size-4" aria-hidden="true" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold">{item.label}</p>
                    <p className="text-[11px] text-muted-foreground">{meta.label}</p>
                  </div>
                  <time
                    className="shrink-0 font-mono text-[10px] text-muted-foreground"
                    dateTime={item.occurredAt}
                  >
                    {date.toLocaleDateString(dateLocale)} ·{" "}
                    {date.toLocaleTimeString(dateLocale, { hour: "2-digit", minute: "2-digit" })}
                  </time>
                </div>
                {item.note ? (
                  <p className="mt-1 rounded-md bg-muted/50 px-2 py-1 text-xs text-muted-foreground">
                    {copy(locale, "Obs.", "Note")}: {item.note}
                  </p>
                ) : null}
              </div>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
