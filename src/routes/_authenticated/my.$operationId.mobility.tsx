import { createFileRoute, useParams } from "@tanstack/react-router";
import { useEffect, useState } from "react";
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

function mobilityLegState(
  leg: {
    plannedDeparture: string | null;
    expectedDeparture: string | null;
    plannedArrival: string | null;
    expectedArrival: string | null;
  },
  nowMs: number,
  timeZone?: string | null,
) {
  const departure = leg.expectedDeparture ?? leg.plannedDeparture;
  const arrival = leg.expectedArrival ?? leg.plannedArrival;
  const departureMs = departure ? new Date(departure).getTime() : null;
  const arrivalMs = arrival ? new Date(arrival).getTime() : null;
  const departureIsDateOnly = departure ? isPlaceholderMidnight(departure, timeZone) : false;
  const arrivalIsDateOnly = arrival ? isPlaceholderMidnight(arrival, timeZone) : false;

  if (departure && departureIsDateOnly) {
    const departureDay = localDateKey(departure, timeZone);
    const today = localDateKey(nowMs, timeZone);
    if (departureDay < today) return "completed" as const;
    return "upcoming" as const;
  }

  if (departureMs !== null && !departureIsDateOnly) {
    if (arrivalMs !== null && !arrivalIsDateOnly && departureMs <= nowMs && nowMs < arrivalMs) {
      return "now" as const;
    }
    if (arrivalMs !== null && !arrivalIsDateOnly && arrivalMs <= nowMs) {
      return "completed" as const;
    }
    if (departureMs > nowMs) {
      return "upcoming" as const;
    }
  }

  if (arrivalMs !== null && !arrivalIsDateOnly && arrivalMs <= nowMs) {
    return "completed" as const;
  }

  return "neutral" as const;
}

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
  const legs = mobility.data ?? [];
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

  const legStates = legs.map((leg) => mobilityLegState(leg, nowMs, timeZone));
  const currentLegIndex = legStates.findIndex((state) => state === "now");
  const nextLegIndex = legStates.findIndex((state) => state === "upcoming");
  const spotlightIndex = currentLegIndex >= 0 ? currentLegIndex : nextLegIndex;
  const spotlightLeg = spotlightIndex >= 0 ? legs[spotlightIndex] : null;
  const spotlightIsNow = currentLegIndex >= 0;

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
      {!mobility.isLoading && !mobility.error && spotlightLeg ? (
        <section className="mb-5 rounded-2xl border border-primary/25 bg-primary/5 p-4 sm:p-5">
          <div className="flex items-start gap-3">
            <div className="rounded-xl bg-primary/10 p-2"><Bus className="h-5 w-5 text-primary" /></div>
            <div className="min-w-0">
              <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-primary">
                {spotlightIsNow ? t("w10.mobility.nowLeg") : t("w10.mobility.nextLeg")}
              </p>
              <p className="mt-1 text-base font-semibold text-foreground">
                {spotlightLeg.title ?? [spotlightLeg.originLabel, spotlightLeg.destinationLabel].filter(Boolean).join(" → ")}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                {spotlightIsNow ? t("w10.mobility.nowGuidance") : t("w10.mobility.nextGuidance")}
              </p>
            </div>
          </div>
        </section>
      ) : null}

      <PortalQueryGate
        isLoading={mobility.isLoading}
        error={mobility.error}
        onRetry={() => void mobility.refetch()}
      >
        {legs.length === 0 ? (
          <PortalEmpty icon={Bus} title={t("w10.mobility.emptyTitle")} body={t("w10.mobility.empty")} />
        ) : (
          <div className="flex flex-col gap-3">
            {legs.map((leg, index) => {
              const mode = mobilityMode(leg);
              const ModeIcon = mode.Icon;
              const state = legStates[index] ?? "neutral";
              const isNow = state === "now";
              const isNext = state === "upcoming" && index === nextLegIndex;
              const isCompleted = state === "completed";
              const stateClass = isNow
                ? "border-primary/40 ring-1 ring-primary/10"
                : isNext
                  ? "border-primary/25"
                  : isCompleted
                    ? "border-border/60 opacity-90"
                    : "";
              return (
              <PortalCard key={leg.legId} className={stateClass}>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <h3 className="break-words text-base font-semibold leading-snug text-foreground">
                      {leg.title ??
                        [leg.originLabel, leg.destinationLabel].filter(Boolean).join(" → ")}
                    </h3>
                  </div>
                  <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
                    {isNow ? <PortalTag>{t("w10.mobility.inProgress")}</PortalTag> : null}
                    {isNext ? <PortalTag>{t("w10.mobility.next")}</PortalTag> : null}
                    {isCompleted ? (
                      <span className="inline-flex shrink-0 items-center rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
                        {t("w10.mobility.completed")}
                      </span>
                    ) : null}
                    <PortalTag>
                      <span className="inline-flex items-center gap-1.5">
                        <ModeIcon className="h-3.5 w-3.5" />
                        {t(mode.labelKey)}
                      </span>
                    </PortalTag>
                    {leg.mySeat?.active && leg.mySeat.seatLabel ? (
                      <PortalTag>
                        {t("w10.mobility.seat")} {leg.mySeat.seatLabel}
                      </PortalTag>
                    ) : null}
                  </div>
                </div>

                {!leg.plannedDeparture &&
                !leg.expectedDeparture &&
                !leg.plannedArrival &&
                !leg.expectedArrival ? (
                  <p className="mt-3 text-xs text-muted-foreground">{t("w10.mobility.timesPending")}</p>
                ) : (
                  <dl className="mt-3 flex flex-col gap-1">
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
                  </dl>
                )}
                {leg.returnTime ? (
                  <div className="mt-1 flex flex-wrap items-baseline gap-2">
                    <span className="text-xs text-muted-foreground">{t("w10.mobility.return")}</span>
                    <PortalTime planned={null} expected={leg.returnTime} timeZone={timeZone} />
                  </div>
                ) : null}

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
