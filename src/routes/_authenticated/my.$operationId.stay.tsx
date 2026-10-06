import { createFileRoute, useParams } from "@tanstack/react-router";
import { BedDouble, Clock3, ShieldCheck } from "lucide-react";

import { useI18n } from "@/lib/i18n";
import { useMyOverview, useMyStay } from "@/lib/w10";
import { PortalShell } from "@/app/portal/portal-shell";
import {
  PortalCard,
  PortalEmpty,
  PortalQueryGate,
  PortalTag,
  PortalTime,
} from "@/app/portal/portal-states";

export const Route = createFileRoute("/_authenticated/my/$operationId/stay")({
  head: () => ({
    meta: [
      { title: "My stay — COBS OS traveler portal" },
      { name: "description", content: "Where you are staying, your room and check-in times." },
      { property: "og:title", content: "My stay — COBS OS traveler portal" },
      { property: "og:description", content: "Property, address, room and check-in window." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: PortalStay,
});

function PortalStay() {
  const { operationId } = useParams({ from: "/_authenticated/my/$operationId/stay" });
  const { t } = useI18n();
  const overview = useMyOverview(operationId);
  const stay = useMyStay(operationId);

  return (
    <PortalShell
      operationId={operationId}
      title={overview.data?.name ?? t("w10.portal.brand")}
      active="stay"
    >
      <section className="mb-5 rounded-3xl border border-border/70 bg-gradient-to-br from-card via-card to-muted/50 p-5 shadow-sm">
        <div className="flex items-start gap-3"><div className="rounded-2xl bg-primary/10 p-3"><BedDouble className="h-5 w-5 text-primary" /></div><div><p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-primary">{t("w10.stay.eyebrow")}</p><h2 className="mt-1 text-xl font-semibold text-foreground">{t("w10.stay.title")}</h2><p className="mt-1 text-sm text-muted-foreground">{t("w10.stay.heroBody")}</p></div></div>
        <div className="mt-4 grid gap-2 sm:grid-cols-2"><div className="flex gap-2 rounded-xl border bg-background/60 p-3 text-xs text-foreground"><Clock3 className="h-4 w-4 shrink-0 text-primary" />{t("w10.stay.pendingTimes")}</div><div className="flex gap-2 rounded-xl border bg-background/60 p-3 text-xs text-foreground"><ShieldCheck className="h-4 w-4 shrink-0 text-primary" />{t("w10.stay.privacy")}</div></div>
      </section>
      <PortalQueryGate
        isLoading={stay.isLoading}
        error={stay.error}
        onRetry={() => void stay.refetch()}
      >
        {(stay.data ?? []).length === 0 ? (
          <PortalEmpty icon={BedDouble} title={t("w10.stay.emptyTitle")} body={t("w10.stay.empty")} />
        ) : (
          <div className="flex flex-col gap-3">
            {(stay.data ?? []).map((s) => {
              const tz = s.property?.timezone ?? overview.data?.timezone ?? null;
              // Only MY room assignments are ever returned — no rooming list, no roommates.
              const room = s.myRoom.find((r) => r.active) ?? null;
              const address =
                s.property?.addressLabel ??
                [s.property?.city, s.property?.region].filter(Boolean).join(" · ");
              return (
                <PortalCard key={s.stayId}>
                  <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-3">
                    <h3 className="min-w-0 break-words text-base font-medium text-foreground">
                      {s.property?.name ?? s.name ?? "—"}
                    </h3>
                    {s.checkinOpen ? <PortalTag>{t("w10.stay.checkinOpen")}</PortalTag> : null}
                  </div>
                  {address ? (
                    <p className="mt-1 break-words text-sm text-muted-foreground">{address}</p>
                  ) : null}

                  <p className="mt-3 text-sm text-foreground">
                    {room ? (
                      <>
                        {t("w10.stay.room")}: <span className="font-medium">{room.label}</span>
                        {room.floorLabel ? (
                          <span className="text-muted-foreground">
                            {" "}
                            · {t("w10.stay.floor")} {room.floorLabel}
                          </span>
                        ) : null}
                      </>
                    ) : (
                      <span className="text-muted-foreground">{t("w10.stay.noRoom")}</span>
                    )}
                  </p>

                  <dl className="mt-3 flex flex-col gap-1">
                    <div className="flex flex-wrap items-baseline gap-2">
                      <dt className="text-xs text-muted-foreground">{t("w10.stay.checkIn")}</dt>
                      <dd>
                        <PortalTime
                          planned={s.plannedCheckIn}
                          expected={s.expectedCheckIn}
                          timeZone={tz}
                        />
                      </dd>
                    </div>
                    <div className="flex flex-wrap items-baseline gap-2">
                      <dt className="text-xs text-muted-foreground">{t("w10.stay.checkOut")}</dt>
                      <dd>
                        <PortalTime
                          planned={s.plannedCheckOut}
                          expected={s.expectedCheckOut}
                          timeZone={tz}
                        />
                      </dd>
                    </div>
                  </dl>
                </PortalCard>
              );
            })}
          </div>
        )}
      </PortalQueryGate>
    </PortalShell>
  );
}
