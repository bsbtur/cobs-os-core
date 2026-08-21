import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, CheckCircle2, Users } from "lucide-react";

import {
  fetchOperationParticipantSummary,
  operationParticipantSummaryKey,
  type OperationParticipantSummary,
} from "@/lib/operation-participant-summary";

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg border border-border bg-elevated/40 px-3 py-3">
      <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
        {label}
      </p>
      <p className="mt-1 text-2xl font-semibold tabular-nums">{value}</p>
    </div>
  );
}

function Health({ health }: { health: OperationParticipantSummary["health"] }) {
  const isHealthy = health.status === "under_control";
  const Icon = isHealthy ? CheckCircle2 : AlertTriangle;

  return (
    <div
      className={
        isHealthy
          ? "rounded-lg border border-success/30 bg-success/5 px-4 py-3"
          : "rounded-lg border border-warning/40 bg-warning/5 px-4 py-3"
      }
    >
      <div className="flex items-start gap-2.5">
        <Icon
          className={isHealthy ? "mt-0.5 size-4 text-success" : "mt-0.5 size-4 text-warning"}
          aria-hidden="true"
        />
        <div className="min-w-0">
          <p className="text-sm font-semibold">
            {isHealthy ? "Sob controle" : health.status === "critical" ? "Crítico" : "Atenção"}
          </p>
          {health.reason_label ? (
            <p className="mt-0.5 text-xs text-muted-foreground">{health.reason_label}</p>
          ) : null}
          {health.reason_code ? (
            <p className="sr-only">Código do motivo: {health.reason_code}</p>
          ) : null}
        </div>
      </div>
    </div>
  );
}

/**
 * Canonical participant counters for an operation.
 *
 * This component intentionally does not infer operational facts in the browser.
 * All values come from public.get_operation_participant_summary so every surface
 * can share the same semantics after the Lovable code is synchronized again.
 */
export function ParticipantOperationalSummary({ operationId }: { operationId: string }) {
  const summary = useQuery({
    queryKey: operationParticipantSummaryKey(operationId),
    queryFn: () => fetchOperationParticipantSummary(operationId),
    refetchInterval: 20_000,
  });

  if (summary.isLoading) {
    return (
      <section className="surface-panel animate-pulse p-5" aria-label="Carregando viajantes">
        <div className="h-5 w-40 rounded bg-elevated" />
        <div className="mt-4 grid gap-2 sm:grid-cols-3 lg:grid-cols-6">
          {Array.from({ length: 6 }).map((_, index) => (
            <div key={index} className="h-20 rounded-lg bg-elevated" />
          ))}
        </div>
      </section>
    );
  }

  if (summary.isError || !summary.data) {
    return (
      <section className="surface-panel p-5">
        <div className="flex items-start gap-2.5 text-destructive">
          <AlertTriangle className="mt-0.5 size-4" aria-hidden="true" />
          <div>
            <p className="text-sm font-semibold">Não foi possível atualizar os viajantes</p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Os números não serão estimados. Tente atualizar novamente.
            </p>
          </div>
        </div>
      </section>
    );
  }

  const { travelers, health } = summary.data;

  return (
    <section className="surface-panel space-y-4 p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <Users className="size-4 text-primary" aria-hidden="true" />
            <h3 className="text-base font-semibold">Viajantes</h3>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            {travelers.confirmed} confirmados · {travelers.planned} previstos
          </p>
        </div>
        <Health health={health} />
      </div>

      <div className="grid gap-2 sm:grid-cols-3 lg:grid-cols-6">
        <Metric label="Previstos" value={travelers.planned} />
        <Metric label="Confirmados" value={travelers.confirmed} />
        <Metric label="A confirmar" value={travelers.unconfirmed} />
        <Metric label="Presentes" value={travelers.present} />
        <Metric label="Embarcados" value={travelers.boarded} />
        <Metric label="No-show" value={travelers.no_show} />
      </div>
    </section>
  );
}
