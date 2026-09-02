import { createFileRoute, Link, useParams } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, BedDouble, Bus, Route as RouteIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/feedback/empty-state";
import { PanelSkeleton } from "@/components/feedback/loading";
import { supabase } from "@/integrations/supabase/client";
import { formatDateTime } from "@/lib/format";
import { useI18n } from "@/lib/i18n";

type IncidentDomain = "journey" | "mobility" | "hospitality";

type IncidentItem = {
  domain: IncidentDomain;
  id: string;
  occurred_at: string;
  note: string | null;
};

type IncidentSummary = {
  total: number;
  journey: number;
  mobility: number;
  hospitality: number;
  events: number;
  latest: IncidentItem[];
};

type OperationIntelligence = {
  operation?: {
    timezone?: string | null;
  };
  incidents?: IncidentSummary;
};

const DOMAIN_LABEL: Record<IncidentDomain, string> = {
  journey: "Jornada",
  mobility: "Mobilidade",
  hospitality: "Hospedagem",
};

export const Route = createFileRoute("/_authenticated/operations/$operationId/incidents")({
  head: () => ({
    meta: [
      { title: "Incidentes — COBS OS" },
      {
        name: "description",
        content: "Visão agregada das ocorrências operacionais registradas na jornada, mobilidade e hospedagem.",
      },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: IncidentsPage,
});

function IncidentsPage() {
  const { operationId } = useParams({ from: "/_authenticated/operations/$operationId" });
  const { t, locale, timeZone } = useI18n();

  const intelligence = useQuery({
    queryKey: ["operator-incidents", operationId],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_operation_intelligence", {
        _operation_id: operationId,
      });
      if (error) throw error;
      return data as unknown as OperationIntelligence;
    },
    refetchInterval: 60_000,
  });

  if (intelligence.isLoading) return <PanelSkeleton rows={4} />;

  if (intelligence.isError) {
    return (
      <EmptyState
        icon={AlertTriangle}
        title={t("op.loadError")}
        body={t("op.loadErrorBody")}
        action={
          <Button variant="outline" className="min-h-11" onClick={() => void intelligence.refetch()}>
            {t("op.retry")}
          </Button>
        }
      />
    );
  }

  const summary = intelligence.data?.incidents ?? {
    total: 0,
    journey: 0,
    mobility: 0,
    hospitality: 0,
    events: 0,
    latest: [],
  };
  const timezone = intelligence.data?.operation?.timezone ?? timeZone;

  return (
    <div className="space-y-5">
      <header className="surface-panel space-y-2 p-5">
        <div className="flex items-center gap-3">
          <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-warning-soft text-warning">
            <AlertTriangle className="size-5" aria-hidden="true" />
          </span>
          <div>
            <h2 className="text-xl font-semibold">Incidentes</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Ocorrências factuais registradas nos domínios que são proprietários de cada fato.
            </p>
          </div>
        </div>
        <p className="text-xs text-muted-foreground">
          Esta visão não cria uma segunda verdade: Jornada, Mobilidade e Hospedagem continuam sendo as fontes canônicas.
        </p>
      </header>

      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <article className="surface-panel p-4">
          <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">Total</p>
          <p className="mt-1 text-2xl font-semibold tabular-nums">{summary.total}</p>
        </article>
        <article className="surface-panel p-4">
          <div className="flex items-center gap-2 text-muted-foreground">
            <RouteIcon className="size-4" aria-hidden="true" />
            <p className="font-mono text-[10px] uppercase tracking-[0.14em]">Jornada</p>
          </div>
          <p className="mt-1 text-2xl font-semibold tabular-nums">{summary.journey}</p>
        </article>
        <article className="surface-panel p-4">
          <div className="flex items-center gap-2 text-muted-foreground">
            <Bus className="size-4" aria-hidden="true" />
            <p className="font-mono text-[10px] uppercase tracking-[0.14em]">Mobilidade</p>
          </div>
          <p className="mt-1 text-2xl font-semibold tabular-nums">{summary.mobility}</p>
        </article>
        <article className="surface-panel p-4">
          <div className="flex items-center gap-2 text-muted-foreground">
            <BedDouble className="size-4" aria-hidden="true" />
            <p className="font-mono text-[10px] uppercase tracking-[0.14em]">Hospedagem</p>
          </div>
          <p className="mt-1 text-2xl font-semibold tabular-nums">{summary.hospitality}</p>
        </article>
      </section>

      <section className="surface-panel p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h3 className="font-semibold">Ocorrências recentes</h3>
            <p className="mt-1 text-sm text-muted-foreground">Últimos fatos de incidente registrados nesta operação.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button asChild variant="outline" size="sm">
              <Link to="/operations/$operationId/journey" params={{ operationId }}>
                Abrir Jornada
              </Link>
            </Button>
            <Button asChild variant="outline" size="sm">
              <Link to="/operations/$operationId/mobility" params={{ operationId }}>
                Abrir Mobilidade
              </Link>
            </Button>
            <Button asChild variant="outline" size="sm">
              <Link to="/operations/$operationId/hospitality" params={{ operationId }}>
                Abrir Hospedagem
              </Link>
            </Button>
          </div>
        </div>

        {summary.latest.length === 0 ? (
          <div className="mt-4 rounded-lg border border-border bg-elevated/40 p-4">
            <p className="font-medium">Nenhum incidente registrado</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Quando um fato de ocorrência for registrado em Jornada, Mobilidade ou Hospedagem, ele aparecerá aqui.
            </p>
          </div>
        ) : (
          <ol className="mt-4 space-y-2">
            {summary.latest.map((incident) => (
              <li key={`${incident.domain}-${incident.id}`} className="rounded-lg border border-border p-4">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="rounded bg-warning-soft px-2 py-0.5 text-[11px] font-medium text-warning">
                    {DOMAIN_LABEL[incident.domain]}
                  </span>
                  <span className="ml-auto font-mono text-[10px] tabular-nums text-muted-foreground">
                    {formatDateTime(incident.occurred_at, { locale, timeZone: timezone })}
                  </span>
                </div>
                <p className="mt-2 whitespace-pre-wrap text-sm">{incident.note ?? "—"}</p>
              </li>
            ))}
          </ol>
        )}
      </section>
    </div>
  );
}
