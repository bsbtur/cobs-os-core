import * as React from "react";
import { Clock, Hourglass } from "lucide-react";

import type { JourneyStepRow } from "@/lib/w04";
import { useI18n } from "@/lib/i18n";

/**
 * COBS OS · live timing strip (display only).
 *
 * Principle: in field operation, show less information and more direction.
 * The component promotes the most operationally relevant clock state
 * (remaining/late) and keeps elapsed timing as secondary context.
 *
 * It derives timing only from expected_* / planned_* values, writes nothing,
 * queries nothing, and never affects readiness or step actions. Consumers that
 * need the same timing classification must reuse deriveTimingSnapshot so there
 * is one canonical clock calculation across Cockpit surfaces.
 */

const TICK_MS = 30_000;

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

export type TimingSnapshot = {
  startAt: number | null;
  endAt: number | null;
  remainingMs: number | null;
  elapsedMs: number | null;
  lateMs: number;
};

export function deriveTimingSnapshot(step: JourneyStepRow | null, now: number): TimingSnapshot {
  const startAt = startOf(step);
  const endAt = endOf(step);
  const remainingMs = endAt === null ? null : endAt - now;
  const elapsedMs = startAt !== null && startAt <= now ? now - startAt : null;

  return {
    startAt,
    endAt,
    remainingMs,
    elapsedMs,
    lateMs: remainingMs !== null && remainingMs < 0 ? Math.abs(remainingMs) : 0,
  };
}

/** Coarse duration label: "2h 05min" / "45min" / "<1min". */
export function formatDuration(ms: number): string {
  const totalMinutes = Math.floor(Math.abs(ms) / 60_000);
  if (totalMinutes < 1) return "<1min";
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours === 0) return `${minutes}min`;
  return `${hours}h ${String(minutes).padStart(2, "0")}min`;
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

function PrimaryTiming({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone: "normal" | "warning";
}) {
  return (
    <div
      className={`min-w-0 rounded-2xl border px-4 py-4 sm:px-5 ${
        tone === "warning"
          ? "border-warning/35 bg-warning-soft text-warning"
          : "border-primary/25 bg-primary-soft text-primary"
      }`}
      aria-live="polite"
    >
      <div className="flex items-center gap-2">
        <Clock className="size-4 shrink-0" aria-hidden={true} />
        <span className="text-xs font-semibold uppercase tracking-[0.14em]">{label}</span>
      </div>
      <p className="mt-1 font-mono text-3xl font-semibold tracking-tight tabular-nums sm:text-4xl">
        {value}
      </p>
    </div>
  );
}

function SecondaryTiming({
  icon: Icon,
  label,
  value,
}: {
  icon: React.ComponentType<{ className?: string; "aria-hidden"?: boolean }>;
  label: string;
  value: string;
}) {
  return (
    <div className="flex min-w-0 items-center gap-2 rounded-xl border border-border/70 bg-background/55 px-3 py-2.5 text-sm text-muted-foreground">
      <Icon className="size-4 shrink-0" aria-hidden={true} />
      <span className="min-w-0 flex-1 truncate font-medium">{label}</span>
      <span className="shrink-0 font-mono font-medium tabular-nums">{value}</span>
    </div>
  );
}

export function LiveTimingStrip({
  current,
}: {
  current: JourneyStepRow | null;
  next?: JourneyStepRow | null;
}) {
  const { t } = useI18n();
  const now = useNow();

  if (now === null) return null;

  const timing = deriveTimingSnapshot(current, now);
  const { remainingMs, elapsedMs } = timing;

  if (remainingMs === null && elapsedMs === null) {
    return <p className="mt-3 text-sm text-muted-foreground">{t("w04.timing.none")}</p>;
  }

  return (
    <div className="mt-4 space-y-2.5">
      {remainingMs !== null ? (
        <PrimaryTiming
          label={remainingMs >= 0 ? t("w04.timing.remaining") : t("w04.timing.late")}
          value={formatDuration(remainingMs)}
          tone={remainingMs >= 0 ? "normal" : "warning"}
        />
      ) : null}

      {elapsedMs !== null ? (
        <SecondaryTiming
          icon={Hourglass}
          label={t("w04.timing.elapsed")}
          value={formatDuration(elapsedMs)}
        />
      ) : null}
    </div>
  );
}
