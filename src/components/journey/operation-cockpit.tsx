import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  Clock,
  Sparkles,
  Users,
  Volume2,
  VolumeX,
} from "lucide-react";

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
 * COBS OS · V1 — frozen field cockpit.
 * CURRENT STEP → ONE NEXT ACTION → FEEDBACK → NEXT ACTION.
 *
 * UX contract: one operational command is actionable at a time. Completed and
 * future commands remain read-only outside this hero. Feedback is deliberately
 * short: visual focus + optional tone + device haptic when supported.
 */

const TICK_MS = 30_000;
const SOUND_KEY = "cobs.live.sound.v1";
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
  ready: "border-success/50 shadow-sm",
  attention: "border-warning/60 shadow-sm",
  blocked: "border-destructive/50",
  delayed: "border-warning/70",
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

function playConfirmationTone() {
  try {
    const AudioContextCtor = window.AudioContext ||
      (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioContextCtor) return;
    const context = new AudioContextCtor();
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.type = "sine";
    oscillator.frequency.setValueAtTime(660, context.currentTime);
    oscillator.frequency.exponentialRampToValueAtTime(880, context.currentTime + 0.12);
    gain.gain.setValueAtTime(0.0001, context.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.08, context.currentTime + 0.015);
    gain.gain.exponentialRampToValueAtTime(0.0001, context.currentTime + 0.18);
    oscillator.connect(gain);
    gain.connect(context.destination);
    oscillator.start();
    oscillator.stop(context.currentTime + 0.2);
    oscillator.addEventListener("ended", () => void context.close(), { once: true });
  } catch {
    // Audio feedback is progressive enhancement; runtime actions never depend on it.
  }
}

