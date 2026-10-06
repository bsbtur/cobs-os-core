import { createFileRoute, useParams } from "@tanstack/react-router";
import { CalendarDays, MapPin, Ticket } from "lucide-react";

import { useI18n } from "@/lib/i18n";
import { useMyEventProgram, useMyOverview } from "@/lib/w10";
import {
  formatDateOnlyRange,
  timeToConfirmLabel,
  useMyEventSchedulePrecision,
} from "@/lib/w10-event-precision";
import { PortalShell } from "@/app/portal/portal-shell";
import { PortalCard, PortalEmpty, PortalQueryGate, PortalTime } from "@/app/portal/portal-states";

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

function PortalEvents() {
  const { operationId } = useParams({ from: "/_authenticated/my/$operationId/events" });
  const { t, locale } = useI18n();
  const overview = useMyOverview(operationId);
  const events = useMyEventProgram(operationId);
  const precision = useMyEventSchedulePrecision(operationId);

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
        {(events.data ?? []).length === 0 ? (
          <PortalEmpty icon={Ticket} title={t("w10.events.emptyTitle")} body={t("w10.events.empty")} />
        ) : (
          <div className="flex flex-col gap-4">
            {(events.data ?? []).map((ev) => {
              const tz = ev.timezone ?? ev.venue?.timezone ?? overview.data?.timezone ?? null;
              const venue = [ev.venue?.name, ev.venue?.city].filter(Boolean).join(" · ");
              const dateOnly = precision.data?.[ev.eventId] === "date_only";
              const dateRange = dateOnly
                ? formatDateOnlyRange(ev.plannedStart, ev.plannedEnd, tz, locale)
                : null;
              return (
                <PortalCard key={ev.eventId}>
                  <h3 className="break-words text-base font-medium text-foreground">
                    {ev.name ?? "—"}
                  </h3>
                  {venue ? (
                    <p className="mt-1 break-words text-sm text-muted-foreground">
                      {t("w10.events.venue")}: {venue}
                    </p>
                  ) : null}
                  <div className="mt-1">
                    {dateOnly ? (
                      <p className="text-sm text-muted-foreground">
                        {dateRange ?? "—"} · {timeToConfirmLabel(locale)}
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
                      {ev.sessions.map((s) => (
                        <li key={s.sessionId} className="min-w-0">
                          <p className="break-words text-sm font-medium text-foreground">
                            {s.title ?? "—"}
                          </p>
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
                      ))}
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
