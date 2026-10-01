import { createFileRoute, useParams } from "@tanstack/react-router";
import { useState } from "react";
import { CalendarDays, ChevronDown, Clock3, MapPin, Megaphone, Sparkles } from "lucide-react";

const CIOSP_DAILY_PROGRAM: Record<string, { description: string; items: string[] }> = {
  "Brasília → São Paulo": { description: "Início da Caravana BSBTUR CIOSP 2027, com embarque em Brasília, chegada a São Paulo e acolhimento do grupo.", items: ["Encontro do grupo no Aeroporto de Brasília", "Check-in e organização do embarque", "Voo Brasília → São Paulo", "Recepção do grupo na chegada", "Traslado privativo", "Almoço de boas-vindas incluso", "Check-in no hotel", "Apresentação da operação BSBTUR, credenciais e orientações gerais", "Noite livre"] },
  "Experiência BSBTUR em São Paulo": { description: "Dia de integração, experiência em São Paulo e preparação do grupo para os quatro dias de congresso.", items: ["Café da manhã", "Programação turística / experiência BSBTUR em São Paulo", "Integração do grupo", "Organização para o congresso", "Conferência de inscrições, credenciais e documentos", "Alinhamento de pontos de encontro e traslados", "Retorno ao hotel", "Noite livre"] },
  "CIOSP — Dia 1": { description: "Primeiro dia do 44º CIOSP no Expo Center Norte.", items: ["Café da manhã", "Encontro do grupo no hotel", "Traslado hotel → Expo Center Norte", "Chegada e acesso ao 44º CIOSP", "Participação nas atividades do congresso", "Alimentação durante o evento por conta do participante", "Ponto de encontro BSBTUR ao final da programação", "Traslado de retorno ao hotel", "Noite livre"] },
  "CIOSP — Dia 2": { description: "Segundo dia de congresso, com programação científica, comercial e visita à feira.", items: ["Café da manhã", "Encontro do grupo", "Traslado hotel → Expo Center Norte", "Participação no CIOSP", "Programação científica, comercial e visita à feira conforme interesse do participante", "Alimentação durante o evento por conta do participante", "Encontro do grupo ao término das atividades", "Retorno ao hotel", "Noite livre"] },
  "CIOSP — Dia 3": { description: "Terceiro dia do CIOSP, com acompanhamento operacional da BSBTUR durante a experiência.", items: ["Café da manhã", "Encontro do grupo", "Traslado para o Expo Center Norte", "Participação nas atividades do congresso e feira", "Acompanhamento operacional BSBTUR", "Alimentação durante o evento por conta do participante", "Ponto de encontro para retorno", "Traslado ao hotel", "Noite livre"] },
  "CIOSP — Dia 4": { description: "Último dia do 44º CIOSP e encerramento da experiência de congresso.", items: ["Café da manhã", "Traslado para o Expo Center Norte", "Participação nas atividades finais do CIOSP", "Alimentação durante o congresso por conta do participante", "Encontro do grupo após o evento", "Retorno", "Jantar de confraternização incluído", "Encerramento da experiência CIOSP com o grupo"] },
  "Retorno a Brasília": { description: "Encerramento da operação em São Paulo e retorno do grupo para Brasília.", items: ["Café da manhã", "Organização das bagagens", "Check-out", "Almoço incluído", "Traslado para o aeroporto", "Organização do check-in e embarque", "Voo São Paulo → Brasília", "Chegada a Brasília e encerramento da Caravana BSBTUR CIOSP 2027"] },
};

