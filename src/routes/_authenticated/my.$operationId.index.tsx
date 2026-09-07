import { createFileRoute, Link, useParams } from "@tanstack/react-router";
import {
  ArrowRight,
  BedDouble,
  Bot,
  Bus,
  CalendarDays,
  Megaphone,
  Ticket,
} from "lucide-react";

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
      { title: "My trip — COBS OS traveler portal" },
      {
        name: "description",
        content: "What is happening now, what comes next, and your transport, stay and notices.",
      },
      { property: "og:title", content: "My trip — COBS OS traveler portal" },
      { property: "og:description", content: "Now, next, transport, stay, program and notices." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
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
      {item.start ? (
        <p className="mb-1 text-xs font-semibold uppercase tracking-[0.12em] text-primary">
          {formatDateTime(item.start, ctx)}
        </p>
      ) : null}
      <p className="break-words text-lg font-semibold text-foreground">{item.title}</p>
      {item.detail ? (
        <p className="mt-1 break-words text-sm leading-relaxed text-muted-foreground">{item.detail}</p>
      ) : null}
    </div>
  );
}

function TripContextCard({ overview }: { overview: PortalOverview }) {
  const { locale } = useI18n();
  const ctx = overview.timezone ? { locale, timeZone: overview.timezone } : { locale };
  const destination = [overview.city, overview.region, overview.country].filter(Boolean).join(" · ");
  const start = overview.expectedStart ?? overview.plannedStart;
  const end = overview.expectedEnd ?? overview.plannedEnd;
  const period = start
    ? end
      ? `${formatDate(start, ctx)} – ${formatDate(end, ctx)}`
      : formatDate(start, ctx)
    : null;

  return (
    <div className="relative overflow-hidden rounded-2xl border border-border bg-surface px-5 py-5 shadow-[var(--shadow-soft)] sm:px-6 sm:py-6">
      <div
        className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-primary/70 to-transparent"
        aria-hidden="true"
      />
      <div className="relative flex flex-col gap-2">
        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-primary">Minha viagem</p>
        <h1 className="max-w-2xl text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
          {overview.name}
        </h1>
        <div className="flex flex-wrap gap-x-3 gap-y-1 text-sm text-muted-foreground">
          {destination ? <span>{destination}</span> : null}
          {period ? <span>{period}</span> : null}
        </div>
      </div>
    </div>
  );
}

function ShortcutRow({
  to,
  operationId,
  icon: Icon,
  label,
  value,
}: {
  to: string;
  operationId: string;
  icon: typeof Bus;
  label: string;
  value: string;
}) {
  return (
    <Link
      to={to}
      params={{ operationId }}
      className="group flex min-h-[64px] items-center gap-3 rounded-xl border border-border bg-surface px-4 py-3.5 transition-colors hover:border-border-strong hover:bg-elevated focus-ring"
    >
      <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-primary-soft text-primary">
        <Icon className="size-4" aria-hidden="true" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-semibold text-foreground">{label}</span>
        <span className="mt-0.5 block truncate text-xs text-muted-foreground">{value}</span>
      </span>
      <ArrowRight
        className="size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-primary"
        aria-hidden="true"
      />
    </Link>
  );
}

