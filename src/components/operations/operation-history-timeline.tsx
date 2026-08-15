import { useLocation } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { BedDouble, Bus, CalendarDays, CheckCircle2, ClipboardCheck, MessageSquare, Route, Users } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";

type Domain = "journey" | "presence" | "checklist" | "mobility" | "hospitality" | "events" | "communication";
type TimelineItem = { id: string; domain: Domain; label: string; occurredAt: string; note?: string | null; context?: string | null };
type ParticipationContext = { id: string; people: { full_name: string } | null };

const domainMeta = {
  journey: { label: "Jornada", icon: Route },
  presence: { label: "Pessoas", icon: Users },
  checklist: { label: "Checklist", icon: ClipboardCheck },
  mobility: { label: "Mobilidade", icon: Bus },
  hospitality: { label: "Hospedagem", icon: BedDouble },
  events: { label: "Eventos", icon: CalendarDays },
  communication: { label: "Comunicação", icon: MessageSquare },
} as const;

const fallback = (value: string | null | undefined) => {
  if (!value) return "Evento registrado";
  return value.toLowerCase().replaceAll("_", " ").replace(/^./, (char) => char.toUpperCase());
};

const quote = (value?: string | null) => value ? `“${value}”` : null;

function journeyPhrase(type: string, step?: string | null) {
  const subject = step ? `Etapa ${quote(step)}` : "Etapa";
  const map: Record<string, string> = {
    STARTED: `${subject} iniciada`,
    ARRIVED: `Chegada registrada em ${quote(step) ?? "etapa"}`,
    COMPLETED: `${subject} concluída`,
    BOARDING_STARTED: `Embarque iniciado em ${quote(step) ?? "etapa"}`,
    CANCELLED: `${subject} cancelada`,
    SKIPPED: `${subject} ignorada`,
  };
  return map[type] ?? `${fallback(type)}${step ? ` · ${step}` : ""}`;
}

function presencePhrase(type: string, person?: string | null, step?: string | null) {
  const who = person ?? "Viajante";
  const where = step ? ` · ${step}` : "";
  const map: Record<string, string> = {
    PRESENT_AT_MEETING_POINT: `${who} chegou ao ponto de encontro${where}`,
    ABSENCE_NOTED: `Ausência registrada para ${who}${where}`,
    NO_SHOW_CONFIRMED: `No-show confirmado para ${who}${where}`,
    BOARDED: `${who} embarcou${where}`,
    DISEMBARKED: `${who} desembarcou${where}`,
    PRESENCE_RETRACTED: `Registro de presença de ${who} foi corrigido/retraído${where}`,
  };
  return map[type] ?? `${fallback(type)} · ${who}${where}`;
}

function checklistPhrase(action: string, item?: string | null, step?: string | null) {
  const target = quote(item) ?? "item do checklist";
  const where = step ? ` · ${step}` : "";
  const map: Record<string, string> = {
    COMPLETED: `Checklist ${target} concluído${where}`,
    CHECKED: `Checklist ${target} concluído${where}`,
    UNDONE: `Checklist ${target} reaberto${where}`,
    REOPENED: `Checklist ${target} reaberto${where}`,
    SKIPPED: `Checklist ${target} ignorado${where}`,
  };
  return map[action] ?? `${fallback(action)} · ${item ?? "Checklist"}${where}`;
}

function mobilityPhrase(type: string, leg?: string | null) {
  const target = quote(leg) ?? "deslocamento";
  const map: Record<string, string> = {
    DISPATCHED: `${target} saiu para o deslocamento`,
    DEPARTED: `${target} iniciou o deslocamento`,
    ARRIVED: `${target} chegou ao destino`,
    DRIVER_ASSIGNED: `Motorista atribuído a ${target}`,
    VEHICLE_ASSIGNED: `Veículo atribuído a ${target}`,
    BOARDING_STARTED: `Embarque iniciado para ${target}`,
    INCIDENT_RECORDED: `Incidente registrado em ${target}`,
  };
  return map[type] ?? `${fallback(type)} · ${leg ?? "Mobilidade"}`;
}

