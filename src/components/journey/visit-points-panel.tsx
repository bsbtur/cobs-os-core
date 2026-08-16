import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  CircleDot,
  EyeOff,
  Lightbulb,
  MapPinned,
  RotateCcw,
} from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import type { Json, Tables } from "@/integrations/supabase/types";

type VisitPoint = Tables<"journey_visit_points">;
type VisitPointEvent = Tables<"journey_visit_point_events">;
type VisitPointStatus = "available" | "visited" | "unavailable" | "ignored";

type PointWithStatus = VisitPoint & {
  status: VisitPointStatus;
};

function isArchived(metadata: Json) {
  return Boolean(
    metadata &&
    typeof metadata === "object" &&
    !Array.isArray(metadata) &&
    metadata["archived"] === true,
  );
}

function latestStatus(pointId: string, events: VisitPointEvent[]): VisitPointStatus {
  const latest = events
    .filter((event) => event.visit_point_id === pointId)
    .sort((a, b) => b.occurred_at.localeCompare(a.occurred_at))[0];

  if (!latest || latest.event_type === "RESTORED") return "available";
  if (latest.event_type === "VISITED") return "visited";
  if (latest.event_type === "UNAVAILABLE") return "unavailable";
  return "ignored";
}

function statusLabel(status: VisitPointStatus) {
  return {
    available: "Disponível",
    visited: "Visitado",
    unavailable: "Indisponível",
    ignored: "Ignorado",
  }[status];
}

