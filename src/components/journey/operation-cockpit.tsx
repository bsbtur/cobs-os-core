import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, ArrowRight, CheckCircle2, Clock, Users } from "lucide-react";

import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useI18n } from "@/lib/i18n";
import type { JourneyStepRow } from "@/lib/w04";
import {
  computeStepDelay,
  deriveNextAction,
  deriveTone,
  type CockpitAction,
  type CockpitInput,
  type CockpitTone,
  type StepPresenceSummary,
} from "@/lib/live-cockpit";
import { formatDuration } from "@/components/journey/live-timing-strip";

/**
 * COBS OS · V1.1 — Operational Cockpit hero.
 * Shows CURRENT STEP → ONE NEXT ACTION → TIME → SUMMARY → primary CTA.
 *
 * UX contract: only the next valid runtime command is actionable here. Historical
 * commands remain visible in the secondary strip on the live page, but that strip
 * is intentionally read-only. Backend guards remain authoritative.
 */

const TICK_MS = 30_000;
const PROGRESS_EVENT_TYPES = [
  "GATHERING_STARTED",
  "BOARDING_STARTED",
  "BOARDING_COMPLETED",
  "DEPARTURE_AUTHORIZED",
  "DEPARTED",
  "ARRIVED",
  "DISEMBARKATION_COMPLETED",
] as const;

const TONE_CLASS: Record<CockpitTone, string> = {
  ready: "border-success/40",
  attention: "border-warning/50",
  blocked: "border-destructive/50",
  delayed: "border-warning/60",
  neutral: "border-border",
};

const TONE_BADGE: Record<CockpitTone, string> = {
  ready: "bg-success-soft text-success",
  attention: "bg-warning-soft text-warning",
  blocked: "bg-destructive/10 text-destructive",
  delayed: "bg-warning-soft text-warning",
  neutral: "bg-muted text-muted-foreground",
};

function useNow(intervalMs = TICK_MS) {
  const [now, setNow] = React.useState<number | null>(null);
  React.useEffect(() => {
    setNow(Date.now());
    const id = window.setInterval(() => setNow(Date.now()), intervalMs);
    return () => window.clearInterval(id);
  }, [intervalMs]);
  return now;
}

function Metric({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone?: "warning" | undefined;
}) {
  return (
    <div className="rounded-lg bg-muted/60 px-2.5 py-2">
      <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
        {label}
      </p>
      <p
        className={`text-lg font-semibold tabular-nums ${tone === "warning" ? "text-warning" : ""}`}
      >
        {value}
      </p>
    </div>
  );
}

