import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Clapperboard } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { useI18n } from "@/lib/i18n";
import { EVENT_STATUS_TONE, RUNTIME_STATE_TONE, type EventRow } from "@/lib/w07";
import { Button } from "@/components/ui/button";

type LiveRow = { event: EventRow; runtime: string; running: string | null; next: string | null };

/**
 * Read-only production summary for the W04 Live page.
 * BOUNDARY: reads W07 facts, never writes them, and never touches Journey,
 * Presence, Mobility or Hospitality. Actions live on the Events tab.
 */
export function EventLiveCard({ operationId }: { operationId: string }) {
  const { t } = useI18n();

  const summary = useQuery({
    queryKey: ["event-live-card", operationId],
    queryFn: async (): Promise<LiveRow[]> => {
      const { data, error } = await supabase
        .from("events")
        .select("*")
        .eq("operation_id", operationId)
        .order("planned_start");
      if (error) throw error;
      const events = (data ?? []) as EventRow[];

      const rows = await Promise.all(
        events.map(async (event) => {
          const { data: state } = await supabase.rpc("get_event_runtime_state", {
            _event_id: event.id,
          });
          const snapshot = (state ?? null) as {
            runtime_state?: string;
            sessions?: Array<{ title: string; sequence: number; runtime_state: string }>;
          } | null;
          const sessions = snapshot?.sessions ?? [];
          const running =
            sessions.find((s) => s.runtime_state === "running") ??
            sessions.find((s) => s.runtime_state === "paused") ??
            null;
          const upcoming =
            [...sessions]
              .sort((a, b) => a.sequence - b.sequence)
              .find((s) => s.runtime_state === "scheduled") ?? null;
          return {
            event,
            runtime: snapshot?.runtime_state ?? "scheduled",
            running: running?.title ?? null,
            next: upcoming?.title ?? null,
          };
        }),
      );
      return rows;
    },
  });

  const rows = summary.data ?? [];
  /* The card only exists when the operation actually produces or observes an event. */
  if (rows.length === 0) return null;

  return (
    <section className="surface-panel p-4">
      <div className="flex items-center gap-2">
        <Clapperboard className="size-4 text-muted-foreground" aria-hidden="true" />
        <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
          {t("w07.live.title")}
        </p>
        <Button asChild size="sm" variant="ghost" className="ml-auto min-h-9">
          <Link from="/operations/$operationId" to="/operations/$operationId/events">
            {t("w07.live.open")}
          </Link>
        </Button>
      </div>

      <ul className="mt-3 space-y-2">
        {rows.map((row) => (
          <li key={row.event.id} className="flex flex-wrap items-center gap-2 text-sm">
            <span className="font-medium">{row.event.name}</span>
            <span
              className={`rounded px-1.5 py-0.5 text-[11px] ${EVENT_STATUS_TONE[row.event.status]}`}
            >
              {t(`w07.status.${row.event.status}`)}
            </span>
            <span
              className={`rounded px-1.5 py-0.5 text-[11px] ${
                RUNTIME_STATE_TONE[row.runtime as keyof typeof RUNTIME_STATE_TONE] ??
                RUNTIME_STATE_TONE.scheduled
              }`}
            >
              {t(`w07.runtime.${row.runtime}`)}
            </span>
            <span className="ml-auto text-muted-foreground">
              {row.running
                ? `${t("w07.live.now")}: ${row.running}`
                : row.next
                  ? `${t("w07.live.next")}: ${row.next}`
                  : ""}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
