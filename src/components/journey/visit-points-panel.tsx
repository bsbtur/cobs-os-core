import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  CheckCircle2,
  Circle,
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
    visited: "Apresentado",
    unavailable: "Indisponível",
    ignored: "Ignorado",
  }[status];
}

function pointStatusClass(status: VisitPointStatus, selected: boolean) {
  if (selected) return "border-primary bg-primary text-primary-foreground shadow-sm";
  if (status === "visited") return "border-success/30 bg-success-soft text-success";
  if (status === "unavailable") {
    return "border-border bg-muted text-muted-foreground opacity-65";
  }
  if (status === "ignored") {
    return "border-border bg-background text-muted-foreground opacity-65";
  }
  return "border-border bg-background text-muted-foreground";
}

function PointStatusIcon({ status }: { status: VisitPointStatus }) {
  if (status === "visited") return <Check className="size-3.5" aria-hidden="true" />;
  if (status === "unavailable") return <EyeOff className="size-3" aria-hidden="true" />;
  if (status === "ignored") return <CircleDot className="size-3" aria-hidden="true" />;
  return <Circle className="size-3" aria-hidden="true" />;
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

  const points = React.useMemo(() => query.data ?? [], [query.data]);
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
  const nextAvailable = points
    .slice(Math.max(selectedIndex + 1, 0))
    .find((point) => point.status === "available");
  const allPresented = visitedCount === points.length;
  const completion = points.length ? Math.round((visitedCount / points.length) * 100) : 0;

  return (
    <article className="overflow-hidden rounded-[28px] border border-primary/20 bg-elevated shadow-sm">
      <div className="border-b border-border/70 bg-background/30 px-4 pb-4 pt-4 sm:px-6">
        <div className="flex items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-2">
            <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary-soft text-primary">
              <MapPinned className="size-4" aria-hidden="true" />
            </span>
            <div className="min-w-0">
              <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">
                Modo guia
              </p>
              <p className="truncate text-sm font-semibold">Pontos da visita</p>
            </div>
          </div>
          <div className="shrink-0 text-right">
            <p className="font-mono text-sm font-bold tabular-nums">
              {visitedCount}/{points.length}
            </p>
            <p className="text-[10px] text-muted-foreground">{completion}% concluído</p>
          </div>
        </div>

        <div
          className="mt-4 flex gap-2 overflow-x-auto pb-1"
          aria-label="Progresso dos pontos da visita"
        >
          {points.map((point, index) => {
            const isSelected = point.id === selected.id;
            return (
              <button
                key={point.id}
                type="button"
                onClick={() => setSelectedId(point.id)}
                className={`flex size-9 shrink-0 items-center justify-center rounded-full border text-xs font-semibold transition ${pointStatusClass(point.status, isSelected)}`}
                aria-label={`${index + 1}. ${point.title} — ${statusLabel(point.status)}`}
                aria-current={isSelected ? "step" : undefined}
              >
                {point.status === "visited" && !isSelected ? (
                  <PointStatusIcon status={point.status} />
                ) : (
                  index + 1
                )}
              </button>
            );
          })}
        </div>
      </div>

      <div className="p-4 sm:p-6">
        {allPresented ? (
          <div className="rounded-3xl border border-success/20 bg-success-soft p-5 text-success">
            <div className="flex items-center gap-3">
              <span className="flex size-11 shrink-0 items-center justify-center rounded-full bg-success text-white">
                <CheckCircle2 className="size-6" aria-hidden="true" />
              </span>
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-[0.18em] opacity-75">
                  Visita concluída
                </p>
                <p className="mt-0.5 text-lg font-semibold">Todos os pontos foram apresentados</p>
              </div>
            </div>
            <p className="mt-3 text-sm leading-relaxed opacity-85">
              O conteúdo interpretativo desta etapa está completo.
            </p>
          </div>
        ) : (
          <>
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="rounded-full bg-primary px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.16em] text-primary-foreground">
                    Agora
                  </span>
                  <span className="font-mono text-[11px] font-semibold tabular-nums text-muted-foreground">
                    {selectedIndex + 1} de {points.length}
                  </span>
                </div>
                <h3 className="mt-3 text-2xl font-semibold leading-tight tracking-tight sm:text-3xl">
                  {selected.title}
                </h3>
              </div>
              <span className="shrink-0 rounded-full border border-border bg-background px-2.5 py-1 text-[10px] font-semibold text-muted-foreground">
                {statusLabel(selected.status)}
              </span>
            </div>

            {selected.interpretation ? (
              <p className="mt-4 whitespace-pre-wrap text-[15px] leading-7 text-foreground/90">
                {selected.interpretation}
              </p>
            ) : null}

            {selected.guide_tip ? (
              <div className="mt-5 rounded-2xl border border-primary/20 bg-primary-soft/45 p-4">
                <div className="flex items-center gap-2 text-primary">
                  <Lightbulb className="size-4" aria-hidden="true" />
                  <p className="text-[10px] font-bold uppercase tracking-[0.18em]">Dica ao guia</p>
                </div>
                <p className="mt-2 text-sm leading-6 text-foreground/90">{selected.guide_tip}</p>
              </div>
            ) : null}

            {canOperate ? (
              <div className="mt-6 space-y-3">
                {selected.status === "available" ? (
                  <Button
                    className="min-h-14 w-full rounded-2xl text-base font-semibold shadow-sm"
                    disabled={statusMutation.isPending}
                    onClick={() =>
                      statusMutation.mutate({ pointId: selected.id, status: "visited" })
                    }
                  >
                    <CheckCircle2 className="mr-2 size-5" aria-hidden="true" />
                    Ponto apresentado
                  </Button>
                ) : (
                  <Button
                    variant="outline"
                    className="min-h-12 w-full rounded-2xl"
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
                      className="min-h-11 rounded-xl text-xs sm:text-sm"
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
                      className="min-h-11 rounded-xl text-xs text-muted-foreground sm:text-sm"
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

            {nextAvailable && nextAvailable.id !== selected.id ? (
              <button
                type="button"
                onClick={() => setSelectedId(nextAvailable.id)}
                className="mt-6 flex w-full items-center justify-between gap-3 rounded-2xl border border-border bg-background/50 p-4 text-left transition hover:bg-muted/50"
              >
                <div className="min-w-0">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                    Próximo disponível
                  </p>
                  <p className="mt-1 truncate text-sm font-semibold">{nextAvailable.title}</p>
                </div>
                <ArrowRight className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
              </button>
            ) : null}
          </>
        )}
      </div>

      {!allPresented ? (
        <div className="grid grid-cols-2 border-t border-border/70 bg-background/35">
          <Button
            variant="ghost"
            className="min-h-12 rounded-none border-r border-border/70 text-muted-foreground"
            disabled={!previous}
            onClick={() => previous && setSelectedId(previous.id)}
          >
            <ArrowLeft className="mr-2 size-4" aria-hidden="true" />
            Anterior
          </Button>
          <Button
            variant="ghost"
            className="min-h-12 rounded-none text-muted-foreground"
            disabled={!next}
            onClick={() => next && setSelectedId(next.id)}
          >
            Próximo
            <ArrowRight className="ml-2 size-4" aria-hidden="true" />
          </Button>
        </div>
      ) : null}
    </article>
  );
}
