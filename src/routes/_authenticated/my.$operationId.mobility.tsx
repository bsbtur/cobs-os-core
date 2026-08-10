import { createFileRoute, useParams } from "@tanstack/react-router";

import { useI18n } from "@/lib/i18n";
import { useMyMobility, useMyOverview } from "@/lib/w10";
import { PortalShell } from "@/app/portal/portal-shell";
import {
  PortalCard,
  PortalEmpty,
  PortalQueryGate,
  PortalTag,
  PortalTime,
} from "@/app/portal/portal-states";

export const Route = createFileRoute("/_authenticated/my/$operationId/mobility")({
  head: () => ({
    meta: [
      { title: "My transport — COBS OS traveler portal" },
      { name: "description", content: "Your transfers, pickup points, times and seat." },
      { property: "og:title", content: "My transport — COBS OS traveler portal" },
      { property: "og:description", content: "Departures, arrivals, stops and your seat." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: PortalMobility,
});

function PortalMobility() {
  const { operationId } = useParams({ from: "/_authenticated/my/$operationId/mobility" });
  const { t } = useI18n();
  const overview = useMyOverview(operationId);
  const mobility = useMyMobility(operationId);
  const timeZone = overview.data?.timezone ?? null;

  return (
    <PortalShell
      operationId={operationId}
      title={overview.data?.name ?? t("w10.portal.brand")}
      active="mobility"
    >
      <h2 className="mb-3 text-lg font-semibold text-foreground">{t("w10.mobility.title")}</h2>
      <PortalQueryGate
        isLoading={mobility.isLoading}
        error={mobility.error}
        onRetry={() => void mobility.refetch()}
      >
        {(mobility.data ?? []).length === 0 ? (
          <PortalEmpty body={t("w10.mobility.empty")} />
        ) : (
          <div className="flex flex-col gap-3">
            {(mobility.data ?? []).map((leg) => (
              <PortalCard key={leg.legId}>
                <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-3">
                  <h3 className="min-w-0 break-words text-base font-medium text-foreground">
                    {leg.title ??
                      [leg.originLabel, leg.destinationLabel].filter(Boolean).join(" → ")}
                  </h3>
                  {leg.mySeat?.active && leg.mySeat.seatLabel ? (
                    <PortalTag>
                      {t("w10.mobility.seat")} {leg.mySeat.seatLabel}
                    </PortalTag>
                  ) : (
                    <span className="shrink-0 text-[11px] text-muted-foreground">
                      {t("w10.mobility.noSeat")}
                    </span>
                  )}
                </div>

                <dl className="mt-2 flex flex-col gap-1">
                  <div className="flex flex-wrap items-baseline gap-2">
                    <dt className="text-xs text-muted-foreground">
                      {t("w10.mobility.departure")}
                    </dt>
                    <dd>
                      <PortalTime
                        planned={leg.plannedDeparture}
                        expected={leg.expectedDeparture}
                        timeZone={timeZone}
                      />
                    </dd>
                  </div>
                  <div className="flex flex-wrap items-baseline gap-2">
                    <dt className="text-xs text-muted-foreground">{t("w10.mobility.arrival")}</dt>
                    <dd>
                      <PortalTime
                        planned={leg.plannedArrival}
                        expected={leg.expectedArrival}
                        timeZone={timeZone}
                      />
                    </dd>
                  </div>
                  {leg.returnTime ? (
                    <div className="flex flex-wrap items-baseline gap-2">
                      <dt className="text-xs text-muted-foreground">{t("w10.mobility.return")}</dt>
                      <dd>
                        <PortalTime planned={null} expected={leg.returnTime} timeZone={timeZone} />
                      </dd>
                    </div>
                  ) : null}
                </dl>

                {leg.stops.length > 0 ? (
                  <div className="mt-3 border-t border-border pt-3">
                    <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                      {t("w10.mobility.stops")}
                    </p>
                    <ul className="mt-2 flex flex-col gap-1.5">
                      {leg.stops.map((stop, index) => (
                        <li
                          key={`${leg.legId}-${index}`}
                          className="grid grid-cols-[minmax(0,1fr)_auto] items-baseline gap-2"
                        >
                          <span className="min-w-0 break-words text-sm text-foreground">
                            {stop.label ?? "—"}
                            {stop.isPickup ? (
                              <span className="ml-2 text-xs text-primary">
                                {t("w10.mobility.pickup")}
                              </span>
                            ) : null}
                          </span>
                          <PortalTime
                            planned={stop.plannedTime}
                            expected={stop.expectedTime}
                            timeZone={timeZone}
                          />
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}
              </PortalCard>
            ))}
          </div>
        )}
      </PortalQueryGate>
    </PortalShell>
  );
}
