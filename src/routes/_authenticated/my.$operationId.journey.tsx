import { createFileRoute, useParams } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { CalendarDays, ChevronDown, Clock3, Compass, MapPin, Megaphone, Sparkles, ShieldCheck } from "lucide-react";

import { useI18n } from "@/lib/i18n";
import { useMyJourney, useMyOverview } from "@/lib/w10";
import { PortalShell } from "@/app/portal/portal-shell";
import { PortalEmpty, PortalQueryGate } from "@/app/portal/portal-states";

export const Route = createFileRoute("/_authenticated/my/$operationId/journey")({
  head: () => ({
    meta: [
      { title: "My schedule — COBS OS traveler portal" },
      { name: "description", content: "Your day-by-day schedule with meeting points and times." },
      { property: "og:title", content: "My schedule — COBS OS traveler portal" },
      { property: "og:description", content: "Meeting points, times and what to expect." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: PortalJourney,
});

function localDateKey(value: number | string, timeZone?: string | null) {
  return new Intl.DateTimeFormat("en-CA", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    ...(timeZone ? { timeZone } : {}),
  }).format(new Date(value));
}

function isPlaceholderMidnight(value: string | null, timeZone?: string | null) {
  if (!value) return false;
  const parts = new Intl.DateTimeFormat("en-CA", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
    ...(timeZone ? { timeZone } : {}),
  }).formatToParts(new Date(value));
  const hour = parts.find((part) => part.type === "hour")?.value;
  const minute = parts.find((part) => part.type === "minute")?.value;
  const second = parts.find((part) => part.type === "second")?.value;
  return hour === "00" && minute === "00" && second === "00";
}

function journeyStepState(
  step: {
    expectedStart: string | null;
    plannedStart: string | null;
    expectedEnd: string | null;
    plannedEnd: string | null;
  },
  nowMs: number,
  timeZone?: string | null,
) {
  const effectiveStart = step.expectedStart ?? step.plannedStart;
  const effectiveEnd = step.expectedEnd ?? step.plannedEnd;
  const startMs = effectiveStart ? new Date(effectiveStart).getTime() : null;
  const endMs = effectiveEnd ? new Date(effectiveEnd).getTime() : null;
  const startIsDateOnly = effectiveStart ? isPlaceholderMidnight(effectiveStart, timeZone) : false;
  const endIsDateOnly = effectiveEnd ? isPlaceholderMidnight(effectiveEnd, timeZone) : false;

  if (effectiveStart && startIsDateOnly) {
    const stepDay = localDateKey(effectiveStart, timeZone);
    const today = localDateKey(nowMs, timeZone);
    if (stepDay < today) return "completed" as const;
    return "upcoming" as const;
  }

  if (startMs !== null && !startIsDateOnly) {
    if (endMs !== null && !endIsDateOnly && startMs <= nowMs && nowMs < endMs) {
      return "now" as const;
    }
    if (endMs !== null && !endIsDateOnly && endMs <= nowMs) {
      return "completed" as const;
    }
    if (startMs > nowMs) {
      return "upcoming" as const;
    }
  }

  return "neutral" as const;
}

function PortalJourney() {
  const { operationId } = useParams({ from: "/_authenticated/my/$operationId/journey" });
  const { t, locale } = useI18n();
  const overview = useMyOverview(operationId);
  const journey = useMyJourney(operationId);
  const timeZone = overview.data?.timezone ?? null;
  const steps = journey.data ?? [];
  const [expandedStepId, setExpandedStepId] = useState<string | null>(null);
  const [nowMs, setNowMs] = useState(() => Date.now());

  useEffect(() => {
    const refreshNow = () => setNowMs(Date.now());
    const timer = window.setInterval(refreshNow, 30_000);
    document.addEventListener("visibilitychange", refreshNow);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", refreshNow);
    };
  }, []);

  const stepStates = steps.map((step) => journeyStepState(step, nowMs, timeZone));
  const nowStepIndex = stepStates.findIndex((state) => state === "now");
  const nextStepIndex = stepStates.findIndex((state) => state === "upcoming");
  const spotlightIndex = nowStepIndex >= 0 ? nowStepIndex : nextStepIndex;
  const spotlightStep = spotlightIndex >= 0 ? steps[spotlightIndex] : null;
  const spotlightIsNow = nowStepIndex >= 0;

  return (
    <PortalShell operationId={operationId} title={overview.data?.name ?? t("w10.portal.brand")} active="journey">
      <section className="mb-5 overflow-hidden rounded-3xl border border-border/70 bg-gradient-to-br from-card via-card to-muted/50 p-5 shadow-sm">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="mb-2 inline-flex items-center gap-2 rounded-full bg-primary/10 px-3 py-1 text-xs font-semibold text-primary">
              <Sparkles className="h-3.5 w-3.5" /> {t("w10.journey.eyebrow")}
            </div>
            <h2 className="text-xl font-semibold tracking-tight text-foreground">{t("w10.journey.title")}</h2>
            <p className="mt-1 max-w-xl text-sm leading-relaxed text-muted-foreground">
              {t("w10.journey.heroBody")}
            </p>
          </div>
          <div className="hidden rounded-2xl bg-background/70 p-3 sm:block"><CalendarDays className="h-6 w-6 text-primary" /></div>
        </div>
        {!journey.isLoading && !journey.error && steps.length > 0 ? (
          <div className="mt-4 flex flex-wrap gap-2">
            <span className="rounded-full border bg-background/70 px-3 py-1.5 text-xs font-medium">{steps.length} {t("w10.journey.activities")}</span>
            <span className="rounded-full border bg-background/70 px-3 py-1.5 text-xs font-medium">{t("w10.journey.localTime")}</span>
          </div>
        ) : null}
      </section>

      {!journey.isLoading && !journey.error && spotlightStep ? (
        <section className="mb-5 rounded-2xl border border-primary/25 bg-primary/5 p-4 sm:p-5">
          <div className="flex items-start gap-3">
            <div className="rounded-xl bg-primary/10 p-2"><Compass className="h-5 w-5 text-primary" /></div>
            <div className="min-w-0">
              <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-primary">
                {spotlightIsNow ? t("w10.journey.nowActivity") : t("w10.journey.nextActivity")}
              </p>
              <p className="mt-1 text-base font-semibold text-foreground">{spotlightStep.title}</p>
              <p className="mt-1 text-xs text-muted-foreground">
                {spotlightIsNow ? t("w10.journey.nowGuidance") : t("w10.journey.nextGuidance")}
              </p>
            </div>
          </div>
        </section>
      ) : null}

      <PortalQueryGate isLoading={journey.isLoading} error={journey.error} onRetry={() => void journey.refetch()}>
        {steps.length === 0 ? (
          <PortalEmpty icon={CalendarDays} title={t("w10.journey.emptyTitle")} body={t("w10.journey.empty")} />
        ) : (
          <ol className="relative ml-3 border-l border-border pl-6">
            {steps.map((step, index) => {
              const state = stepStates[index] ?? "neutral";
              const isNow = state === "now";
              const isNext = state === "upcoming" && index === nextStepIndex;
              const elapsed = state === "completed";
              const expanded = expandedStepId === step.stepId;
              return (
              <li key={step.stepId} className="relative pb-5 last:pb-0">
                <span className="absolute -left-[2.05rem] top-5 flex h-4 w-4 rounded-full border-4 border-background bg-primary shadow-sm" />
                <article className={`overflow-hidden rounded-2xl border bg-card shadow-sm transition-shadow hover:shadow-md ${isNow ? "border-primary/40 ring-1 ring-primary/10" : "border-border/80"}`}>
                  <div className="p-4 sm:p-5">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="mb-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-primary">{t("w10.journey.step")} {String(index + 1).padStart(2, "0")}</p>
                        <h3 className="break-words text-base font-semibold text-foreground sm:text-lg">{step.title}</h3>
                        <div className="mt-2 flex flex-wrap gap-2">
                          {isNow ? <span className="rounded-full bg-primary/15 px-2.5 py-1 text-[11px] font-semibold text-primary">{t("w10.journey.nowStep")}</span> : null}
                          {isNext ? <span className="rounded-full bg-primary/10 px-2.5 py-1 text-[11px] font-semibold text-primary">{t("w10.journey.nextStep")}</span> : null}
                          {elapsed ? <span className="rounded-full bg-muted px-2.5 py-1 text-[11px] font-semibold text-muted-foreground">{t("w10.journey.completed")}</span> : null}
                        </div>
                      </div>
                      {step.updates.length > 0 ? (
                        <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-500/10 px-2.5 py-1 text-xs font-medium text-amber-700 dark:text-amber-300">
                          <Megaphone className="h-3.5 w-3.5" /> {step.updates.length} {t("w10.journey.updates")}
                        </span>
                      ) : null}
                    </div>
                    <div className="mt-4 grid gap-3 sm:grid-cols-2">
                      <div className="rounded-xl bg-muted/55 p-3">
                        <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{t("w10.journey.when")}</p>
                        <JourneyTime planned={step.plannedStart} expected={step.expectedStart} locale={locale} timeZone={timeZone} pendingLabel={t("w10.journey.timePending")} />
                      </div>
                      <div className="rounded-xl bg-muted/55 p-3">
                        <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{t("w10.journey.where")}</p>
                        <p className="flex gap-2 break-words text-sm font-medium text-foreground">
                          <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                          {step.locationLabel || t("w10.journey.locationPending")}
                        </p>
                      </div>
                    </div>
                    <div className="mt-3 flex items-start gap-2 rounded-xl border border-border/60 bg-background/45 p-3">
                      <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                      <div>
                        <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{t("w10.journey.officialSource")}</p>
                        <p className="mt-0.5 text-xs font-medium text-foreground">{t("w10.journey.officialSourceBody")}</p>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => setExpandedStepId(expanded ? null : step.stepId)}
                      className="mt-4 flex w-full items-center justify-between rounded-xl border border-border/70 bg-background/60 px-3 py-2.5 text-left text-sm font-semibold text-foreground transition-colors hover:bg-muted/60"
                      aria-expanded={expanded}
                    >
                      <span>{expanded ? t("w10.journey.hideDetails") : t("w10.journey.showDetails")}</span>
                      <ChevronDown className={`h-4 w-4 transition-transform ${expanded ? "rotate-180" : ""}`} />
                    </button>
                    {expanded ? (
                      <div className="mt-3 space-y-3 rounded-xl border border-border/60 bg-muted/25 p-4">
                        <div className="flex gap-3">
                          <Clock3 className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                          <div>
                            <p className="text-sm font-semibold text-foreground">{t("w10.journey.dayProgram")}</p>
                            <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{t("w10.journey.dayProgramBody")}</p>
                          </div>
                        </div>
                        {step.updates.length > 0 ? (
                          <div className="border-t border-border/60 pt-3">
                            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{t("w10.journey.operationUpdates")}</p>
                            <div className="space-y-2">
                              {step.updates.map((update, updateIndex) => (
                                <div key={`${step.stepId}-${updateIndex}`} className="rounded-lg bg-background/70 p-3 text-xs text-foreground">
                                  {update.note || t("w10.journey.updateAvailable")}
                                </div>
                              ))}
                            </div>
                          </div>
                        ) : (
                          <p className="border-t border-border/60 pt-3 text-xs text-muted-foreground">{t("w10.journey.noUpdates")}</p>
                        )}
                      </div>
                    ) : null}
                  </div>
                </article>
              </li>
              );
            })}
          </ol>
        )}
      </PortalQueryGate>
    </PortalShell>
  );
}