export function OperationCockpit({
  operationStatus,
  current,
  next,
  readiness,
  arrived,
  boardingStarted,
  gatheringStarted,
  boardingCompleted,
  departureAuthorized,
  departed,
  disembarkationCompleted,
  journeyResolved,
  summary,
  pending,
  onAction,
}: CockpitInput & {
  summary: StepPresenceSummary | null;
  pending: boolean;
  onAction: (action: CockpitAction) => void;
}) {
  const { t } = useI18n();
  const now = useNow();

  // Keep the sequencing source complete even while the legacy live route still
  // passes only BOARDING_STARTED/ARRIVED. This query is narrow (one current step)
  // and lets the cockpit advance through every canonical W04 runtime fact.
  const progress = useQuery({
    queryKey: ["live-cockpit-progress", current?.id ?? null],
    enabled: Boolean(current?.id),
    refetchInterval: 10_000,
    queryFn: async () => {
      if (!current) return new Set<string>();
      const { data, error } = await supabase
        .from("journey_events")
        .select("event_type")
        .eq("journey_step_id", current.id)
        .in("event_type", [...PROGRESS_EVENT_TYPES]);
      if (error) throw error;
      return new Set((data ?? []).map((row) => row.event_type));
    },
  });

  const progressFacts = progress.data ?? new Set<string>();
  const effectiveGatheringStarted = gatheringStarted ?? progressFacts.has("GATHERING_STARTED");
  const effectiveBoardingStarted = boardingStarted || progressFacts.has("BOARDING_STARTED");
  const effectiveBoardingCompleted = boardingCompleted ?? progressFacts.has("BOARDING_COMPLETED");
  const effectiveDepartureAuthorized =
    departureAuthorized ?? progressFacts.has("DEPARTURE_AUTHORIZED");
  const effectiveDeparted = departed ?? progressFacts.has("DEPARTED");
  const effectiveArrived = arrived || progressFacts.has("ARRIVED");
  const effectiveDisembarkationCompleted =
    disembarkationCompleted ?? progressFacts.has("DISEMBARKATION_COMPLETED");

  const action = deriveNextAction({
    operationStatus,
    current,
    next,
    readiness,
    arrived: effectiveArrived,
    boardingStarted: effectiveBoardingStarted,
    gatheringStarted: effectiveGatheringStarted,
    boardingCompleted: effectiveBoardingCompleted,
    departureAuthorized: effectiveDepartureAuthorized,
    departed: effectiveDeparted,
    disembarkationCompleted: effectiveDisembarkationCompleted,
    journeyResolved,
  });
  const delay = computeStepDelay(current, now ?? Date.now());
  const tone = deriveTone({ action, delay, summary, operationStatus });

  const stepTitle = current?.title ?? next?.title ?? t("w04.cockpit.noStep");
  const timeLabel = timeText(current, next, now, delay.lateMs, t);
  const actionable = action.rpc !== null || action.anchor !== null;
  const nextActionText = action.labelKey
    ? t(action.labelKey)
    : t(`w04.cockpit.action.${action.key}`);
  const ctaText = action.ctaKey ? t(action.ctaKey) : t(`w04.cockpit.cta.${action.key}`);

  return (
    <article
      className={`surface-panel p-4 sm:p-5 ${TONE_CLASS[tone]}`}
      aria-label={t("w04.cockpit.title")}
    >
      <div className="flex flex-wrap items-center gap-2">
        <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
          {t("w04.cockpit.currentStep")}
        </p>
        <span
          className={`rounded-full px-2 py-0.5 font-mono text-[10px] uppercase tracking-[0.14em] ${TONE_BADGE[tone]}`}
        >
          {t(`w04.cockpit.tone.${tone}`)}
        </span>
      </div>

      <h3 className="mt-1 text-2xl font-semibold leading-tight tracking-tight">{stepTitle}</h3>
      {current ? (
        <p className="text-sm text-muted-foreground">
          {t(`w04.kind.${current.step_kind}`)}
          {current.location_label ? ` · ${current.location_label}` : ""}
        </p>
      ) : null}

      <div className="mt-3 rounded-lg bg-muted/50 px-3 py-2">
        <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
          {t("w04.cockpit.nextAction")}
        </p>
        <p className="mt-0.5 flex items-start gap-2 text-sm font-medium">
          {tone === "blocked" ? (
            <AlertTriangle className="mt-0.5 size-4 shrink-0 text-destructive" aria-hidden="true" />
          ) : (
            <ArrowRight
              className="mt-0.5 size-4 shrink-0 text-muted-foreground"
              aria-hidden="true"
            />
          )}
          <span>{nextActionText}</span>
        </p>
      </div>

      {timeLabel ? (
        <p className="mt-2 flex items-center gap-1.5 text-sm text-muted-foreground">
          <Clock className="size-4 shrink-0" aria-hidden="true" />
          <span className="tabular-nums">{timeLabel}</span>
        </p>
      ) : null}

      {summary ? (
        <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
          <Metric label={t("w04.cockpit.metric.present")} value={summary.present} />
          <Metric label={t("w04.cockpit.metric.boarded")} value={summary.boarded} />
          <Metric
            label={t("w04.cockpit.metric.absent")}
            value={summary.absent}
            tone={summary.absent > 0 ? "warning" : undefined}
          />
          <Metric
            label={t("w04.cockpit.metric.pending")}
            value={summary.pending}
            tone={summary.pending > 0 ? "warning" : undefined}
          />
        </div>
      ) : null}

      {actionable ? (
        <Button
          className="mt-4 min-h-12 w-full sm:w-auto"
          variant={tone === "blocked" ? "outline" : "default"}
          disabled={pending || progress.isFetching}
          onClick={() => onAction(action)}
        >
          {action.anchor ? (
            <Users className="size-4" aria-hidden="true" />
          ) : (
            <CheckCircle2 className="size-4" aria-hidden="true" />
          )}
          {ctaText}
        </Button>
      ) : null}
    </article>
  );
}

function timeText(
  current: JourneyStepRow | null,
  next: JourneyStepRow | null,
  now: number | null,
  lateMs: number,
  t: (key: string) => string,
): string | null {
  if (now === null) return null;
  if (lateMs > 0) return `${t("w04.timing.late")} ${formatDuration(lateMs)}`;
  const start = current?.expected_start ?? current?.planned_start ?? null;
  const end = current?.expected_end ?? current?.planned_end ?? null;
  if (end) {
    const remaining = new Date(end).getTime() - now;
    if (Number.isFinite(remaining) && remaining >= 0) {
      return `${t("w04.timing.remaining")} ${formatDuration(remaining)}`;
    }
  }
  if (start) {
    const until = new Date(start).getTime() - now;
    if (Number.isFinite(until) && until >= 0) {
      return `${t("w04.timing.nextIn")} ${formatDuration(until)}`;
    }
  }
  const nextStart = next?.expected_start ?? next?.planned_start ?? null;
  if (nextStart) {
    const until = new Date(nextStart).getTime() - now;
    if (Number.isFinite(until)) {
      return until >= 0
        ? `${t("w04.timing.nextIn")} ${formatDuration(until)}`
        : `${t("w04.timing.nextLate")} ${formatDuration(until)}`;
    }
  }
  return null;
}
