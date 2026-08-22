import { createFileRoute, useParams } from "@tanstack/react-router";

import { useI18n } from "@/lib/i18n";
import { useMyEventProgram, useMyOverview } from "@/lib/w10";
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
  const { t } = useI18n();
  const overview = useMyOverview(operationId);
  const events = useMyEventProgram(operationId);

  return (
    <PortalShell
      operationId={operationId}
      title={overview.data?.name ?? t("w10.portal.brand")}
      active="events"
    >
      <h2 className="mb-3 text-lg font-semibold text-foreground">{t("w10.events.title")}</h2>
      <PortalQueryGate
        isLoading={events.isLoading}
        error={events.error}
        onRetry={() => void events.refetch()}
      >
        {(events.data ?? []).length === 0 ? (
          <PortalEmpty body={t("w10.events.empty")} />
        ) : (
          <div className="flex flex-col gap-4">
            {(events.data ?? []).map((ev) => {
              const tz = ev.timezone ?? ev.venue?.timezone ?? overview.data?.timezone ?? null;
              const venue = [ev.venue?.name, ev.venue?.city].filter(Boolean).join(" · ");
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
                    <PortalTime
                      planned={ev.plannedStart}
                      expected={ev.expectedStart}
                      timeZone={tz}
                    />
                  </div>

                  {ev.sessions.length === 0 ? (
                    <p className="mt-3 text-sm text-muted-foreground">{t("w10.events.empty")}</p>
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
