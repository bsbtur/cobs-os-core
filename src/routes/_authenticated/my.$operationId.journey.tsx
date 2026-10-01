import { createFileRoute, useParams } from "@tanstack/react-router";
import { CalendarDays, MapPin, Megaphone, Sparkles } from "lucide-react";

import { useI18n } from "@/lib/i18n";
import { useMyJourney, useMyOverview } from "@/lib/w10";
import { PortalShell } from "@/app/portal/portal-shell";
import { PortalEmpty, PortalQueryGate, PortalTime } from "@/app/portal/portal-states";

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
  const steps = journey.data ?? [];

  return (
    <PortalShell operationId={operationId} title={overview.data?.name ?? t("w10.portal.brand")} active="journey">
      <section className="mb-5 overflow-hidden rounded-3xl border border-border/70 bg-gradient-to-br from-card via-card to-muted/50 p-5 shadow-sm">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="mb-2 inline-flex items-center gap-2 rounded-full bg-primary/10 px-3 py-1 text-xs font-semibold text-primary">
              <Sparkles className="h-3.5 w-3.5" /> Sua jornada
            </div>
            <h2 className="text-xl font-semibold tracking-tight text-foreground">{t("w10.journey.title")}</h2>
            <p className="mt-1 max-w-xl text-sm leading-relaxed text-muted-foreground">
              Acompanhe a programação da viagem, horários, locais e atualizações da operação em um só lugar.
            </p>
          </div>
          <div className="hidden rounded-2xl bg-background/70 p-3 sm:block"><CalendarDays className="h-6 w-6 text-primary" /></div>
        </div>
        {steps.length > 0 ? (
          <div className="mt-4 flex flex-wrap gap-2">
            <span className="rounded-full border bg-background/70 px-3 py-1.5 text-xs font-medium">{steps.length} atividades programadas</span>
            <span className="rounded-full border bg-background/70 px-3 py-1.5 text-xs font-medium">Horário local da operação</span>
          </div>
        ) : null}
      </section>

      <PortalQueryGate isLoading={journey.isLoading} error={journey.error} onRetry={() => void journey.refetch()}>
        {steps.length === 0 ? (
          <PortalEmpty body={t("w10.journey.empty")} />
        ) : (
          <ol className="relative ml-3 border-l border-border pl-6">
            {steps.map((step, index) => (
              <li key={step.stepId} className="relative pb-5 last:pb-0">
                <span className="absolute -left-[2.05rem] top-5 flex h-4 w-4 rounded-full border-4 border-background bg-primary shadow-sm" />
                <article className="overflow-hidden rounded-2xl border border-border/80 bg-card shadow-sm transition-shadow hover:shadow-md">
                  <div className="p-4 sm:p-5">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="mb-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-primary">Etapa {String(index + 1).padStart(2, "0")}</p>
                        <h3 className="break-words text-base font-semibold text-foreground sm:text-lg">{step.title}</h3>
                      </div>
                      {step.updates.length > 0 ? (
                        <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-500/10 px-2.5 py-1 text-xs font-medium text-amber-700 dark:text-amber-300">
                          <Megaphone className="h-3.5 w-3.5" /> {step.updates.length} {t("w10.journey.updates")}
                        </span>
                      ) : null}
                    </div>
                    <div className="mt-4 grid gap-3 sm:grid-cols-2">
                      <div className="rounded-xl bg-muted/55 p-3">
                        <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Quando</p>
                        <PortalTime planned={step.plannedStart} expected={step.expectedStart} timeZone={timeZone} />
                      </div>
                      <div className="rounded-xl bg-muted/55 p-3">
                        <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Onde</p>
                        <p className="flex gap-2 break-words text-sm font-medium text-foreground">
                          <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                          {step.locationLabel || "Local a confirmar"}
                        </p>
                      </div>
                    </div>
                  </div>
                </article>
              </li>
            ))}
          </ol>
        )}
      </PortalQueryGate>
    </PortalShell>
  );
}
