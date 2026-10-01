import { createFileRoute, Link, useParams } from "@tanstack/react-router";
import { ArrowRight, BedDouble, Bot, Bus, CalendarDays, MapPin, Megaphone, ShieldCheck, Sparkles, Ticket } from "lucide-react";

import { useI18n } from "@/lib/i18n";
import {
  buildAgenda,
  splitNowNext,
  useMyEventProgram,
  useMyJourney,
  useMyMessages,
  useMyMobility,
  useMyOverview,
  useMyStay,
  type PortalAgendaItem,
  type PortalOverview,
} from "@/lib/w10";
import { PortalShell } from "@/app/portal/portal-shell";
import { PortalCard, PortalQueryGate, PortalTag } from "@/app/portal/portal-states";
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
  const { locale } = useI18n();
  const ctx = timeZone ? { locale, timeZone } : { locale };
  return (
    <div className="min-w-0">
      {item.start ? <p className="mb-1 text-xs font-semibold uppercase tracking-[0.12em] text-primary">{formatDateTime(item.start, ctx)}</p> : null}
      <p className="break-words text-lg font-semibold text-foreground">{item.title}</p>
      {item.detail ? <p className="mt-1 break-words text-sm leading-relaxed text-muted-foreground">{item.detail}</p> : null}
    </div>
  );
}

function daysUntil(value: string | null) {
  if (!value) return null;
  const ms = new Date(value).getTime() - Date.now();
  if (!Number.isFinite(ms) || ms <= 0) return null;
  return Math.ceil(ms / 86_400_000);
}