function Metric({ label, value, tone }: { label: string; value: number; tone?: "warning" }) {
  return (
    <div className="rounded-xl border border-border/60 bg-muted/45 px-3 py-2.5">
      <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">{label}</p>
      <p className={`text-xl font-semibold tabular-nums ${tone === "warning" ? "text-warning" : ""}`}>{value}</p>
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
  const [soundEnabled, setSoundEnabled] = React.useState(false);
  const [highlightNext, setHighlightNext] = React.useState(false);
  const previousActionRef = React.useRef<string | null>(null);
  const wasPendingRef = React.useRef(false);

  React.useEffect(() => {
    setSoundEnabled(window.localStorage.getItem(SOUND_KEY) === "on");
  }, []);

  const progress = useQuery({
    queryKey: ["live", current?.operation_id ?? null, "cockpit-progress", current?.id ?? null],
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
  const effectiveDepartureAuthorized = departureAuthorized ?? progressFacts.has("DEPARTURE_AUTHORIZED");
  const effectiveDeparted = departed ?? progressFacts.has("DEPARTED");
  const effectiveArrived = arrived || progressFacts.has("ARRIVED");
  const effectiveDisembarkationCompleted = disembarkationCompleted ?? progressFacts.has("DISEMBARKATION_COMPLETED");

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

  React.useEffect(() => {
    const previous = previousActionRef.current;
    const actionChanged = previous !== null && previous !== action.key;
    const completedMutation = wasPendingRef.current && !pending;
    if (actionChanged && completedMutation) {
      setHighlightNext(true);
      const timer = window.setTimeout(() => setHighlightNext(false), 1200);
      if (soundEnabled) playConfirmationTone();
      if ("vibrate" in navigator) navigator.vibrate?.(35);
      previousActionRef.current = action.key;
      wasPendingRef.current = pending;
      return () => window.clearTimeout(timer);
    }
    previousActionRef.current = action.key;
    wasPendingRef.current = pending;
  }, [action.key, pending, soundEnabled]);

  React.useEffect(() => {
    if (pending) wasPendingRef.current = true;
  }, [pending]);

  const delay = computeStepDelay(current, now ?? Date.now());
  const tone = deriveTone({ action, delay, summary, operationStatus });
  const stepTitle = current?.title ?? next?.title ?? t("w04.cockpit.noStep");
  const timeLabel = timeText(current, next, now, delay.lateMs, t);
  const actionable = action.rpc !== null || action.anchor !== null;
  const nextActionText = action.labelKey ? t(action.labelKey) : t(`w04.cockpit.action.${action.key}`);
  const ctaText = action.ctaKey ? t(action.ctaKey) : t(`w04.cockpit.cta.${action.key}`);

  const toggleSound = () => {
    const nextValue = !soundEnabled;
    setSoundEnabled(nextValue);
    window.localStorage.setItem(SOUND_KEY, nextValue ? "on" : "off");
    if (nextValue) playConfirmationTone();
  };

  const handleAction = () => {
    if (pending || progress.isFetching) return;
    if ("vibrate" in navigator) navigator.vibrate?.(18);
    onAction(action);
  };

  return (
    <article className={`surface-panel overflow-hidden p-0 ${TONE_CLASS[tone]}`} aria-label={t("w04.cockpit.title")}>
      <div className="h-1 w-full bg-muted">
        <div className={`h-full transition-all duration-500 ${tone === "blocked" ? "w-1/3 bg-destructive" : tone === "delayed" || tone === "attention" ? "w-2/3 bg-warning" : "w-full bg-success"}`} />
      </div>

      <div className="p-4 sm:p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">{t("w04.cockpit.currentStep")}</p>
            <span className={`rounded-full px-2 py-0.5 font-mono text-[10px] uppercase tracking-[0.14em] ${TONE_BADGE[tone]}`}>{t(`w04.cockpit.tone.${tone}`)}</span>
          </div>
          <Button type="button" variant="ghost" size="sm" className="h-8 gap-1.5 px-2 text-xs text-muted-foreground" onClick={toggleSound} aria-pressed={soundEnabled} title={soundEnabled ? "Desativar feedback sonoro" : "Ativar feedback sonoro"}>
            {soundEnabled ? <Volume2 className="size-4" /> : <VolumeX className="size-4" />}
            <span className="hidden sm:inline">{soundEnabled ? "Som ligado" : "Som desligado"}</span>
          </Button>
        </div>

        <h3 className="mt-1 text-2xl font-semibold leading-tight tracking-tight sm:text-3xl">{stepTitle}</h3>
        {current ? <p className="mt-0.5 text-sm text-muted-foreground">{t(`w04.kind.${current.step_kind}`)}{current.location_label ? ` · ${current.location_label}` : ""}</p> : null}

        <div className={`mt-4 rounded-2xl border px-4 py-3 transition-all duration-300 ${tone === "blocked" ? "border-destructive/30 bg-destructive/5" : "border-primary/20 bg-primary/5"} ${highlightNext ? "scale-[1.01] shadow-md ring-2 ring-primary/25" : ""}`}>
          <div className="flex items-center gap-2">
            <Sparkles className={`size-4 ${tone === "blocked" ? "text-destructive" : "text-primary"}`} aria-hidden="true" />
            <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">AGORA · {t("w04.cockpit.nextAction")}</p>
          </div>
          <p className="mt-1 flex items-start gap-2 text-base font-semibold sm:text-lg">
            {tone === "blocked" ? <AlertTriangle className="mt-0.5 size-5 shrink-0 text-destructive" aria-hidden="true" /> : <ArrowRight className="mt-0.5 size-5 shrink-0 text-primary" aria-hidden="true" />}
            <span>{nextActionText}</span>
          </p>
          {timeLabel ? <p className="mt-2 flex items-center gap-1.5 text-sm text-muted-foreground"><Clock className="size-4 shrink-0" aria-hidden="true" /><span className="tabular-nums">{timeLabel}</span></p> : null}
        </div>

        {summary ? <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4"><Metric label={t("w04.cockpit.metric.present")} value={summary.present} /><Metric label={t("w04.cockpit.metric.boarded")} value={summary.boarded} /><Metric label={t("w04.cockpit.metric.absent")} value={summary.absent} tone={summary.absent > 0 ? "warning" : undefined} /><Metric label={t("w04.cockpit.metric.pending")} value={summary.pending} tone={summary.pending > 0 ? "warning" : undefined} /></div> : null}

        {actionable ? <div className="sticky bottom-2 z-10 mt-4 rounded-2xl bg-background/90 p-1.5 shadow-lg backdrop-blur supports-[backdrop-filter]:bg-background/75"><Button className={`min-h-14 w-full text-base font-semibold transition-all duration-200 ${highlightNext ? "shadow-md" : ""}`} variant={tone === "blocked" ? "outline" : "default"} disabled={pending || progress.isFetching} onClick={handleAction}>{action.anchor ? <Users className="size-5" aria-hidden="true" /> : <CheckCircle2 className="size-5" aria-hidden="true" />}{pending ? "Registrando…" : ctaText}</Button></div> : null}

        <p className="mt-3 text-center text-[11px] text-muted-foreground">COBS V1 · uma ação por vez · fatos registrados</p>
      </div>
    </article>
  );
}

function timeText(current: JourneyStepRow | null, next: JourneyStepRow | null, now: number | null, lateMs: number, t: (key: string) => string): string | null {
  if (now === null) return null;
  if (lateMs > 0) return `${t("w04.timing.late")} ${formatDuration(lateMs)}`;
  const start = current?.expected_start ?? current?.planned_start ?? null;
  const end = current?.expected_end ?? current?.planned_end ?? null;
  if (end) {
    const remaining = new Date(end).getTime() - now;
    if (Number.isFinite(remaining) && remaining >= 0) return `${t("w04.timing.remaining")} ${formatDuration(remaining)}`;
  }
  if (start) {
    const until = new Date(start).getTime() - now;
    if (Number.isFinite(until) && until >= 0) return `${t("w04.timing.nextIn")} ${formatDuration(until)}`;
  }
  const nextStart = next?.expected_start ?? next?.planned_start ?? null;
  if (nextStart) {
    const until = new Date(nextStart).getTime() - now;
    if (Number.isFinite(until)) return until >= 0 ? `${t("w04.timing.nextIn")} ${formatDuration(until)}` : `${t("w04.timing.nextLate")} ${formatDuration(until)}`;
  }
  return null;
}