function hospitalityPhrase(type: string, stay?: string | null) {
  const target = quote(stay) ?? "hospedagem";
  const map: Record<string, string> = {
    CHECKIN_OPENED: `Check-in aberto em ${target}`,
    GUEST_CHECKED_IN: `Hóspede realizou check-in em ${target}`,
    GUEST_CHECKED_OUT: `Hóspede realizou checkout em ${target}`,
    CHECKOUT_COMPLETED: `Checkout concluído em ${target}`,
    COMPLETED: `${target} concluída`,
    ISSUE_RECORDED: `Pendência registrada em ${target}`,
    ROOM_RELEASED: `Quarto liberado em ${target}`,
  };
  return map[type] ?? `${fallback(type)} · ${stay ?? "Hospedagem"}`;
}

function eventPhrase(type: string, event?: string | null, session?: string | null) {
  const target = quote(session ?? event) ?? "evento";
  const map: Record<string, string> = {
    EVENT_STARTED: `${target} iniciado`,
    EVENT_COMPLETED: `${target} concluído`,
    SESSION_STARTED: `Sessão ${target} iniciada`,
    SESSION_COMPLETED: `Sessão ${target} concluída`,
    STARTED: `${target} iniciado`,
    COMPLETED: `${target} concluído`,
  };
  return map[type] ?? `${fallback(type)} · ${session ?? event ?? "Eventos"}`;
}

function communicationPhrase(type: string, message?: string | null, person?: string | null) {
  const target = quote(message) ?? "mensagem";
  const recipient = person ? ` por ${person}` : "";
  const map: Record<string, string> = {
    PUBLISHED: `${target} publicada`,
    RECIPIENT_MATERIALIZED: `Destinatário definido para ${target}`,
    DELIVERED: `${target} entregue${recipient}`,
    READ: `${target} lida${recipient}`,
    CANCELLED: `${target} cancelada`,
  };
  return map[type] ?? `${fallback(type)} · ${message ?? "Comunicação"}`;
}