function TripContextCard({ overview }: { overview: PortalOverview }) {
  const { locale } = useI18n();
  const ctx = overview.timezone ? { locale, timeZone: overview.timezone } : { locale };
  const destination = [overview.city, overview.region, overview.country].filter(Boolean).join(" · ");
  const start = overview.expectedStart ?? overview.plannedStart;
  const end = overview.expectedEnd ?? overview.plannedEnd;
  const period = start ? (end ? `${formatDate(start, ctx)} – ${formatDate(end, ctx)}` : formatDate(start, ctx)) : null;
  const countdown = daysUntil(start);

  return (
    <section className="relative overflow-hidden rounded-3xl border border-primary/25 bg-sidebar px-5 py-7 text-sidebar-foreground shadow-[var(--shadow-lift)] sm:px-8 sm:py-9">
      <div className="pointer-events-none absolute inset-0 command-canvas opacity-50" aria-hidden="true" />
      <div className="pointer-events-none absolute inset-0 hairline-grid opacity-[0.08]" aria-hidden="true" />
      <div className="relative">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-sidebar-primary">Sua próxima experiência</p>
          {countdown ? <span className="rounded-full border border-sidebar-primary/30 bg-sidebar-primary/10 px-3 py-1 text-xs font-semibold text-sidebar-primary">Faltam {countdown} dias</span> : null}
        </div>
        <h1 className="mt-4 max-w-3xl text-3xl font-semibold tracking-tight sm:text-5xl">{overview.name}</h1>
        <div className="mt-4 flex flex-wrap gap-x-5 gap-y-2 text-sm text-sidebar-foreground/70">
          {destination ? <span className="inline-flex items-center gap-1.5"><MapPin className="size-4 text-sidebar-primary" aria-hidden="true" />{destination}</span> : null}
          {period ? <span className="inline-flex items-center gap-1.5"><CalendarDays className="size-4 text-sidebar-primary" aria-hidden="true" />{period}</span> : null}
        </div>
        <p className="mt-6 max-w-2xl text-sm leading-relaxed text-sidebar-foreground/65">Tudo o que você precisa para viver sua viagem com clareza: próximos passos, roteiro, transporte, hospedagem, evento e avisos confirmados.</p>
        <div className="mt-5 flex flex-wrap gap-2">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-sidebar-primary/25 bg-sidebar-primary/10 px-3 py-1.5 text-xs font-medium text-sidebar-primary"><Sparkles className="size-3.5" />Experiência BSBTUR</span>
          <span className="inline-flex items-center gap-1.5 rounded-full border border-sidebar-foreground/15 bg-sidebar-foreground/5 px-3 py-1.5 text-xs font-medium text-sidebar-foreground/75"><ShieldCheck className="size-3.5" />COBS · informações confirmadas</span>
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
        <span className="mt-1 block truncate text-xs text-muted-foreground">{value}</span>
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

  const timeZone = overview.data?.timezone ?? null;
  const agenda = buildAgenda(journey.data ?? [], mobility.data ?? [], events.data ?? []);
  const { now, next } = splitNowNext(agenda);
  const unread = (messages.data ?? []).filter((m) => m.myFirstReadAt === null && m.status === "published").length;
  const legs = mobility.data ?? [];
  const stays = stay.data ?? [];
  const sessions = (events.data ?? []).reduce((acc, e) => acc + e.sessions.length, 0);
  const firstEventName = events.data?.[0]?.name;
  const historical = overview.data?.historical === true;
  const plannedStart = overview.data?.expectedStart ?? overview.data?.plannedStart ?? null;
  const upcoming = plannedStart ? new Date(plannedStart).getTime() > Date.now() : false;

  return (
    <PortalShell operationId={operationId} title={overview.data?.name ?? t("w10.portal.brand")} active="home">
      <PortalQueryGate isLoading={overview.isLoading} error={overview.error} onRetry={() => void overview.refetch()}>
        <div className="mx-auto flex w-full max-w-5xl flex-col gap-5 sm:gap-6">
          {overview.data ? <TripContextCard overview={overview.data} /> : null}

          {historical ? (
            <PortalCard><PortalTag>{t("w10.home.historical")}</PortalTag><p className="mt-2 text-sm text-muted-foreground">{t("w10.home.historicalBody")}</p></PortalCard>
          ) : (
            <div className="grid gap-4 lg:grid-cols-[1.35fr_0.65fr]">
              <section className="rounded-2xl border border-primary/30 bg-surface p-5 shadow-[var(--shadow-soft)] sm:p-6">
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-primary">Próximo passo</p>
                <div className="mt-3">{next ? <AgendaLine item={next} timeZone={timeZone} /> : <p className="text-sm leading-relaxed text-muted-foreground">{upcoming ? "As próximas etapas aparecerão aqui quando forem confirmadas." : t("w10.home.nothingNow")}</p>}</div>
              </section>
              <PortalCard title={t("w10.home.now")}>{now ? <AgendaLine item={now} timeZone={timeZone} /> : <p className="text-sm leading-relaxed text-muted-foreground">{upcoming ? "Sua viagem ainda não começou." : t("w10.home.nothingNow")}</p>}</PortalCard>
            </div>
          )}

          <section className="rounded-2xl border border-border/70 bg-card p-4 shadow-sm sm:p-5">
            <div className="flex items-start gap-3">
              <div className="rounded-xl bg-primary/10 p-2"><Megaphone className="size-4 text-primary" /></div>
              <div><p className="text-xs font-semibold uppercase tracking-[0.14em] text-primary">Antes de sair</p><p className="mt-1 text-sm leading-relaxed text-muted-foreground">Confira sempre <span className="font-medium text-foreground">Próximo passo</span> e <span className="font-medium text-foreground">Avisos</span>. Alterações operacionais confirmadas serão refletidas no COBS.</p></div>
            </div>
          </section>

          <section className="flex flex-col gap-3">
            <div className="px-1">
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-primary">Sua jornada</p>
              <h2 className="mt-1 text-xl font-semibold text-foreground">Tudo da sua experiência em um só lugar</h2>
              <p className="mt-1 text-sm text-muted-foreground">Abra cada área para ver apenas informações confirmadas da sua viagem.</p>
            </div>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              <ShortcutRow to="/my/$operationId/journey" operationId={operationId} icon={CalendarDays} label="Meu roteiro" value={(journey.data ?? []).length > 0 ? `${(journey.data ?? []).length} etapas` : t("w10.journey.empty")} />
              <ShortcutRow to="/my/$operationId/mobility" operationId={operationId} icon={Bus} label="Transporte" value={legs.length > 0 ? (legs[0]?.mySeat?.seatLabel ? `${t("w10.mobility.seat")} ${legs[0].mySeat.seatLabel}` : (legs[0]?.title ?? "")) : t("w10.mobility.empty")} />
              <ShortcutRow to="/my/$operationId/stay" operationId={operationId} icon={BedDouble} label="Hospedagem" value={stays.length > 0 ? (stays[0]?.property?.name ?? stays[0]?.name ?? "") : t("w10.stay.empty")} />
              <ShortcutRow to="/my/$operationId/events" operationId={operationId} icon={Ticket} label="Evento" value={sessions > 0 ? `${sessions} atividades` : (firstEventName ?? t("w10.events.empty"))} />
              <ShortcutRow to="/my/$operationId/messages" operationId={operationId} icon={Megaphone} label="Avisos" value={(messages.data ?? []).length > 0 ? (unread > 0 ? `${unread} novo${unread > 1 ? "s" : ""}` : ((messages.data ?? [])[0]?.title ?? "")) : t("w10.messages.empty")} />
              <ShortcutRow to="/my/$operationId/assistant" operationId={operationId} icon={Bot} label="Assistente COBS" value="Pergunte sobre informações confirmadas da sua viagem" />
            </div>
          </section>
        </div>
      </PortalQueryGate>
    </PortalShell>
  );
}
