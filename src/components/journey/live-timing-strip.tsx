import * as React from "react";
import { Clock, Hourglass, TimerReset } from "lucide-react";

import type { JourneyStepRow } from "@/lib/w04";
import { useI18n } from "@/lib/i18n";

/**
 * COBS OS · Adaptive UX V1.1 — Time First strip (display only).
 * Timing remains client-derived from expected_* / planned_* values.
 * This component performs no writes, no queries, and never affects readiness.
 */

const TICK_MS = 1_000;

function startOf(step: JourneyStepRow | null): number | null {
  const raw = step?.expected_start ?? step?.planned_start ?? null;
  if (!raw) return null;
  const value = new Date(raw).getTime();
  return Number.isFinite(value) ? value : null;
}

function endOf(step: JourneyStepRow | null): number | null {
  const raw = step?.expected_end ?? step?.planned_end ?? null;
  if (!raw) return null;
  const value = new Date(raw).getTime();
  return Number.isFinite(value) ? value : null;
}

/** Coarse duration label used by compact secondary contexts. */
export function formatDuration(ms: number): string {
  const totalMinutes = Math.floor(Math.abs(ms) / 60_000);
  if (totalMinutes < 1) return "<1min";
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours === 0) return `${minutes}min`;
  return `${hours}h ${String(minutes).padStart(2, "0")}min`;
}

/** Time-first duration label with seconds for the primary operational clock. */
export function formatDurationPrecise(ms: number): string {
  const totalSeconds = Math.max(0, Math.floor(Math.abs(ms) / 1_000));
  const hours = Math.floor(totalSeconds / 3_600);
  const minutes = Math.floor((totalSeconds % 3_600) / 60);
  const seconds = totalSeconds % 60;

  if (hours > 0) {
    return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
  }

  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

function useNow(intervalMs = TICK_MS) {
  const [now, setNow] = React.useState<number | null>(null);
  React.useEffect(() => {
    setNow(Date.now());
    const id = window.setInterval(() => setNow(Date.now()), intervalMs);
    return () => window.clearInterval(id);
  }, [intervalMs]);
  return now;
}

function TimeCard({
  icon: Icon,
  label,
  value,
  supporting,
  tone = "muted",
}: {
  icon: React.ComponentType<{ className?: string; "aria-hidden"?: boolean }>;
  label: string;
  value: string;
  supporting?: string;
  tone?: "muted" | "warning";
}) {
  return (
    <div
      className={`min-w-[9.5rem] flex-1 rounded-2xl border px-3.5 py-3 sm:px-4 ${
        tone === "warning"
          ? "border-warning/50 bg-warning-soft text-warning"
          : "border-border/70 bg-muted/45 text-foreground"
      }`}
    >
      <div className="flex items-center gap-2">
        <Icon className="size-4 shrink-0" aria-hidden={true} />
        <span className="font-mono text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
          {label}
        </span>
      </div>
      <div className="mt-1.5 text-2xl font-bold tabular-nums tracking-tight sm:text-3xl" aria-label={`${label}: ${value}`}>
        {value}
      </div>
      {supporting ? <p className="mt-1 text-xs text-muted-foreground">{supporting}</p> : null}
    </div>
  );
}

export function LiveTimingStrip({
  current,
  next,
}: {
  current: JourneyStepRow | null;
  next: JourneyStepRow | null;
}) {
  const { t } = useI18n();
  const now = useNow();

  if (now === null) return null;

  const currentStart = startOf(current);
  const currentEnd = endOf(current);
  const nextStart = startOf(next);

  const cards: React.ReactNode[] = [];

  if (currentEnd !== null) {
    const remaining = currentEnd - now;
    cards.push(
      remaining >= 0 ? (
        <TimeCard
          key="remaining"
          icon={Clock}
          label={t("w04.timing.remaining")}
          value={formatDurationPrecise(remaining)}
        />
      ) : (
        <TimeCard
          key="late"
          icon={Clock}
          label={t("w04.timing.late")}
          value={formatDurationPrecise(remaining)}
          tone="warning"
        />
      ),
    );
  } else if (currentStart !== null && currentStart <= now) {
    cards.push(
      <TimeCard
        key="elapsed"
        icon={Hourglass}
        label={t("w04.timing.elapsed")}
        value={formatDurationPrecise(now - currentStart)}
      />,
    );
  }

  if (nextStart !== null) {
    const untilNext = nextStart - now;
    cards.push(
      untilNext >= 0 ? (
        <TimeCard
          key="next"
          icon={TimerReset}
          label={t("w04.timing.nextIn")}
          value={formatDurationPrecise(untilNext)}
        />
      ) : (
        <TimeCard
          key="next-late"
          icon={TimerReset}
          label={t("w04.timing.nextLate")}
          value={formatDurationPrecise(untilNext)}
          tone="warning"
        />
      ),
    );
  }

  if (cards.length === 0) {
    return <p className="mt-3 text-sm text-muted-foreground">{t("w04.timing.none")}</p>;
  }

  return (
    <div
      className="mt-3 grid gap-2 sm:grid-cols-2"
      aria-live="off"
      aria-label="Informações de tempo da operação"
    >
      {cards}
    </div>
  );
}