export function OperationHistoryTimeline({ operationId }: { operationId: string }) {
  const location = useLocation();
  const path = `/operations/${operationId}`;
  const isOverview = location.pathname === path || location.pathname === `${path}/`;

  const query = useQuery({
    queryKey: ["px09-operation-history-human", operationId],
    enabled: isOverview,
    queryFn: async () => {
      const [journey, presence, checklist, mobility, hospitality, events, communication, steps, roster, items, legs, stays, eventDefs, sessions, messages] = await Promise.all([
        supabase.from("journey_events").select("id,journey_step_id,event_type,occurred_at,note").eq("operation_id", operationId),
        supabase.from("participant_presence_events").select("id,participation_id,journey_step_id,presence_fact,occurred_at,note,retracts_presence_event_id").eq("operation_id", operationId),
        supabase.from("playbook_executions").select("id,playbook_item_id,journey_step_id,execution_action,occurred_at,note").eq("operation_id", operationId),
        supabase.from("transport_events").select("id,transport_leg_id,event_type,occurred_at,note").eq("operation_id", operationId),
        supabase.from("hospitality_events").select("id,stay_id,event_type,occurred_at,note").eq("operation_id", operationId),
        supabase.from("event_runtime_events").select("id,event_id,session_id,event_type,occurred_at,note").eq("operation_id", operationId),
        supabase.from("communication_events").select("id,message_id,person_id,event_type,occurred_at").eq("operation_id", operationId),
        supabase.from("journey_steps").select("id,title").eq("operation_id", operationId),
        supabase.from("operation_participations").select("id,people(full_name)").eq("operation_id", operationId),
        supabase.from("playbook_items").select("id,title").eq("operation_id", operationId),
        supabase.from("transport_legs").select("id,title,origin_label,destination_label").eq("operation_id", operationId),
        supabase.from("hospitality_stays").select("id,name").eq("operation_id", operationId),
        supabase.from("events").select("id,name").eq("operation_id", operationId),
        supabase.from("event_sessions").select("id,title,event_id").in("event_id", (await supabase.from("events").select("id").eq("operation_id", operationId)).data?.map((row) => row.id) ?? []),
        supabase.from("messages").select("id,title").eq("operation_id", operationId),
      ]);

      const results = [journey, presence, checklist, mobility, hospitality, events, communication, steps, roster, items, legs, stays, eventDefs, sessions, messages];
      for (const result of results) if (result.error) throw result.error;

      const stepName = new Map((steps.data ?? []).map((row) => [row.id, row.title]));
      const personName = new Map(((roster.data ?? []) as unknown as ParticipationContext[]).map((row) => [row.id, row.people?.full_name ?? "Viajante"]));
      const itemName = new Map((items.data ?? []).map((row) => [row.id, row.title]));
      const legName = new Map((legs.data ?? []).map((row) => [row.id, row.title || `${row.origin_label ?? "Origem"} → ${row.destination_label ?? "Destino"}`]));
      const stayName = new Map((stays.data ?? []).map((row) => [row.id, row.name]));
      const eventName = new Map((eventDefs.data ?? []).map((row) => [row.id, row.name]));
      const sessionName = new Map((sessions.data ?? []).map((row) => [row.id, row.title]));
      const messageName = new Map((messages.data ?? []).map((row) => [row.id, row.title]));

      // Communication events may reference a person directly instead of an operation participation.
      const directPersonIds = [...new Set((communication.data ?? []).map((row) => row.person_id).filter(Boolean))] as string[];
      const directPeople = directPersonIds.length
        ? await supabase.from("people").select("id,full_name").in("id", directPersonIds)
        : { data: [], error: null };
      if (directPeople.error) throw directPeople.error;
      const directPersonName = new Map((directPeople.data ?? []).map((row) => [row.id, row.full_name]));

      const timeline: TimelineItem[] = [
        ...(journey.data ?? []).map((row) => ({
          id: row.id,
          domain: "journey" as const,
          label: journeyPhrase(row.event_type, stepName.get(row.journey_step_id)),
          occurredAt: row.occurred_at,
          note: row.note,
          context: stepName.get(row.journey_step_id) ?? null,
        })),
        ...(presence.data ?? []).map((row) => ({
          id: row.id,
          domain: "presence" as const,
          label: presencePhrase(row.presence_fact, personName.get(row.participation_id), stepName.get(row.journey_step_id)),
          occurredAt: row.occurred_at,
          note: row.note,
          context: personName.get(row.participation_id) ?? null,
        })),
        ...(checklist.data ?? []).map((row) => ({
          id: row.id,
          domain: "checklist" as const,
          label: checklistPhrase(row.execution_action, itemName.get(row.playbook_item_id), stepName.get(row.journey_step_id)),
          occurredAt: row.occurred_at,
          note: row.note,
          context: itemName.get(row.playbook_item_id) ?? null,
        })),
        ...(mobility.data ?? []).map((row) => ({
          id: row.id,
          domain: "mobility" as const,
          label: mobilityPhrase(row.event_type, legName.get(row.transport_leg_id)),
          occurredAt: row.occurred_at,
          note: row.note,
          context: legName.get(row.transport_leg_id) ?? null,
        })),
        ...(hospitality.data ?? []).map((row) => ({
          id: row.id,
          domain: "hospitality" as const,
          label: hospitalityPhrase(row.event_type, stayName.get(row.stay_id)),
          occurredAt: row.occurred_at,
          note: row.note,
          context: stayName.get(row.stay_id) ?? null,
        })),
        ...(events.data ?? []).map((row) => ({
          id: row.id,
          domain: "events" as const,
          label: eventPhrase(row.event_type, eventName.get(row.event_id), sessionName.get(row.session_id)),
          occurredAt: row.occurred_at,
          note: row.note,
          context: sessionName.get(row.session_id) ?? eventName.get(row.event_id) ?? null,
        })),
        ...(communication.data ?? []).map((row) => ({
          id: row.id,
          domain: "communication" as const,
          label: communicationPhrase(row.event_type, messageName.get(row.message_id), directPersonName.get(row.person_id)),
          occurredAt: row.occurred_at,
          note: null,
          context: messageName.get(row.message_id) ?? null,
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

  return (
    <section className="surface-panel overflow-hidden" aria-label="Histórico da operação">
      <div className="border-b border-border/70 px-5 py-4">
        <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-primary">PX09.1 · Histórico operacional</p>
        <div className="mt-1 flex items-center gap-2">
          <CheckCircle2 className="size-5 text-primary" aria-hidden="true" />
          <h2 className="text-xl font-semibold">Linha do tempo da operação</h2>
        </div>
        <p className="mt-1 text-sm text-muted-foreground">Fatos canônicos traduzidos para uma narrativa operacional legível.</p>
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
                  <time className="shrink-0 font-mono text-[10px] text-muted-foreground" dateTime={item.occurredAt}>
                    {date.toLocaleDateString("pt-BR")} · {date.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
                  </time>
                </div>
                {item.note ? <p className="mt-1 rounded-md bg-muted/50 px-2 py-1 text-xs text-muted-foreground">Obs.: {item.note}</p> : null}
              </div>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
