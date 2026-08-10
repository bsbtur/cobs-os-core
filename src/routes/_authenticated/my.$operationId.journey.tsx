import { createFileRoute, useParams } from "@tanstack/react-router";

import { useI18n } from "@/lib/i18n";
import { useMyJourney, useMyOverview } from "@/lib/w10";
import { PortalShell } from "@/app/portal/portal-shell";
import {
  PortalCard,
  PortalEmpty,
  PortalQueryGate,
  PortalTag,
  PortalTime,
} from "@/app/portal/portal-states";

export const Route = createFileRoute("/_authenticated/my/$operationId/journey")({
  head: () => ({
    meta: [
      { title: "My schedule — COBS OS traveler portal" },
      { name: "description", content: "Your day-by-day schedule with meeting points and times." },
      { property: "og:title", content: "My schedule — COBS OS traveler portal" },
      { property: "og:description", content: "Meeting points, times and what to expect." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: PortalJourney,
});

function PortalJourney() {
  const { operationId } = useParams({ from: "/_authenticated/my/$operationId/journey" });
  const { t } = useI18n();
  const overview = useMyOverview(operationId);
  const journey = useMyJourney(operationId);
  const timeZone = overview.data?.timezone ?? null;

  return (
    <PortalShell
      operationId={operationId}
      title={overview.data?.name ?? t("w10.portal.brand")}
      active="journey"
    >
      <h2 className="mb-3 text-lg font-semibold text-foreground">{t("w10.journey.title")}</h2>
      <PortalQueryGate
        isLoading={journey.isLoading}
        error={journey.error}
        onRetry={() => void journey.refetch()}
      >
        {(journey.data ?? []).length === 0 ? (
          <PortalEmpty body={t("w10.journey.empty")} />
        ) : (
          <ol className="flex flex-col gap-3">
            {(journey.data ?? []).map((step) => (
              <li key={step.stepId}>
                <PortalCard>
                  <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-3">
                    <h3 className="min-w-0 break-words text-base font-medium text-foreground">
                      {step.title}
                    </h3>
                    {step.adHoc ? <PortalTag>{t("w10.journey.added")}</PortalTag> : null}
                  </div>
                  {step.meetingPoint ? (
                    <p className="mt-1 break-words text-sm text-muted-foreground">
                      {t("w10.journey.meetingPoint")}: {step.meetingPoint}
                    </p>
                  ) : null}
                  <div className="mt-2">
                    <PortalTime
                      planned={step.plannedStart}
                      expected={step.expectedStart}
                      timeZone={timeZone}
                    />
                  </div>
                  {step.notes ? (
                    <p className="mt-2 break-words text-sm text-foreground">{step.notes}</p>
                  ) : null}
                </PortalCard>
              </li>
            ))}
          </ol>
        )}
      </PortalQueryGate>
    </PortalShell>
  );
}
