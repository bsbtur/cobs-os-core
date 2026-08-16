import * as React from "react";
import { Clock, Hourglass, TimerReset } from "lucide-react";

import type { JourneyStepRow } from "@/lib/w04";
import { useI18n } from "@/lib/i18n";

/**
 * COBS OS · Cockpit UX V2 — live timing strip (display only).
 *
 * Principle: in field operation, show less information and more direction.
 * The component promotes the most operationally relevant clock state
 * (remaining/late) and keeps elapsed/next timing as secondary context.
 *
 * It derives timing only from expected_* / planned_* values, writes nothing,
 * queries nothing, and never affects readiness or step actions.
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

function clockOf(step: JourneyStepRow | null): string | null {
  const raw = step?.expected_start ?? step?.planned_start ?? null;
  if (!raw) return null;
  const value = new Date(raw);
  if (!Number.isFinite(value.getTime())) return null;
  return value.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
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
  tone = "muted",
}: {
  icon: React.ComponentType<{ className?: string; "aria-hidden"?: boolean }>;
  label: string;
  value: string;
  tone?: "muted" | "warning";
}) {
  return (
    <div
      className={`flex min-w-0 items-center gap-2 rounded-xl border px-3 py-2.5 text-sm ${
        tone === "warning"
          ? "border-warning/30 bg-warning-soft text-warning"
          : "border-border/70 bg-background/55 text-muted-foreground"
      }`}
    >
      <Icon className="size-4 shrink-0" aria-hidden={true} />
      <span className="min-w-0 flex-1 truncate font-medium">{label}</span>
      <span className="shrink-0 font-mono font-medium tabular-nums">{value}</span>
    </div>
  );
}

function NextStepPreview({ next, untilNext }: { next: JourneyStepRow; untilNext: number | null }) {
  const { t } = useI18n();
  const start = clockOf(next);

  return (
    <div className="rounded-2xl border border-border/70 bg-background/55 px-4 py-3.5">
      <div className="flex items-center gap-2 text-muted-foreground">
        <TimerReset className="size-4 shrink-0" aria-hidden={true} />
        <span className="text-[11px] font-semibold uppercase tracking-[0.16em]">
          {t("w04.live.next")}
        </span>
      </div>
      <div className="mt-1.5 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-foreground">{next.title}</p>
          {next.location_label ? (
            <p className="mt-0.5 truncate text-xs text-muted-foreground">{next.location_label}</p>
          ) : null}
        </div>
        <div className="shrink-0 text-right">
          {start ? <p className="font-mono text-sm font-semibold tabular-nums">{start}</p> : null}
          {untilNext !== null ? (
            <p
              className={`mt-0.5 text-xs ${untilNext < 0 ? "text-warning" : "text-muted-foreground"}`}
            >
              {untilNext >= 0
                ? `${t("w04.timing.nextIn")} ${formatDuration(untilNext)}`
                : `${t("w04.timing.nextLate")} ${formatDuration(untilNext)}`}
            </p>
          ) : null}
        </div>
      </div>
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

  const remaining = currentEnd === null ? null : currentEnd - now;
  const elapsed = currentStart !== null && currentStart <= now ? now - currentStart : null;
  const untilNext = nextStart === null ? null : nextStart - now;

  if (remaining === null && elapsed === null && untilNext === null && !next) {
    return <p className="mt-3 text-sm text-muted-foreground">{t("w04.timing.none")}</p>;
  }

  return (
    <div className="mt-4 space-y-2.5">
      {remaining !== null ? (
        <PrimaryTiming
          label={remaining >= 0 ? t("w04.timing.remaining") : t("w04.timing.late")}
          value={formatDuration(remaining)}
          tone={remaining >= 0 ? "normal" : "warning"}
        />
      ) : null}

      {elapsed !== null ? (
        <SecondaryTiming
          icon={Hourglass}
          label={t("w04.timing.elapsed")}
          value={formatDuration(elapsed)}
        />
      ) : null}

      {next ? <NextStepPreview next={next} untilNext={untilNext} /> : null}
    </div>
  );
}