function JourneyTime({
  planned,
  expected,
  locale,
  timeZone,
  pendingLabel,
}: {
  planned: string | null;
  expected: string | null;
  locale: string;
  timeZone?: string | null;
  pendingLabel: string;
}) {
  const effective = expected ?? planned;
  if (!effective) return <span className="text-xs text-muted-foreground">{pendingLabel}</span>;

  const date = new Date(effective);
  const timeParts = new Intl.DateTimeFormat("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    ...(timeZone ? { timeZone } : {}),
  }).formatToParts(date);
  const hour = timeParts.find((part) => part.type === "hour")?.value;
  const minute = timeParts.find((part) => part.type === "minute")?.value;
  const dateLabel = new Intl.DateTimeFormat(locale, {
    dateStyle: "medium",
    ...(timeZone ? { timeZone } : {}),
  }).format(date);

  if (hour === "00" && minute === "00") {
    return (
      <span className="text-xs text-foreground">
        {dateLabel} · <span className="text-muted-foreground">{pendingLabel}</span>
      </span>
    );
  }

  const timeLabel = new Intl.DateTimeFormat(locale, {
    hour: "2-digit",
    minute: "2-digit",
    ...(timeZone ? { timeZone } : {}),
  }).format(date);

  return <span className="text-xs text-foreground">{dateLabel}, {timeLabel}</span>;
}
