import * as React from "react";
import { Link } from "@tanstack/react-router";
import { AlertTriangle, CheckCircle2, Compass, TimerReset } from "lucide-react";

import { useI18n } from "@/lib/i18n";
import { Button } from "@/components/ui/button";
import { LiveTimingStrip, formatDuration } from "@/components/journey/live-timing-strip";
import type { JourneyStepRow, Readiness } from "@/lib/w04";
import {
  deriveDelayMs,
  deriveTone,
  type CockpitAction,
  type CockpitSummary,
  type CockpitTone,
} from "@/lib/live-cockpit";

/**
 * COBS OS · V1.1 — Operational cockpit (display + orientation only).
 * It renders the already-derived next action and never bypasses a backend guard:
 * a blocked CTA stays disabled with its reason visible, and the underlying
 * step actions remain available below, unchanged.
 */

const TONE_BOX: Record<CockpitTone, string> = {
  neutral: "bg-muted text-muted-foreground",
  ready: "bg-success-soft text-success",
  blocked: "bg-warning-soft text-warning",
  attention: "bg-warning-soft text-warning",
  late: "bg-destructive/10 text-destructive",
};

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg bg-muted px-3 py-2">
      <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
        {label}
      </p>
      <p className="text-lg font-semibold tabular-nums">{value}</p>
    </div>
  );
}

function useNow(intervalMs = 30_000) {
  const [now, setNow] = React.useState<number | null>(null);
  React.useEffect(() => {
    setNow(Date.now());
    const id = window.setInterval(() => setNow(Date.now()), intervalMs);
    return () => window.clearInterval(id);
  }, [intervalMs]);
  return now;
}

export function OperationCockpit({
  operationId,
  current,
  next,
  readiness,
  summary,
  action,
  pending,
  onRun,
  onFocusPeople,
}: {
  operationId: string;
  current: JourneyStepRow | null;
  next: JourneyStepRow | null;
  readiness: Readiness | null;
  summary: CockpitSummary | null;
  action: CockpitAction | null;
  pending: boolean;
  onRun: (action: CockpitAction) => void;
  onFocusPeople: () => void;
}) {
  const { t } = useI18n();
  const now = useNow();
  const tone: CockpitTone = now === null ? "neutral" : deriveTone({ current, readiness, now });
  const delayMs = now === null ? null : deriveDelayMs(current, now);

  const toneLabel =
    tone === "late"
      ? t("w04.cockpit.tone.late")
      : tone === "blocked"
        ? t("w04.cockpit.tone.blocked")
        : tone === "attention"
          ? t("w04.cockpit.tone.attention")
          : tone === "ready"
            ? t("w04.cockpit.tone.ready")
            : null;

  return (
    <article className="surface-panel border-primary/40 p-4 sm:p-5">
      <div className="flex flex-wrap items-center gap-2">
        <Compass className="size-4 text-muted-foreground" aria-hidden="true" />
        <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
          {t("w04.cockpit.title")}
        </p>
        {toneLabel ? (
          <span
            className={`ml-auto inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 font-mono text-[10px] uppercase tracking-[0.14em] ${TONE_BOX[tone]}`}
          >
            {tone === "ready" ? (
              <CheckCircle2 className="size-3.5" aria-hidden="true" />
            ) : (
              <AlertTriangle className="size-3.5" aria-hidden="true" />
            )}
            {toneLabel}
          </span>
        ) : null}
      </div>

      {/* CURRENT STEP */}
      <h3 className="mt-2 text-2xl font-semibold leading-tight tracking-tight">
        {current ? current.title : next ? next.title : t("w04.cockpit.noStep")}
      </h3>
      <p className="text-sm text-muted-foreground">
        {current
          ? `${t(`w04.kind.${current.step_kind}`)}${current.location_label ? ` · ${current.location_label}` : ""}`
          : t("w04.cockpit.noStepBody")}
      </p>

      {/* NEXT ACTION */}
      <div className="mt-3 rounded-xl border border-border bg-background/60 p-3">
        <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
          {t("w04.cockpit.nextAction")}
        </p>
        {action ? (
          <>
            <p className="mt-1 text-base font-medium">{t(action.labelKey)}</p>
            {action.blocked && action.reasonKey ? (
              <p className="mt-1 flex items-start gap-1.5 text-xs text-warning">
                <AlertTriangle className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
                <span>{t(action.reasonKey)}</span>
              </p>
            ) : null}
            <div className="mt-3">
              {action.mode === "navigate" ? (
                <Button asChild className="min-h-12 w-full sm:w-auto">
                  <Link to="/operations/$operationId" params={{ operationId }}>
                    {t(action.labelKey)}
                  </Link>
                </Button>
              ) : (
                <Button
                  className="min-h-12 w-full sm:w-auto"
                  disabled={pending || action.blocked}
                  title={action.blocked && action.reasonKey ? t(action.reasonKey) : undefined}
                  onClick={() => (action.mode === "focus" ? onFocusPeople() : onRun(action))}
                >
                  {t(action.labelKey)}
                </Button>
              )}
            </div>
          </>
        ) : (
          <p className="mt-1 text-sm text-muted-foreground">{t("w04.cockpit.noAction")}</p>
        )}
      </div>

      {/* TIME */}
      <LiveTimingStrip current={current} next={next} />
      {delayMs !== null ? (
        <p className="mt-2 inline-flex items-center gap-1.5 rounded-lg bg-destructive/10 px-2.5 py-1.5 text-sm text-destructive">
          <TimerReset className="size-4" aria-hidden="true" />
          {t("w04.cockpit.delay")} <span className="tabular-nums">{formatDuration(delayMs)}</span>
        </p>
      ) : null}

      {/* SUMMARY */}
      {summary && summary.population > 0 ? (
        <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
          <Metric label={t("w04.cockpit.summary.present")} value={summary.present} />
          <Metric label={t("w04.cockpit.summary.boarded")} value={summary.boarded} />
          <Metric label={t("w04.cockpit.summary.pending")} value={summary.pending} />
          <Metric label={t("w04.cockpit.summary.absent")} value={summary.absent} />
        </div>
      ) : null}
    </article>
  );
}
