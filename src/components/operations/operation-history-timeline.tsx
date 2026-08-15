import { useLocation } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { BedDouble, Bus, CalendarDays, CheckCircle2, ClipboardCheck, MessageSquare, Route, Users } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";

type TimelineItem = {
  id: string;
  domain: "journey" | "presence" | "checklist" | "mobility" | "hospitality" | "events" | "communication";
  label: string;
  occurredAt: string;
  note?: string | null;
};

const domainMeta = {
  journey: { label: "Jornada", icon: Route },
  presence: { label: "Pessoas", icon: Users },
  checklist: { label: "Checklist", icon: ClipboardCheck },
  mobility: { label: "Mobilidade", icon: Bus },
  hospitality: { label: "Hospedagem", icon: BedDouble },
  events: { label: "Eventos", icon: CalendarDays },
  communication: { label: "Comunicação", icon: MessageSquare },
} as const;

function humanize(value: string | null | undefined) {
  if (!value) return "Evento registrado";
  return value
    .toLowerCase()
    .replaceAll("_", " ")
    .replace(/^./, (char) => char.toUpperCase());
}

export function OperationHistoryTimeline({ operationId }: { operationId: string }) {
  const location = useLocation();
  const path = `/operations/${operationId}`;
  const isOverview = location.pathname === path || location.pathname === `${path}/`;

  const query = useQuery({
    queryKey: ["px09-operation-history", operationId],
    enabled: isOverview,
    queryFn: async () => {
      const [journey, presence, checklist, mobility, hospitality, events, communication] = await Promise.all([
        supabase.from("journey_events").select("id,event_type,occurred_at,note").eq("operation_id", operationId),
        supabase.from("participant_presence_events").select("id,presence_fact,occurred_at,note").eq("operation_id", operationId),
        supabase.from("playbook_executions").select("id,execution_action,occurred_at,note").eq("operation_id", operationId),
        supabase.from("transport_events").select("id,event_type,occurred_at,note").eq("operation_id", operationId),
        supabase.from("hospitality_events").select("id,event_type,occurred_at,note").eq("operation_id", operationId),
        supabase.from("event_runtime_events").select("id,event_type,occurred_at,note").eq("operation_id", operationId),
        supabase.from("communication_events").select("id,event_type,occurred_at").eq("operation_id", operationId),
      ]);

      const results = [journey, presence, checklist, mobility, hospitality, events, communication];
      for (const result of results) if (result.error) throw result.error;

      const items: TimelineItem[] = [
        ...(journey.data ?? []).map((row) => ({ id: row.id, domain: "journey" as const, label: humanize(row.event_type), occurredAt: row.occurred_at, note: row.note })),
        ...(presence.data ?? []).map((row) => ({ id: row.id, domain: "presence" as const, label: humanize(row.presence_fact), occurredAt: row.occurred_at, note: row.note })),
        ...(checklist.data ?? []).map((row) => ({ id: row.id, domain: "checklist" as const, label: humanize(row.execution_action), occurredAt: row.occurred_at, note: row.note })),
        ...(mobility.data ?? []).map((row) => ({ id: row.id, domain: "mobility" as const, label: humanize(row.event_type), occurredAt: row.occurred_at, note: row.note })),
        ...(hospitality.data ?? []).map((row) => ({ id: row.id, domain: "hospitality" as const, label: humanize(row.event_type), occurredAt: row.occurred_at, note: row.note })),
        ...(events.data ?? []).map((row) => ({ id: row.id, domain: "events" as const, label: humanize(row.event_type), occurredAt: row.occurred_at, note: row.note })),
        ...(communication.data ?? []).map((row) => ({ id: row.id, domain: "communication" as const, label: humanize(row.event_type), occurredAt: row.occurred_at, note: null })),
      ].sort((a, b) => new Date(a.occurredAt).getTime() - new Date(b.occurredAt).getTime());

      return items;
    },
  });

  if (!isOverview) return null;
  if (query.isLoading) return <div className="surface-panel h-48 animate-pulse" />;
  if (query.isError) return null;

  const items = query.data ?? [];
  if (items.length === 0) return null;

  return (
    <section className="surface-panel overflow-hidden" aria-label="Histórico da operação">
      <div className="border-b border-border/70 px-5 py-4">
        <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-primary">PX09 · Histórico operacional</p>
        <div className="mt-1 flex items-center gap-2">
          <CheckCircle2 className="size-5 text-primary" aria-hidden="true" />
          <h2 className="text-xl font-semibold">Linha do tempo da operação</h2>
        </div>
        <p className="mt-1 text-sm text-muted-foreground">Eventos canônicos reunidos em ordem cronológica.</p>
      </div>

      <ol className="divide-y divide-border/60 px-5">
        {items.slice(-120).map((item) => {
          const meta = domainMeta[item.domain];
          const Icon = meta.icon;
          const date = new Date(item.occurredAt);
          return (
            <li key={`${item.domain}-${item.id}`} className="flex gap-3 py-3">
              <div className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full bg-primary-soft text-primary">
                <Icon className="size-4" aria-hidden="true" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <p className="text-sm font-semibold">{item.label}</p>
                    <p className="text-[11px] text-muted-foreground">{meta.label}</p>
                  </div>
                  <time className="font-mono text-[10px] text-muted-foreground" dateTime={item.occurredAt}>
                    {date.toLocaleDateString("pt-BR")} · {date.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
                  </time>
                </div>
                {item.note ? <p className="mt-1 text-xs text-muted-foreground">{item.note}</p> : null}
              </div>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
