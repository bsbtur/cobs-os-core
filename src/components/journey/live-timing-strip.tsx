import * as React from "react";
import { Clock3, TimerReset, TriangleAlert } from "lucide-react";

import type { JourneyStepRow } from "@/lib/w04";

function minutesBetween(from: Date, to: Date) {
  return Math.round((to.getTime() - from.getTime()) / 60000);
}

function formatMinutes(value: number) {
  const absolute = Math.abs(value);
  if (absolute < 60) return `${absolute} min`;
  const hours = Math.floor(absolute / 60);
  const minutes = absolute % 60;
  return minutes > 0 ? `${hours}h ${minutes}min` : `${hours}h`;
}

function stepStart(step: JourneyStepRow | null) {
  return step ? step.expected_start ?? step.planned_start : null;
}

function stepEnd(step: JourneyStepRow | null) {
  return step ? step.expected_end ?? step.planned_end : null;
}

export function LiveTimingStrip({
  current,
  next,
}: {
  current: JourneyStepRow | null;
  next: JourneyStepRow | null;
}) {
  const [now, setNow] = React.useState(() => new Date());

  React.useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 30000);
    return () => window.clearInterval(timer);
  }, []);

  if (!current && !next) return null;

  const currentStart = stepStart(current);
  const currentEnd = stepEnd(current);
  const nextStart = stepStart(next);

  const endDelta = currentEnd ? minutesBetween(now, new Date(currentEnd)) : null;
  const startDelta = currentStart ? minutesBetween(new Date(currentStart), now) : null;
  const nextDelta = nextStart ? minutesBetween(now, new Date(nextStart)) : null;

  const delayed = endDelta !== null && endDelta < 0;
  const beforeStart = currentStart ? now < new Date(currentStart) : false;

  return (
    <div className="mt-3 grid gap-2 sm:grid-cols-3" aria-label="Tempo operacional">
      <div className={`rounded-lg border px-3 py-2 ${delayed ? "border-warning/40 bg-warning-soft" : "border-border/70 bg-background/50"}`}>
        <p className="flex items-center gap-1.5 text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
          {delayed ? <TriangleAlert className="size-3.5" aria-hidden="true" /> : <Clock3 className="size-3.5" aria-hidden="true" />}
          Etapa atual
        </p>
        <p className={`mt-1 text-sm font-semibold ${delayed ? "text-warning" : ""}`}>
          {endDelta === null
            ? "Sem horário final"
            : delayed
              ? `${formatMinutes(endDelta)} de atraso`
              : beforeStart
                ? `Começa em ${formatMinutes(startDelta ?? 0)}`
                : `${formatMinutes(endDelta)} restantes`}
        </p>
      </div>

      <div className="rounded-lg border border-border/70 bg-background/50 px-3 py-2">
        <p className="flex items-center gap-1.5 text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
          <TimerReset className="size-3.5" aria-hidden="true" /> Tempo decorrido
        </p>
        <p className="mt-1 text-sm font-semibold">
          {currentStart && !beforeStart ? formatMinutes(startDelta ?? 0) : "Ainda não iniciada"}
        </p>
      </div>

      <div className="rounded-lg border border-border/70 bg-background/50 px-3 py-2">
        <p className="flex items-center gap-1.5 text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
          <Clock3 className="size-3.5" aria-hidden="true" /> Próxima etapa
        </p>
        <p className="mt-1 text-sm font-semibold">
          {!next
            ? "Última etapa"
            : nextDelta === null
              ? "Horário não definido"
              : nextDelta >= 0
                ? `Em ${formatMinutes(nextDelta)}`
                : `${formatMinutes(nextDelta)} após o previsto`}
        </p>
      </div>
    </div>
  );
}
