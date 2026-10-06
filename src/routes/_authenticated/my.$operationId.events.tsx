import { createFileRoute, useParams } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { CalendarDays, MapPin, Ticket } from "lucide-react";

import { useI18n } from "@/lib/i18n";
import { useMyEventProgram, useMyOverview } from "@/lib/w10";
import {
  formatDateOnlyRange,
  timeToConfirmLabel,
  useMyEventSchedulePrecision,
} from "@/lib/w10-event-precision";
import { PortalShell } from "@/app/portal/portal-shell";
import { PortalCard, PortalEmpty, PortalQueryGate, PortalTag, PortalTime } from "@/app/portal/portal-states";

export const Route = createFileRoute("/_authenticated/my/$operationId/events")({
  head: () => ({
    meta: [
      { title: "My program — COBS OS traveler portal" },
      { name: "description", content: "Event sessions you can attend, with venue and times." },
      { property: "og:title", content: "My program — COBS OS traveler portal" },
      { property: "og:description", content: "Sessions, spaces and times for your events." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: PortalEvents,
});

function eventLocalDateKey(value: number | string, timeZone?: string | null) {
  return new Intl.DateTimeFormat("en-CA", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    ...(timeZone ? { timeZone } : {}),
  }).format(new Date(value));
}

function sessionIsPlaceholderMidnight(value: string | null, timeZone?: string | null) {
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

function sessionTemporalState(
  session: {
    plannedStart: string | null;
    plannedEnd: string | null;
    expectedStart: string | null;
    expectedEnd: string | null;
  },
  nowMs: number,
  timeZone?: string | null,
) {
  const start = session.expectedStart ?? session.plannedStart;
  const end = session.expectedEnd ?? session.plannedEnd;
  const startMs = start ? new Date(start).getTime() : null;
  const endMs = end ? new Date(end).getTime() : null;
  const startPlaceholder = sessionIsPlaceholderMidnight(start, timeZone);
  const endPlaceholder = sessionIsPlaceholderMidnight(end, timeZone);

  if (endMs !== null && !endPlaceholder && endMs <= nowMs) return "completed" as const;
  if (
    startMs !== null &&
    endMs !== null &&
    !startPlaceholder &&
    !endPlaceholder &&
    startMs <= nowMs &&
    nowMs < endMs
  ) {
    return "now" as const;
  }
  if (startMs !== null && !startPlaceholder && startMs > nowMs) return "upcoming" as const;
  return "neutral" as const;
}

function eventTemporalState(
  event: {
    plannedStart: string | null;
    plannedEnd: string | null;
    expectedStart: string | null;
    expectedEnd: string | null;
    closedOut: boolean;
  },
  schedulePrecision: "datetime" | "date_only",
  nowMs: number,
  timeZone?: string | null,
) {
  if (event.closedOut) return "completed" as const;

  const start = event.expectedStart ?? event.plannedStart;
  const end = event.expectedEnd ?? event.plannedEnd;
  const startMs = start ? new Date(start).getTime() : null;
  const endMs = end ? new Date(end).getTime() : null;

  if (schedulePrecision === "date_only") {
    const today = eventLocalDateKey(nowMs, timeZone);
    if (end && eventLocalDateKey(end, timeZone) < today) return "completed" as const;
    if (start && eventLocalDateKey(start, timeZone) > today) return "upcoming" as const;
    return "neutral" as const;
  }

  if (endMs !== null && endMs <= nowMs) return "completed" as const;
  if (startMs !== null && endMs !== null && startMs <= nowMs && nowMs < endMs) {
    return "now" as const;
  }
  if (startMs !== null && startMs > nowMs) return "upcoming" as const;

  return "neutral" as const;
}

function PortalEvents() {
  const { operationId } = useParams({ from: "/_authenticated/my/$operationId/events" });
  const { t, locale } = useI18n();
  const overview = useMyOverview(operationId);
  const events = useMyEventProgram(operationId);
  const precision = useMyEventSchedulePrecision(operationId);
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

  const eventRows = events.data ?? [];
  const eventStates = eventRows.map((event) => {
    const tz = event.timezone ?? event.venue?.timezone ?? overview.data?.timezone ?? null;
    return eventTemporalState(
      event,
      precision.data?.[event.eventId] ?? "datetime",
      nowMs,
      tz,
    );
  });
  const nextEventIndex = eventStates.findIndex((state) => state === "upcoming");

  return (
    <PortalShell
      operationId={operationId}
      title={overview.data?.name ?? t("w10.portal.brand")}
      active="events"
    >
      <section className="mb-5 rounded-3xl border border-border/70 bg-gradient-to-br from-card via-card to-muted/50 p-5 shadow-sm">
        <div className="flex items-start gap-3"><div className="rounded-2xl bg-primary/10 p-3"><Ticket className="h-5 w-5 text-primary" /></div><div><p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-primary">{events.data?.[0]?.name ?? t("w10.events.title")}</p><h2 className="mt-1 text-xl font-semibold text-foreground">{t("w10.events.title")}</h2><p className="mt-1 text-sm text-muted-foreground">{t("w10.events.heroBody")}</p></div></div>
        {events.data?.[0] ? <div className="mt-4 grid gap-2 sm:grid-cols-2"><div className="flex gap-2 rounded-xl border bg-background/60 p-3 text-xs text-foreground"><CalendarDays className="h-4 w-4 shrink-0 text-primary" />{formatDateOnlyRange(events.data[0].plannedStart, events.data[0].plannedEnd, events.data[0].timezone ?? events.data[0].venue?.timezone ?? overview.data?.timezone ?? null, locale) ?? t("w10.events.datePending")}</div><div className="flex gap-2 rounded-xl border bg-background/60 p-3 text-xs text-foreground"><MapPin className="h-4 w-4 shrink-0 text-primary" />{[events.data[0].venue?.name, events.data[0].venue?.city].filter(Boolean).join(" · ") || t("w10.events.locationPending")}</div></div> : null}
      </section>
      <PortalQueryGate
        isLoading={events.isLoading || precision.isLoading}
        error={events.error ?? precision.error}
        onRetry={() => {
          void events.refetch();
          void precision.refetch();
        }}
      >
        {eventRows.length === 0 ? (
          <PortalEmpty icon={Ticket} title={t("w10.events.emptyTitle")} body={t("w10.events.empty")} />
        ) : (
          <div className="flex flex-col gap-4">
            {eventRows.map((ev, index) => {
              const tz = ev.timezone ?? ev.venue?.timezone ?? overview.data?.timezone ?? null;
              const venue = [ev.venue?.name, ev.venue?.city].filter(Boolean).join(" · ");
              const dateOnly = precision.data?.[ev.eventId] === "date_only";
              const dateRange = dateOnly
                ? formatDateOnlyRange(ev.plannedStart, ev.plannedEnd, tz, locale)
                : null;
              const state = eventStates[index] ?? "neutral";
              const isCurrent = state === "now";
              const isNext = state === "upcoming" && index === nextEventIndex;
              const isCompleted = state === "completed";
              const sessionStates = ev.sessions.map((session) =>
                sessionTemporalState(session, nowMs, tz),
              );
              const nextSessionIndex = sessionStates.findIndex(
                (sessionState) => sessionState === "upcoming",
              );
              return (
                <PortalCard key={ev.eventId}>
                  <div className="flex flex-col items-start gap-2 sm:grid sm:grid-cols-[minmax(0,1fr)_auto] sm:gap-3">
                    <h3 className="min-w-0 break-words text-base font-medium text-foreground">
                      {ev.name ?? "—"}
                    </h3>
                    <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto sm:justify-end">
                      {isCurrent ? <PortalTag>{t("w10.events.current")}</PortalTag> : null}
                      {isNext ? <PortalTag>{t("w10.events.next")}</PortalTag> : null}
                      {isCompleted ? (
                        <span className="inline-flex shrink-0 items-center rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
                          {t("w10.events.completed")}
                        </span>
                      ) : null}
                    </div>
                  </div>
                  <p className="mt-1 break-words text-sm text-muted-foreground">
                    {t("w10.events.venue")}: {venue || t("w10.events.locationPending")}
                  </p>
                  <div className="mt-1">
                    {dateOnly ? (
                      <p className="text-sm text-muted-foreground">
                        {dateRange
                          ? `${dateRange} · ${timeToConfirmLabel(locale)}`
                          : t("w10.events.datePending")}
                      </p>
                    ) : (
                      <PortalTime
                        planned={ev.plannedStart}
                        expected={ev.expectedStart}
                        timeZone={tz}
                      />
                    )}
                  </div>

                  {ev.sessions.length === 0 ? (
                    <p className="mt-3 text-sm text-muted-foreground">{t("w10.events.sessionsPending")}</p>
                  ) : (
                    <ul className="mt-3 flex flex-col gap-3 border-t border-border pt-3">
                      {ev.sessions.map((s, sessionIndex) => {
                        const sessionState = sessionStates[sessionIndex] ?? "neutral";
                        const sessionIsCurrent = sessionState === "now";
                        const sessionIsNext =
                          sessionState === "upcoming" && sessionIndex === nextSessionIndex;
                        const sessionIsCompleted = sessionState === "completed";
                        return (
                        <li key={s.sessionId} className="min-w-0">
                          <div className="flex flex-wrap items-start justify-between gap-2">
                            <p className="min-w-0 break-words text-sm font-medium text-foreground">
                              {s.title ?? "—"}
                            </p>
                            <div className="flex flex-wrap items-center gap-1.5">
                              {sessionIsCurrent ? <PortalTag>{t("w10.events.sessionCurrent")}</PortalTag> : null}
                              {sessionIsNext ? <PortalTag>{t("w10.events.sessionNext")}</PortalTag> : null}
                              {sessionIsCompleted ? (
                                <span className="inline-flex shrink-0 items-center rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
                                  {t("w10.events.sessionCompleted")}
                                </span>
                              ) : null}
                            </div>
                          </div>
                          {s.space?.name || s.space?.spaceLabel ? (
                            <p className="mt-0.5 break-words text-xs text-muted-foreground">
                              {s.space?.name ?? s.space?.spaceLabel}
                              {s.space?.floorLabel ? ` · ${s.space.floorLabel}` : ""}
                            </p>
                          ) : null}
                          <div className="mt-1">
                            <PortalTime
                              planned={s.plannedStart}
                              expected={s.expectedStart}
                              timeZone={tz}
                            />
                          </div>
                          {s.description ? (
                            <p className="mt-1 break-words text-sm text-muted-foreground">
                              {s.description}
                            </p>
                          ) : null}
                        </li>
                        );
                      })}
                    </ul>
                  )}
                </PortalCard>
              );
            })}
          </div>
        )}
      </PortalQueryGate>
    </PortalShell>
  );
}