import { useI18n } from "@/lib/i18n";
import { useMyJourney, useMyOverview } from "@/lib/w10";
import { PortalShell } from "@/app/portal/portal-shell";
import { PortalEmpty, PortalQueryGate } from "@/app/portal/portal-states";

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
  const { t, locale } = useI18n();
  const overview = useMyOverview(operationId);
  const journey = useMyJourney(operationId);
  const timeZone = overview.data?.timezone ?? null;
  const steps = journey.data ?? [];
  const [expandedStepId, setExpandedStepId] = useState<string | null>(null);
  const now = Date.now();
  const nextStepId = steps.find((step) => {
    const value = step.expectedStart ?? step.plannedStart;
    return value ? new Date(value).getTime() >= now : false;
  })?.stepId ?? null;

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
            {steps.map((step, index) => {
              const effectiveStart = step.expectedStart ?? step.plannedStart;
              const effectiveEnd = step.expectedEnd ?? step.plannedEnd;
              const startMs = effectiveStart ? new Date(effectiveStart).getTime() : null;
              const endMs = effectiveEnd ? new Date(effectiveEnd).getTime() : startMs;
              const completed = endMs !== null && endMs < now;
              const isNext = !completed && step.stepId === nextStepId;
              const expanded = expandedStepId === step.stepId;
              return (
              <li key={step.stepId} className="relative pb-5 last:pb-0">
                <span className="absolute -left-[2.05rem] top-5 flex h-4 w-4 rounded-full border-4 border-background bg-primary shadow-sm" />
                <article className="overflow-hidden rounded-2xl border border-border/80 bg-card shadow-sm transition-shadow hover:shadow-md">
                  <div className="p-4 sm:p-5">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="mb-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-primary">Etapa {String(index + 1).padStart(2, "0")}</p>
                        <h3 className="break-words text-base font-semibold text-foreground sm:text-lg">{step.title}</h3>
                        <div className="mt-2 flex flex-wrap gap-2">
                          {isNext ? <span className="rounded-full bg-primary/10 px-2.5 py-1 text-[11px] font-semibold text-primary">Próxima etapa</span> : null}
                          {completed ? <span className="rounded-full bg-muted px-2.5 py-1 text-[11px] font-semibold text-muted-foreground">Concluída</span> : null}
                        </div>
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
                        <JourneyTime planned={step.plannedStart} expected={step.expectedStart} locale={locale} timeZone={timeZone} />
                      </div>
                      <div className="rounded-xl bg-muted/55 p-3">
                        <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Onde</p>
                        <p className="flex gap-2 break-words text-sm font-medium text-foreground">
                          <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                          {step.locationLabel || "Local a confirmar"}
                        </p>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => setExpandedStepId(expanded ? null : step.stepId)}
                      className="mt-4 flex w-full items-center justify-between rounded-xl border border-border/70 bg-background/60 px-3 py-2.5 text-left text-sm font-semibold text-foreground transition-colors hover:bg-muted/60"
                      aria-expanded={expanded}
                    >
                      <span>{expanded ? "Ocultar detalhes" : "Ver programação da etapa"}</span>
                      <ChevronDown className={`h-4 w-4 transition-transform ${expanded ? "rotate-180" : ""}`} />
                    </button>
                    {expanded ? (
                      <div className="mt-3 space-y-3 rounded-xl border border-border/60 bg-muted/25 p-4">
                        <div className="flex gap-3">
                          <Clock3 className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                          <div>
                            <p className="text-sm font-semibold text-foreground">Programação do dia</p>
                            <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{CIOSP_DAILY_PROGRAM[step.title]?.description ?? "Acompanhe aqui horário, ponto de encontro e mudanças desta etapa. Informações ainda não fechadas aparecem como “a confirmar”."}</p>
                            {CIOSP_DAILY_PROGRAM[step.title] ? (
                              <ol className="mt-3 space-y-2">
                                {CIOSP_DAILY_PROGRAM[step.title]?.items.map((item, itemIndex) => (
                                  <li key={`${step.stepId}-program-${itemIndex}`} className="flex gap-2 text-xs leading-relaxed text-foreground">
                                    <span className="mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full bg-primary/10 text-[10px] font-semibold text-primary">{itemIndex + 1}</span>
                                    <span className="pt-0.5">{item}</span>
                                  </li>
                                ))}
                              </ol>
                            ) : null}
                          </div>
                        </div>
                        {step.updates.length > 0 ? (
                          <div className="border-t border-border/60 pt-3">
                            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Atualizações da operação</p>
                            <div className="space-y-2">
                              {step.updates.map((update, updateIndex) => (
                                <div key={`${step.stepId}-${updateIndex}`} className="rounded-lg bg-background/70 p-3 text-xs text-foreground">
                                  {update.note || "Atualização operacional disponível."}
                                </div>
                              ))}
                            </div>
                          </div>
                        ) : (
                          <p className="border-t border-border/60 pt-3 text-xs text-muted-foreground">Nenhuma alteração operacional publicada para esta etapa.</p>
                        )}
                      </div>
                    ) : null}
                  </div>
                </article>
              </li>
              );
            })}
          </ol>
        )}
      </PortalQueryGate>
    </PortalShell>
  );
}


function JourneyTime({
  planned,
  expected,
  locale,
  timeZone,
}: {
  planned: string | null;
  expected: string | null;
  locale: string;
  timeZone?: string | null;
}) {
  const effective = expected ?? planned;
  if (!effective) return <span className="text-xs text-muted-foreground">Horário a confirmar</span>;

  const date = new Date(effective);
  const timeParts = new Intl.DateTimeFormat("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    ...(timeZone ? { timeZone } : {}),
  }).formatToParts(date);
  const hour = timeParts.find((part) => part.type === "hour")?.value;
  const minute = timeParts.find((part) => part.type === "minute")?.value;
  const dateLabel = new Intl.DateTimeFormat(locale, {
    dateStyle: "medium",
    ...(timeZone ? { timeZone } : {}),
  }).format(date);

  if (hour === "00" && minute === "00") {
    return (
      <span className="text-xs text-foreground">
        {dateLabel} · <span className="text-muted-foreground">Horário a confirmar</span>
      </span>
    );
  }

  const timeLabel = new Intl.DateTimeFormat(locale, {
    hour: "2-digit",
    minute: "2-digit",
    ...(timeZone ? { timeZone } : {}),
  }).format(date);

  return <span className="text-xs text-foreground">{dateLabel}, {timeLabel}</span>;
}
