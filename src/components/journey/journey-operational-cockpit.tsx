import * as React from "react";
import { useLocation } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ArrowRight, CheckCircle2, Clock3, ListChecks, MapPin, Navigation, Route as RouteIcon } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { formatTime } from "@/lib/format";
import { useI18n } from "@/lib/i18n";
import { roleLabel, type RoleTypeRow } from "@/lib/w03";
import type { JourneyStepRow, PlaybookItemRow } from "@/lib/w04";

function stepPlace(step: JourneyStepRow | undefined | null) {
  if (!step) return null;
  return step.location_label?.trim() || step.title;
}

function stepTime(step: JourneyStepRow, locale: string, timeZone: string | null) {
  const start = step.expected_start ?? step.planned_start;
  const end = step.expected_end ?? step.planned_end;
  const ctx = { locale, ...(timeZone ? { timeZone } : {}) };
  if (!start && !end) return "Horário não definido";
  if (start && end) return `${formatTime(start, ctx)} → ${formatTime(end, ctx)}`;
  if (start) return `A partir de ${formatTime(start, ctx)}`;
  return `Até ${formatTime(end!, ctx)}`;
}

function responsibilities(items: PlaybookItemRow[], roles: RoleTypeRow[], t: (key: string) => string) {
  const labels = Array.from(
    new Set(
      items
        .map((item) => roles.find((role) => role.id === item.owner_role_type_id))
        .filter(Boolean)
        .map((role) => roleLabel(role, t)),
    ),
  );
  return labels.length > 0 ? labels.join(" · ") : "Não definido";
}

type RuntimeState = {
  current_step_id?: string | null;
  next_step_id?: string | null;
  status?: string;
};