function PortalHome() {
  const { operationId } = useParams({ from: "/_authenticated/my/$operationId/" });
  const { t } = useI18n();

  const overview = useMyOverview(operationId);
  // Home loads only what Now/Next and the summary rows need.
  const journey = useMyJourney(operationId);
  const mobility = useMyMobility(operationId);
  const events = useMyEventProgram(operationId);
  const messages = useMyMessages(operationId);
  const stay = useMyStay(operationId);

  const timeZone = overview.data?.timezone ?? null;
  const agenda = buildAgenda(journey.data ?? [], mobility.data ?? [], events.data ?? []);
  const { now, next } = splitNowNext(agenda);

  const unread = (messages.data ?? []).filter(
    (m) => m.myFirstReadAt === null && m.status === "published",
  ).length;
  const legs = mobility.data ?? [];
  const stays = stay.data ?? [];
  const sessions = (events.data ?? []).reduce((acc, e) => acc + e.sessions.length, 0);
  const firstEventName = events.data?.[0]?.name;

  const historical = overview.data?.historical === true;
  const plannedStart = overview.data?.expectedStart ?? overview.data?.plannedStart ?? null;
  const upcoming = plannedStart ? new Date(plannedStart).getTime() > Date.now() : false;

  return (
    <PortalShell
      operationId={operationId}
      title={overview.data?.name ?? t("w10.portal.brand")}
      active="home"
    >
      <PortalQueryGate
        isLoading={overview.isLoading}
        error={overview.error}
        onRetry={() => void overview.refetch()}
      >
        <div className="mx-auto flex w-full max-w-5xl flex-col gap-5 sm:gap-6">
          {overview.data ? <TripContextCard overview={overview.data} /> : null}

          {historical ? (
            <PortalCard>
              <div className="flex flex-wrap items-center gap-2">
                <PortalTag>{t("w10.home.historical")}</PortalTag>
              </div>
              <p className="mt-2 text-sm text-muted-foreground">{t("w10.home.historicalBody")}</p>
            </PortalCard>
          ) : (
            <div className="grid gap-4 lg:grid-cols-[1.35fr_0.65fr]">
              <section className="rounded-2xl border border-primary/25 bg-surface p-5 shadow-[var(--shadow-soft)] sm:p-6">
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-primary">
                  Próximo passo
                </p>
                <div className="mt-3">
                  {next ? (
                    <AgendaLine item={next} timeZone={timeZone} />
                  ) : (
                    <p className="text-sm leading-relaxed text-muted-foreground">
                      {upcoming
                        ? "As próximas etapas aparecerão aqui quando forem confirmadas."
                        : t("w10.home.nothingNow")}
                    </p>
                  )}
                </div>
              </section>

              <PortalCard title={t("w10.home.now")}>
                {now ? (
                  <AgendaLine item={now} timeZone={timeZone} />
                ) : (
                  <p className="text-sm leading-relaxed text-muted-foreground">
                    {upcoming ? "Sua viagem ainda não começou." : t("w10.home.nothingNow")}
                  </p>
                )}
              </PortalCard>
            </div>
          )}

          <section className="flex flex-col gap-3">
            <div className="flex items-end justify-between gap-3 px-1">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                  Sua jornada
                </p>
                <p className="mt-1 text-sm text-muted-foreground">
                  Acompanhe programação, deslocamentos, hospedagem e avisos confirmados.
                </p>
              </div>
            </div>

            <div className="grid gap-2 sm:grid-cols-2">
              <ShortcutRow
                to="/my/$operationId/journey"
                operationId={operationId}
                icon={CalendarDays}
                label={t("w10.journey.title")}
                value={
                  (journey.data ?? []).length > 0
                    ? String((journey.data ?? []).length)
                    : t("w10.journey.empty")
                }
              />
              <ShortcutRow
                to="/my/$operationId/mobility"
                operationId={operationId}
                icon={Bus}
                label={t("w10.home.transport")}
                value={
                  legs.length > 0
                    ? legs[0]?.mySeat?.seatLabel
                      ? `${t("w10.mobility.seat")} ${legs[0].mySeat.seatLabel}`
                      : (legs[0]?.title ?? "")
                    : t("w10.mobility.empty")
                }
              />
              <ShortcutRow
                to="/my/$operationId/stay"
                operationId={operationId}
                icon={BedDouble}
                label={t("w10.home.stay")}
                value={
                  stays.length > 0
                    ? (stays[0]?.property?.name ?? stays[0]?.name ?? "")
                    : t("w10.stay.empty")
                }
              />
              <ShortcutRow
                to="/my/$operationId/events"
                operationId={operationId}
                icon={Ticket}
                label={t("w10.home.program")}
                value={
                  sessions > 0
                    ? String(sessions)
                    : firstEventName
                      ? firstEventName
                      : t("w10.events.empty")
                }
              />
              <ShortcutRow
                to="/my/$operationId/messages"
                operationId={operationId}
                icon={Megaphone}
                label={t("w10.home.messages")}
                value={
                  (messages.data ?? []).length > 0
                    ? unread > 0
                      ? `${unread}`
                      : ((messages.data ?? [])[0]?.title ?? "")
                    : t("w10.messages.empty")
                }
              />
              <ShortcutRow
                to="/my/$operationId/assistant"
                operationId={operationId}
                icon={Bot}
                label="Assistente COBS"
                value="Pergunte sobre informações confirmadas da sua viagem"
              />
            </div>
          </section>
        </div>
      </PortalQueryGate>
    </PortalShell>
  );
}
