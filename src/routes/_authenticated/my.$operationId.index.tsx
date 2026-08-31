import { createFileRoute, Link, useParams } from "@tanstack/react-router";
import { BedDouble, Bot, Bus, CalendarDays, Megaphone, Ticket } from "lucide-react";

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
} from "@/lib/w10";
import { PortalShell } from "@/app/portal/portal-shell";
import { PortalCard, PortalQueryGate, PortalTag } from "@/app/portal/portal-states";
import { formatDateTime } from "@/lib/format";

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
      <p className="break-words text-base font-medium text-foreground">{item.title}</p>
      {item.detail ? (
        <p className="mt-0.5 break-words text-sm text-muted-foreground">{item.detail}</p>
      ) : null}
      {item.start ? (
        <p className="mt-1 text-xs text-muted-foreground">{formatDateTime(item.start, ctx)}</p>
      ) : null}
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
      className="flex min-h-[56px] items-center gap-3 rounded-xl border border-border bg-elevated/60 px-4 py-3"
    >
      <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-primary-soft text-primary">
        <Icon className="size-4" aria-hidden="true" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-medium text-foreground">{label}</span>
        <span className="block truncate text-xs text-muted-foreground">{value}</span>
      </span>
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

  const historical = overview.data?.historical === true;

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
        <div className="flex flex-col gap-4">
          {historical ? (
            <PortalCard>
              <div className="flex flex-wrap items-center gap-2">
                <PortalTag>{t("w10.home.historical")}</PortalTag>
              </div>
              <p className="mt-2 text-sm text-muted-foreground">{t("w10.home.historicalBody")}</p>
            </PortalCard>
          ) : (
            <>
              <PortalCard title={t("w10.home.now")}>
                {now ? (
                  <AgendaLine item={now} timeZone={timeZone} />
                ) : (
                  <p className="text-sm text-muted-foreground">{t("w10.home.nothingNow")}</p>
                )}
              </PortalCard>

              <PortalCard title={t("w10.home.next")}>
                {next ? (
                  <AgendaLine item={next} timeZone={timeZone} />
                ) : (
                  <p className="text-sm text-muted-foreground">{t("w10.home.nothingNext")}</p>
                )}
              </PortalCard>
            </>
          )}

          <div className="flex flex-col gap-2">
            <ShortcutRow
              to="/my/$operationId/assistant"
              operationId={operationId}
              icon={Bot}
              label="Assistente COBS"
              value="Pergunte sobre informações confirmadas da sua viagem"
            />
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
              value={sessions > 0 ? String(sessions) : t("w10.events.empty")}
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
          </div>
        </div>
      </PortalQueryGate>
    </PortalShell>
  );
}