export function VisitPointsPanel({
  operationId,
  journeyStepId,
  canOperate,
}: {
  operationId: string;
  journeyStepId: string;
  canOperate: boolean;
}) {
  const queryClient = useQueryClient();
  const [selectedId, setSelectedId] = React.useState<string | null>(null);

  const query = useQuery({
    queryKey: ["visit-points", operationId, journeyStepId],
    refetchInterval: canOperate ? 20_000 : false,
    queryFn: async () => {
      const [pointsResult, eventsResult] = await Promise.all([
        supabase
          .from("journey_visit_points")
          .select("*")
          .eq("operation_id", operationId)
          .eq("journey_step_id", journeyStepId)
          .order("sequence"),
        supabase
          .from("journey_visit_point_events")
          .select("*")
          .eq("operation_id", operationId)
          .eq("journey_step_id", journeyStepId)
          .order("occurred_at", { ascending: false }),
      ]);

      if (pointsResult.error) throw pointsResult.error;
      if (eventsResult.error) throw eventsResult.error;

      const events = eventsResult.data ?? [];
      return (pointsResult.data ?? [])
        .filter((point) => !isArchived(point.metadata))
        .map<PointWithStatus>((point) => ({
          ...point,
          status: latestStatus(point.id, events),
        }));
    },
  });

  const points = query.data ?? [];
  const firstAvailable = points.find((point) => point.status === "available") ?? points[0] ?? null;
  const selected = points.find((point) => point.id === selectedId) ?? firstAvailable;
  const selectedIndex = selected ? points.findIndex((point) => point.id === selected.id) : -1;
  const visitedCount = points.filter((point) => point.status === "visited").length;

  React.useEffect(() => {
    if (!points.length) {
      setSelectedId(null);
      return;
    }
    if (!selectedId || !points.some((point) => point.id === selectedId)) {
      setSelectedId(firstAvailable?.id ?? null);
    }
  }, [firstAvailable?.id, points, selectedId]);

  const statusMutation = useMutation({
    mutationFn: async ({ pointId, status }: { pointId: string; status: VisitPointStatus }) => {
      const { error } = await supabase.rpc("set_journey_visit_point_status", {
        _visit_point_id: pointId,
        _status: status,
      });
      if (error) throw error;
    },
    onSuccess: async (_, variables) => {
      await queryClient.invalidateQueries({
        queryKey: ["visit-points", operationId, journeyStepId],
      });
      if (variables.status === "visited") {
        const currentIndex = points.findIndex((point) => point.id === variables.pointId);
        const nextAvailable = points
          .slice(currentIndex + 1)
          .find((point) => point.status === "available");
        if (nextAvailable) setSelectedId(nextAvailable.id);
        toast.success("Ponto apresentado.");
      }
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "Não foi possível atualizar o ponto.");
    },
  });

  if (query.isLoading || query.isError || !selected || points.length === 0) return null;

  const previous = selectedIndex > 0 ? points[selectedIndex - 1] : null;
  const next =
    selectedIndex >= 0 && selectedIndex < points.length - 1 ? points[selectedIndex + 1] : null;
  const allPresented = visitedCount === points.length;

  return (
    <article className="overflow-hidden rounded-3xl border border-primary/25 bg-elevated shadow-sm">
      <div className="border-b border-border/70 px-4 py-3 sm:px-6">
        <div className="flex items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-2">
            <MapPinned className="size-4 shrink-0 text-primary" aria-hidden="true" />
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
              Pontos da visita
            </p>
          </div>
          <span className="shrink-0 font-mono text-xs font-semibold tabular-nums text-muted-foreground">
            {visitedCount} de {points.length}
          </span>
        </div>
        <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted">
          <div
            className="h-full rounded-full bg-primary transition-[width]"
            style={{ width: `${points.length ? (visitedCount / points.length) * 100 : 0}%` }}
          />
        </div>
      </div>

      <div className="p-4 sm:p-6">
        {allPresented ? (
          <div className="flex items-start gap-3 rounded-2xl bg-success-soft p-4 text-success">
            <CheckCircle2 className="mt-0.5 size-5 shrink-0" aria-hidden="true" />
            <div>
              <p className="font-semibold">Todos os pontos foram apresentados</p>
              <p className="mt-1 text-sm opacity-80">
                A visita interpretativa desta etapa está completa.
              </p>
            </div>
          </div>
        ) : null}

        <div className={allPresented ? "mt-4" : ""}>
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
                {selectedIndex + 1} / {points.length}
              </p>
              <h3 className="mt-1 text-xl font-semibold leading-tight tracking-tight sm:text-2xl">
                {selected.title}
              </h3>
            </div>
            <span className="shrink-0 rounded-full bg-muted px-2.5 py-1 text-[11px] font-semibold text-muted-foreground">
              {statusLabel(selected.status)}
            </span>
          </div>

          {selected.interpretation ? (
            <p className="mt-3 whitespace-pre-wrap text-sm leading-relaxed text-foreground/85">
              {selected.interpretation}
            </p>
          ) : null}

          {selected.guide_tip ? (
            <div className="mt-4 rounded-2xl border border-primary/20 bg-primary-soft/40 p-3.5">
              <div className="flex items-center gap-2 text-primary">
                <Lightbulb className="size-4" aria-hidden="true" />
                <p className="text-[10px] font-semibold uppercase tracking-[0.16em]">
                  Dica ao guia
                </p>
              </div>
              <p className="mt-1.5 text-sm leading-relaxed">{selected.guide_tip}</p>
            </div>
          ) : null}

          {canOperate ? (
            <div className="mt-5 space-y-2">
              {selected.status === "available" ? (
                <Button
                  className="min-h-14 w-full rounded-2xl text-base"
                  disabled={statusMutation.isPending}
                  onClick={() => statusMutation.mutate({ pointId: selected.id, status: "visited" })}
                >
                  <CheckCircle2 className="mr-2 size-5" aria-hidden="true" />
                  Ponto apresentado
                </Button>
              ) : (
                <Button
                  variant="outline"
                  className="min-h-11 w-full rounded-xl"
                  disabled={statusMutation.isPending}
                  onClick={() =>
                    statusMutation.mutate({ pointId: selected.id, status: "available" })
                  }
                >
                  <RotateCcw className="mr-2 size-4" aria-hidden="true" />
                  Restaurar como disponível
                </Button>
              )}

              {selected.status === "available" ? (
                <div className="grid grid-cols-2 gap-2">
                  <Button
                    variant="outline"
                    className="min-h-11 rounded-xl"
                    disabled={statusMutation.isPending}
                    onClick={() =>
                      statusMutation.mutate({ pointId: selected.id, status: "unavailable" })
                    }
                  >
                    <EyeOff className="mr-2 size-4" aria-hidden="true" />
                    Indisponível
                  </Button>
                  <Button
                    variant="ghost"
                    className="min-h-11 rounded-xl"
                    disabled={statusMutation.isPending}
                    onClick={() =>
                      statusMutation.mutate({ pointId: selected.id, status: "ignored" })
                    }
                  >
                    <CircleDot className="mr-2 size-4" aria-hidden="true" />
                    Ignorar
                  </Button>
                </div>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>

      <div className="grid grid-cols-2 border-t border-border/70 bg-background/45">
        <Button
          variant="ghost"
          className="min-h-12 rounded-none border-r border-border/70"
          disabled={!previous}
          onClick={() => previous && setSelectedId(previous.id)}
        >
          <ArrowLeft className="mr-2 size-4" aria-hidden="true" />
          Anterior
        </Button>
        <Button
          variant="ghost"
          className="min-h-12 rounded-none"
          disabled={!next}
          onClick={() => next && setSelectedId(next.id)}
        >
          Próximo
          <ArrowRight className="ml-2 size-4" aria-hidden="true" />
        </Button>
      </div>
    </article>
  );
}
