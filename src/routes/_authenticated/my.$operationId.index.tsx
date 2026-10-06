import { useEffect, useState } from "react";
import { createFileRoute, Link, useParams } from "@tanstack/react-router";
import { ArrowRight, BedDouble, Bot, Bus, CalendarDays, MapPin, Megaphone, ShieldCheck, Sparkles, Ticket } from "lucide-react";

import { useI18n } from "@/lib/i18n";
import {
  buildAgenda,
  useMyEventProgram,
  useMyJourney,
  useMyMessages,
  useMyMobility,
  useMyOverview,
  useMyStay,
  type PortalAgendaItem,
  type PortalOverview,
  type PortalStay,
} from "@/lib/w10";
import { PortalShell } from "@/app/portal/portal-shell";
import { PortalCard, PortalQueryGate, PortalTag } from "@/app/portal/portal-states";
import { PanelSkeleton } from "@/components/feedback/loading";
import { formatDate, formatDateTime } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/my/$operationId/")({
  head: () => ({
    meta: [
      { title: "Minha viagem — COBS OS" },
      { name: "description", content: "Sua experiência, programação, transporte, hospedagem e avisos em um só lugar." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: PortalHome,
});

function AgendaLine({ item, timeZone }: { item: PortalAgendaItem; timeZone: string | null }) {
  const { locale, t } = useI18n();
  const ctx = timeZone ? { locale, timeZone } : { locale };
  const start = item.start ? new Date(item.start) : null;
  const isMidnightPlaceholder =
    start !== null &&
    new Intl.DateTimeFormat("en-CA", {
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
      ...(timeZone ? { timeZone } : {}),
    }).format(start) === "00:00";
  return (
    <div className="min-w-0">
      {item.start ? (
        <p className="mb-1 text-xs font-semibold uppercase tracking-[0.12em] text-primary">
          {isMidnightPlaceholder ? `${formatDate(item.start, ctx)} · ${t("w10.home.timePending")}` : formatDateTime(item.start, ctx)}
        </p>
      ) : null}
      <p className="break-words text-lg font-semibold text-foreground">{item.title}</p>
      {item.detail ? <p className="mt-1 break-words text-sm leading-relaxed text-muted-foreground">{item.detail}</p> : null}
    </div>
  );
}

function daysUntil(value: string | null, at: number = Date.now()) {
  if (!value) return null;
  const ms = new Date(value).getTime() - at;
  if (!Number.isFinite(ms) || ms <= 0) return null;
  return Math.ceil(ms / 86_400_000);
}

function homeLocalDateKey(value: number | string, timeZone?: string | null) {
  return new Intl.DateTimeFormat("en-CA", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    ...(timeZone ? { timeZone } : {}),
  }).format(new Date(value));
}

function homeIsPlaceholderMidnight(value: string | null, timeZone?: string | null) {
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

function splitHomeNowNext(
  agenda: PortalAgendaItem[],
  nowMs: number,
  timeZone?: string | null,
) {
  const today = homeLocalDateKey(nowMs, timeZone);

  const now =
    agenda.find((item) => {
      if (!item.start || homeIsPlaceholderMidnight(item.start, timeZone)) return false;
      const startMs = new Date(item.start).getTime();
      const endMs = item.end ? new Date(item.end).getTime() : null;
      if (!Number.isFinite(startMs)) return false;
      return startMs <= nowMs && (endMs === null ? nowMs - startMs < 3 * 3600_000 : nowMs < endMs);
    }) ?? null;

  const next =
    agenda.find((item) => {
      if (!item.start) return false;
      if (homeIsPlaceholderMidnight(item.start, timeZone)) {
        return homeLocalDateKey(item.start, timeZone) >= today;
      }
      const startMs = new Date(item.start).getTime();
      return Number.isFinite(startMs) && startMs > nowMs;
    }) ?? null;

  return { now, next };
}

function selectHomeStay(stays: PortalStay[], nowMs: number, fallbackTimeZone?: string | null) {
  const todayByTimeZone = new Map<string, string>();
  const todayFor = (timeZone?: string | null) => {
    const key = timeZone ?? "";
    const cached = todayByTimeZone.get(key);
    if (cached) return cached;
    const value = homeLocalDateKey(nowMs, timeZone);
    todayByTimeZone.set(key, value);
    return value;
  };

  const stateFor = (stay: PortalStay) => {
    const timeZone = stay.property?.timezone ?? fallbackTimeZone ?? null;
    const checkIn = stay.expectedCheckIn ?? stay.plannedCheckIn;
    const checkOut = stay.expectedCheckOut ?? stay.plannedCheckOut;
    const checkInMs = checkIn ? new Date(checkIn).getTime() : null;
    const checkOutMs = checkOut ? new Date(checkOut).getTime() : null;
    const checkInIsDateOnly = checkIn ? homeIsPlaceholderMidnight(checkIn, timeZone) : false;
    const checkOutIsDateOnly = checkOut ? homeIsPlaceholderMidnight(checkOut, timeZone) : false;
    const today = todayFor(timeZone);

    const completed =
      (checkOutMs !== null && !checkOutIsDateOnly && checkOutMs <= nowMs) ||
      (checkOut !== null && checkOutIsDateOnly && homeLocalDateKey(checkOut, timeZone) < today);
    if (completed) return "completed" as const;

    if (stay.checkinOpen) return "current" as const;

    if (
      checkInMs !== null &&
      !checkInIsDateOnly &&
      checkInMs <= nowMs &&
      checkOutMs !== null &&
      !checkOutIsDateOnly &&
      nowMs < checkOutMs
    ) {
      return "current" as const;
    }

    if (
      (checkInMs !== null && !checkInIsDateOnly && checkInMs > nowMs) ||
      (checkIn !== null && checkInIsDateOnly && homeLocalDateKey(checkIn, timeZone) >= today)
    ) {
      return "upcoming" as const;
    }

    return "neutral" as const;
  };

  return (
    stays.find((stay) => stateFor(stay) === "current") ??
    stays.find((stay) => stateFor(stay) === "upcoming") ??
    stays[0] ??
    null
  );
}

function TripContextCard({ overview, nowMs }: { overview: PortalOverview; nowMs: number }) {
  const { locale, t } = useI18n();
  const ctx = overview.timezone ? { locale, timeZone: overview.timezone } : { locale };
  const destination = [overview.city, overview.region, overview.country].filter(Boolean).join(" · ");
  const start = overview.expectedStart ?? overview.plannedStart;
  const end = overview.expectedEnd ?? overview.plannedEnd;
  const period = start ? (end ? `${formatDate(start, ctx)} – ${formatDate(end, ctx)}` : formatDate(start, ctx)) : null;
  const countdown = daysUntil(start, nowMs);

  return (
    <section className="relative overflow-hidden rounded-3xl border border-primary/25 bg-sidebar px-5 py-7 text-sidebar-foreground shadow-[var(--shadow-lift)] sm:px-8 sm:py-9">
      <div className="pointer-events-none absolute inset-0 command-canvas opacity-50" aria-hidden="true" />
      <div className="pointer-events-none absolute inset-0 hairline-grid opacity-[0.08]" aria-hidden="true" />
      <div className="relative">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-sidebar-primary">{t("w10.home.experienceEyebrow")}</p>
          {countdown ? <span className="rounded-full border border-sidebar-primary/30 bg-sidebar-primary/10 px-3 py-1 text-xs font-semibold text-sidebar-primary">{countdown === 1 ? t("w10.home.dayLeft") : t("w10.home.daysLeft").replace("{count}", String(countdown))}</span> : null}
        </div>
        <h1 className="mt-4 max-w-3xl text-3xl font-semibold tracking-tight sm:text-5xl">{overview.name}</h1>
        <div className="mt-4 flex flex-wrap gap-x-5 gap-y-2 text-sm text-sidebar-foreground/70">
          {destination ? <span className="inline-flex items-center gap-1.5"><MapPin className="size-4 text-sidebar-primary" aria-hidden="true" />{destination}</span> : null}
          {period ? <span className="inline-flex items-center gap-1.5"><CalendarDays className="size-4 text-sidebar-primary" aria-hidden="true" />{period}</span> : null}
        </div>
        <p className="mt-6 max-w-2xl text-sm leading-relaxed text-sidebar-foreground/65">{t("w10.home.heroBody")}</p>
        <div className="mt-5 flex flex-wrap gap-2">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-sidebar-primary/25 bg-sidebar-primary/10 px-3 py-1.5 text-xs font-medium text-sidebar-primary"><Sparkles className="size-3.5" />{t("w10.home.bsbturExperience")}</span>
          <span className="inline-flex items-center gap-1.5 rounded-full border border-sidebar-foreground/15 bg-sidebar-foreground/5 px-3 py-1.5 text-xs font-medium text-sidebar-foreground/75"><ShieldCheck className="size-3.5" />{t("w10.home.confirmedInfo")}</span>
        </div>
      </div>
    </section>
  );
}

function ShortcutRow({ to, operationId, icon: Icon, label, value }: { to: string; operationId: string; icon: typeof Bus; label: string; value: string }) {
  return (
    <Link to={to} params={{ operationId }} className="group relative flex min-h-[88px] items-center gap-4 overflow-hidden rounded-2xl border border-border bg-surface px-4 py-4 shadow-[var(--shadow-soft)] transition duration-300 hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-[var(--shadow-lift)] focus-ring">
      <span className="grid size-12 shrink-0 place-items-center rounded-2xl bg-primary-soft text-primary"><Icon className="size-5" aria-hidden="true" /></span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-semibold text-foreground">{label}</span>
        <span className="mt-1 block line-clamp-2 text-xs leading-relaxed text-muted-foreground">{value}</span>
      </span>
      <ArrowRight className="size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-1 group-hover:text-primary" aria-hidden="true" />
    </Link>
  );
}

function PortalHome() {
  const { operationId } = useParams({ from: "/_authenticated/my/$operationId/" });
  const { t } = useI18n();
  const overview = useMyOverview(operationId);
  const journey = useMyJourney(operationId);
  const mobility = useMyMobility(operationId);
  const events = useMyEventProgram(operationId);
  const messages = useMyMessages(operationId);
  const stay = useMyStay(operationId);
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

  const timeZone = overview.data?.timezone ?? null;
  const agenda = buildAgenda(journey.data ?? [], mobility.data ?? [], events.data ?? []);
  const { now, next } = splitHomeNowNext(agenda, nowMs, timeZone);
  const publishedMessages = (messages.data ?? []).filter((m) => m.status === "published");
  const unread = publishedMessages.filter((m) => m.myFirstReadAt === null).length;
  const latestPublishedMessage = publishedMessages[0] ?? null;
  const legs = mobility.data ?? [];
  const stays = stay.data ?? [];
  const eventRows = events.data ?? [];
  const sessions = eventRows.reduce((acc, e) => acc + e.sessions.length, 0);
  const firstEventName = eventRows[0]?.name;
  const showEventShortcut = eventRows.length > 0;
  const homeStay = selectHomeStay(stays, nowMs, timeZone);
  const activeRoom = homeStay?.myRoom.find((room) => room.active) ?? null;
  const journeyCount = (journey.data ?? []).length;
  const journeySummary =
    journeyCount === 1
      ? t("w10.home.experienceSingle")
      : t("w10.home.experienceMany").replace("{count}", String(journeyCount));
  const hasOutbound = legs.some((leg) => leg.legKind === "outbound");
  const hasReturn = legs.some((leg) => leg.legKind === "return");
  const hasLocalTransfers = legs.some((leg) => !["outbound", "return"].includes(leg.legKind ?? ""));
  const transportSummary =
    legs.length === 0
      ? t("w10.mobility.empty")
      : hasOutbound && hasReturn && hasLocalTransfers
        ? t("w10.home.transportCoverage")
        : legs.length === 1
          ? t("w10.home.transportSingle")
          : t("w10.home.transportPlanned").replace("{count}", String(legs.length));
  const staySummary = homeStay
    ? `${homeStay.property?.name ?? homeStay.name ?? t("w10.home.stayShortcut")} · ${
        activeRoom?.label ?? t("w10.home.accommodationPending")
      }`
    : t("w10.stay.empty");
  const historical = overview.data?.historical === true;
  const plannedStart = overview.data?.expectedStart ?? overview.data?.plannedStart ?? null;
  const upcoming = plannedStart ? new Date(plannedStart).getTime() > nowMs : false;
  const experienceLoading = journey.isLoading || mobility.isLoading || events.isLoading || messages.isLoading || stay.isLoading;
  const experienceError = journey.error ?? mobility.error ?? events.error ?? messages.error ?? stay.error;
  const retryExperience = () => {
    void Promise.all([journey.refetch(), mobility.refetch(), events.refetch(), messages.refetch(), stay.refetch()]);
  };

  return (
    <PortalShell operationId={operationId} title={overview.data?.name ?? t("w10.portal.brand")} active="home">
      <PortalQueryGate isLoading={overview.isLoading} error={overview.error} onRetry={() => void overview.refetch()}>
        <div className="mx-auto flex w-full max-w-5xl flex-col gap-5 sm:gap-6">
          {overview.data ? <TripContextCard overview={overview.data} nowMs={nowMs} /> : null}

          {experienceLoading ? (
            <PanelSkeleton rows={6} />
          ) : experienceError ? (
            <PortalQueryGate isLoading={false} error={experienceError} onRetry={retryExperience}>
              {null}
            </PortalQueryGate>
          ) : (
            <>
                        {historical ? (
                          <PortalCard><PortalTag>{t("w10.home.historical")}</PortalTag><p className="mt-2 text-sm text-muted-foreground">{t("w10.home.historicalBody")}</p></PortalCard>
                        ) : (
                          <div className="grid gap-4 lg:grid-cols-[1.35fr_0.65fr]">
                            <section className="rounded-2xl border border-primary/30 bg-surface p-5 shadow-[var(--shadow-soft)] sm:p-6">
                              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-primary">{t("w10.home.nextStep")}</p>
                              <div className="mt-3">{next ? <AgendaLine item={next} timeZone={timeZone} /> : <p className="text-sm leading-relaxed text-muted-foreground">{upcoming ? t("w10.home.upcomingPending") : t("w10.home.nothingNext")}</p>}</div>
                            </section>
                            <PortalCard title={t("w10.home.now")}>{now ? <AgendaLine item={now} timeZone={timeZone} /> : <p className="text-sm leading-relaxed text-muted-foreground">{upcoming ? t("w10.home.tripNotStarted") : t("w10.home.nothingNow")}</p>}</PortalCard>
                          </div>
                        )}
              
                        <section className="rounded-2xl border border-border/70 bg-card p-4 shadow-sm sm:p-5">
                          <div className="flex items-start gap-3">
                            <div className="rounded-xl bg-primary/10 p-2"><Megaphone className="size-4 text-primary" /></div>
                            <div><p className="text-xs font-semibold uppercase tracking-[0.14em] text-primary">{t("w10.home.beforeLeaving")}</p><p className="mt-1 text-sm leading-relaxed text-muted-foreground">{t("w10.home.beforeLeavingBody")}</p></div>
                          </div>
                        </section>
              
                        <section className="flex flex-col gap-3">
                          <div className="px-1">
                            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-primary">{t("w10.home.journeyEyebrow")}</p>
                            <h2 className="mt-1 text-xl font-semibold text-foreground">{t("w10.home.allInOne")}</h2>
                            <p className="mt-1 text-sm text-muted-foreground">{t("w10.home.areasBody")}</p>
                          </div>
                          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                            <ShortcutRow to="/my/$operationId/journey" operationId={operationId} icon={CalendarDays} label={t("w10.home.journeyShortcut")} value={journeyCount > 0 ? journeySummary : t("w10.journey.empty")} />
                            <ShortcutRow to="/my/$operationId/mobility" operationId={operationId} icon={Bus} label={t("w10.home.transportShortcut")} value={transportSummary} />
                            <ShortcutRow to="/my/$operationId/stay" operationId={operationId} icon={BedDouble} label={t("w10.home.stayShortcut")} value={staySummary} />
                            {showEventShortcut ? (
                              <ShortcutRow to="/my/$operationId/events" operationId={operationId} icon={Ticket} label={t("w10.home.eventShortcut")} value={sessions > 0 ? `${sessions} ${t("w10.home.activities")}` : (firstEventName ?? t("w10.events.empty"))} />
                            ) : null}
                            <ShortcutRow to="/my/$operationId/messages" operationId={operationId} icon={Megaphone} label={t("w10.home.messagesShortcut")} value={unread > 0 ? `${unread} ${t(unread > 1 ? "w10.home.newNotices" : "w10.home.newNotice")}` : (latestPublishedMessage?.title ?? t("w10.messages.empty"))} />
                            <ShortcutRow to="/my/$operationId/assistant" operationId={operationId} icon={Bot} label={t("w10.home.assistantShortcut")} value={t("w10.home.assistantBody")} />
                          </div>
                        </section>
            </>
          )}
        </div>
      </PortalQueryGate>
    </PortalShell>
  );
}
