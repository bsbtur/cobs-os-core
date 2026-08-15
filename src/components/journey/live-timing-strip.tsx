import * as React from "react";
import { Clock, Hourglass, TimerReset } from "lucide-react";

import type { JourneyStepRow } from "@/lib/w04";
import { useI18n } from "@/lib/i18n";

/**
 * COBS OS · W04 — Live timing strip (display only).
 * Derives timing purely on the client from expected_* / planned_* values.
 * Writes nothing, queries nothing, and never affects readiness or step actions.
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

function Chip({
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
    <span
      className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-sm ${
        tone === "warning" ? "bg-warning-soft text-warning" : "bg-muted text-muted-foreground"
      }`}
    >
      <Icon className="size-4" aria-hidden={true} />
      <span className="font-medium">{label}</span>
      <span className="tabular-nums">{value}</span>
    </span>
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

  const chips: React.ReactNode[] = [];

  if (currentStart !== null && currentStart <= now) {
    chips.push(
      <Chip
        key="elapsed"
        icon={Hourglass}
        label={t("w04.timing.elapsed")}
        value={formatDuration(now - currentStart)}
      />,
    );
  }

  if (currentEnd !== null) {
    const remaining = currentEnd - now;
    chips.push(
      remaining >= 0 ? (
        <Chip
          key="remaining"
          icon={Clock}
          label={t("w04.timing.remaining")}
          value={formatDuration(remaining)}
        />
      ) : (
        <Chip
          key="late"
          icon={Clock}
          label={t("w04.timing.late")}
          value={formatDuration(remaining)}
          tone="warning"
        />
      ),
    );
  }

  if (nextStart !== null) {
    const untilNext = nextStart - now;
    chips.push(
      untilNext >= 0 ? (
        <Chip
          key="next"
          icon={TimerReset}
          label={t("w04.timing.nextIn")}
          value={formatDuration(untilNext)}
        />
      ) : (
        <Chip
          key="next-late"
          icon={TimerReset}
          label={t("w04.timing.nextLate")}
          value={formatDuration(untilNext)}
          tone="warning"
        />
      ),
    );
  }

  if (chips.length === 0) {
    return <p className="mt-3 text-sm text-muted-foreground">{t("w04.timing.none")}</p>;
  }

  return (
    <div className="mt-3 flex flex-wrap items-center gap-2" aria-live="polite">
      {chips}
    </div>
  );
}