export function JourneyOperationalCockpit({ operationId }: { operationId: string }) {
  const location = useLocation();
  const { t, locale } = useI18n();
  const isJourney = location.pathname.endsWith(`/operations/${operationId}/journey`);

  const cockpit = useQuery({
    queryKey: ["journey-operational-cockpit", operationId],
    enabled: isJourney,
    queryFn: async () => {
      const [operation, steps, items, roles, runtime] = await Promise.all([
        supabase.from("operations").select("status, timezone").eq("id", operationId).single(),
        supabase.from("journey_steps").select("*").eq("operation_id", operationId).order("sequence"),
        supabase
          .from("playbook_items")
          .select("*")
          .eq("operation_id", operationId)
          .eq("is_active", true)
          .order("sequence"),
        supabase
          .from("operation_role_types")
          .select("*")
          .eq("is_active", true)
          .order("sort_order"),
        supabase.rpc("w04_operation_runtime_state", { _operation_id: operationId }),
      ]);
      if (operation.error) throw operation.error;
      if (steps.error) throw steps.error;
      if (items.error) throw items.error;
      if (roles.error) throw roles.error;

      return {
        operation: operation.data,
        steps: (steps.data ?? []) as JourneyStepRow[],
        items: (items.data ?? []) as PlaybookItemRow[],
        roles: (roles.data ?? []) as RoleTypeRow[],
        runtime: runtime.error ? null : (runtime.data as RuntimeState | null),
      };
    },
  });

  if (!isJourney || cockpit.isLoading || cockpit.isError || !cockpit.data) return null;

  const { operation, steps, items, roles, runtime } = cockpit.data;
  if (steps.length === 0) return null;

  const currentIndex = runtime?.current_step_id
    ? steps.findIndex((step) => step.id === runtime.current_step_id)
    : -1;
  const nextIndex = runtime?.next_step_id
    ? steps.findIndex((step) => step.id === runtime.next_step_id)
    : -1;

  const plannedIndex = currentIndex >= 0 ? currentIndex : nextIndex >= 0 ? nextIndex : 0;
  const focusStep = steps[plannedIndex] ?? steps[0];
  const previousStep = plannedIndex > 0 ? steps[plannedIndex - 1] : null;
  const followingStep = steps[plannedIndex + 1] ?? null;
  const focusItems = items.filter((item) => item.journey_step_id === focusStep.id);

  const isMovement = focusStep.step_kind === "movement" || focusStep.step_kind === "return";
  const origin = previousStep ? stepPlace(previousStep) : stepPlace(focusStep);
  const destination = isMovement
    ? stepPlace(focusStep) ?? stepPlace(followingStep)
    : stepPlace(followingStep) ?? stepPlace(focusStep);

  const stageLabel = currentIndex >= 0 ? "AGORA" : operation.status === "draft" || operation.status === "planning" ? "PRÓXIMA ETAPA PLANEJADA" : "PRÓXIMO";

  return (
    <section className="surface-panel overflow-hidden" aria-label="Cockpit operacional da jornada">
      <div className="border-b border-border/70 bg-primary-soft/40 px-4 py-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-primary">Cockpit operacional</p>
            <h2 className="mt-1 text-lg font-semibold">Onde estou · O que faço · Para onde vou</h2>
          </div>
          <span className="rounded-full border border-primary/30 bg-primary-soft px-2.5 py-1 font-mono text-[10px] uppercase tracking-[0.12em] text-primary">
            {stageLabel}
          </span>
        </div>
      </div>

      <div className="grid gap-4 p-4 lg:grid-cols-[1.35fr_0.65fr]">
        <div className="rounded-xl border border-border/70 bg-background/50 p-4">
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-full bg-primary-soft px-2 py-1 font-mono text-[10px] uppercase tracking-[0.12em] text-primary">
              ETAPA {focusStep.sequence}
            </span>
            <span className="rounded-full border border-border px-2 py-1 text-xs text-muted-foreground">
              {t(`w04.kind.${focusStep.step_kind}`)}
            </span>
          </div>

          <h3 className="mt-3 text-xl font-semibold">{focusStep.title}</h3>
          <p className="mt-1 text-sm text-muted-foreground">
            {focusStep.description?.trim() || "Executar esta etapa conforme o planejamento operacional."}
          </p>

          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <div className="rounded-xl border border-border/70 p-3">
              <p className="flex items-center gap-2 text-xs uppercase tracking-[0.1em] text-muted-foreground">
                <Navigation className="size-3.5" aria-hidden="true" /> Origem
              </p>
              <p className="mt-1 text-sm font-medium">{origin ?? "Não definida"}</p>
            </div>
            <div className="rounded-xl border border-border/70 p-3">
              <p className="flex items-center gap-2 text-xs uppercase tracking-[0.1em] text-muted-foreground">
                <MapPin className="size-3.5" aria-hidden="true" /> Destino / próximo local
              </p>
              <p className="mt-1 text-sm font-medium">{destination ?? "Não definido"}</p>
            </div>
            <div className="rounded-xl border border-border/70 p-3">
              <p className="flex items-center gap-2 text-xs uppercase tracking-[0.1em] text-muted-foreground">
                <Clock3 className="size-3.5" aria-hidden="true" /> Horário
              </p>
              <p className="mt-1 text-sm font-medium">{stepTime(focusStep, locale, operation.timezone)}</p>
            </div>
            <div className="rounded-xl border border-border/70 p-3">
              <p className="flex items-center gap-2 text-xs uppercase tracking-[0.1em] text-muted-foreground">
                <ListChecks className="size-3.5" aria-hidden="true" /> Responsabilidade
              </p>
              <p className="mt-1 text-sm font-medium">{responsibilities(focusItems, roles, t)}</p>
            </div>
          </div>

          {isMovement && origin && destination ? (
            <div className="mt-4 flex flex-wrap items-center gap-2 rounded-xl border border-primary/20 bg-primary-soft/30 px-3 py-3 text-sm">
              <span className="font-medium">{origin}</span>
              <ArrowRight className="size-4 text-primary" aria-hidden="true" />
              <span className="font-medium">{destination}</span>
            </div>
          ) : null}
        </div>

        <div className="space-y-3">
          <div className="rounded-xl border border-border/70 bg-background/50 p-4">
            <p className="flex items-center gap-2 text-xs uppercase tracking-[0.1em] text-muted-foreground">
              <ListChecks className="size-3.5" aria-hidden="true" /> Checklist
            </p>
            <p className="mt-2 text-2xl font-semibold">{focusItems.length}</p>
            <p className="text-sm text-muted-foreground">item(ns) ativo(s) nesta etapa</p>
            {focusItems.length > 0 ? (
              <ul className="mt-3 space-y-1.5">
                {focusItems.slice(0, 3).map((item) => (
                  <li key={item.id} className="flex items-start gap-2 text-sm">
                    <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden="true" />
                    <span>{item.title}</span>
                  </li>
                ))}
              </ul>
            ) : null}
          </div>

          <div className="rounded-xl border border-border/70 bg-background/50 p-4">
            <p className="flex items-center gap-2 text-xs uppercase tracking-[0.1em] text-muted-foreground">
              <RouteIcon className="size-3.5" aria-hidden="true" /> Próxima etapa
            </p>
            {followingStep ? (
              <>
                <p className="mt-2 text-sm font-semibold">{followingStep.sequence}. {followingStep.title}</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  {stepTime(followingStep, locale, operation.timezone)}
                </p>
                {followingStep.location_label ? (
                  <p className="mt-1 text-sm text-muted-foreground">{followingStep.location_label}</p>
                ) : null}
              </>
            ) : (
              <p className="mt-2 text-sm text-muted-foreground">Esta é a última etapa da jornada.</p>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
