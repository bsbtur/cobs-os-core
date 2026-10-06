import { createFileRoute, useParams } from "@tanstack/react-router";
import { Bus, MapPin, Plane, ShieldCheck, TrainFront, Van } from "lucide-react";

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

function mobilityMode(leg: {
  legKind: string | null;
  title: string | null;
  originLabel: string | null;
  destinationLabel: string | null;
}) {
  // Operational kind wins over place-name heuristics. A road transfer that
  // starts/ends at an airport must never be rendered as an air segment.
  if (leg.legKind === "transfer" || leg.legKind === "shuttle" || leg.legKind === "return") {
    return { labelKey: "w10.mobility.modeTransfer" as const, Icon: Van };
  }

  const text = [leg.title, leg.originLabel, leg.destinationLabel].filter(Boolean).join(" ").toLowerCase();

  if (/\b(voo|aéreo|aerea|aérea|flight)\b/.test(text)) {
    return { labelKey: "w10.mobility.modeAir" as const, Icon: Plane };
  }
  if (/metrô|metro|estação/.test(text)) return { labelKey: "w10.mobility.modeMetro" as const, Icon: TrainFront };
  if (/ônibus|onibus|bus|rodoviária|rodoviaria/.test(text)) return { labelKey: "w10.mobility.modeBus" as const, Icon: Bus };
  return { labelKey: "w10.mobility.modeTransfer" as const, Icon: Van };
}

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
      <section className="mb-5 rounded-3xl border border-border/70 bg-gradient-to-br from-card via-card to-muted/50 p-5 shadow-sm">
        <div className="flex items-start gap-3"><div className="rounded-2xl bg-primary/10 p-3"><Bus className="h-5 w-5 text-primary" /></div><div><p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-primary">{t("w10.mobility.eyebrow")}</p><h2 className="mt-1 text-xl font-semibold text-foreground">{t("w10.mobility.title")}</h2><p className="mt-1 text-sm text-muted-foreground">{t("w10.mobility.heroBody")}</p></div></div>
        <div className="mt-4 grid gap-2 sm:grid-cols-2"><div className="flex gap-2 rounded-xl border bg-background/60 p-3 text-xs text-foreground"><MapPin className="h-4 w-4 shrink-0 text-primary" />{t("w10.mobility.meetingPoint")}</div><div className="flex gap-2 rounded-xl border bg-background/60 p-3 text-xs text-foreground"><ShieldCheck className="h-4 w-4 shrink-0 text-primary" />{t("w10.mobility.confirmedOnly")}</div></div>
      </section>
      <PortalQueryGate
        isLoading={mobility.isLoading}
        error={mobility.error}
        onRetry={() => void mobility.refetch()}
      >
        {(mobility.data ?? []).length === 0 ? (
          <PortalEmpty body={t("w10.mobility.empty")} />
        ) : (
          <div className="flex flex-col gap-3">
            {(mobility.data ?? []).map((leg) => {
              const mode = mobilityMode(leg);
              const ModeIcon = mode.Icon;
              return (
              <PortalCard key={leg.legId}>
                <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-3">
                  <div className="mb-2 flex items-center gap-2 text-xs font-medium text-primary"><ModeIcon className="h-4 w-4" />{t(mode.labelKey)}</div>
                  <h3 className="min-w-0 break-words text-base font-medium text-foreground">
                    {leg.title ??
                      [leg.originLabel, leg.destinationLabel].filter(Boolean).join(" → ")}
                  </h3>
                  {leg.mySeat?.active && leg.mySeat.seatLabel ? (
                    <PortalTag>
                      {t("w10.mobility.seat")} {leg.mySeat.seatLabel}
                    </PortalTag>
                  ) : null}
                </div>

                <dl className="mt-2 flex flex-col gap-1">
                  <div className="flex flex-wrap items-baseline gap-2">
                    <dt className="text-xs text-muted-foreground">{t("w10.mobility.departure")}</dt>
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
              );
            })}
          </div>
        )}
      </PortalQueryGate>
    </PortalShell>
  );
}
