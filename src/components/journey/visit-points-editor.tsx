import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Lightbulb, MapPinned, Plus } from "lucide-react";

import { feedback } from "@/components/feedback/feedback";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";
import { humanizeError } from "@/lib/auth";
import { useI18n } from "@/lib/i18n";

type VisitPoint = Tables<"journey_visit_points">;

export function VisitPointsEditor({
  operationId,
  journeyStepId,
  editable,
}: {
  operationId: string;
  journeyStepId: string;
  editable: boolean;
}) {
  const { locale } = useI18n();
  const queryClient = useQueryClient();
  const [open, setOpen] = React.useState(false);
  const [title, setTitle] = React.useState("");
  const [interpretation, setInterpretation] = React.useState("");
  const [guideTip, setGuideTip] = React.useState("");

  const pointsQuery = useQuery({
    queryKey: ["journey-visit-points", operationId, journeyStepId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("journey_visit_points")
        .select("*")
        .eq("operation_id", operationId)
        .eq("journey_step_id", journeyStepId)
        .order("sequence");
      if (error) throw error;
      return (data ?? []) as VisitPoint[];
    },
  });

  const createPoint = useMutation({
    mutationFn: async () => {
      const payload = {
        _journey_step_id: journeyStepId,
        _title: title.trim(),
        ...(interpretation.trim() ? { _interpretation: interpretation.trim() } : {}),
        ...(guideTip.trim() ? { _guide_tip: guideTip.trim() } : {}),
      };
      const { error } = await supabase.rpc("create_journey_visit_point", payload);
      if (error) throw error;
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: ["journey-visit-points", operationId, journeyStepId],
      });
      feedback.success("Ponto da visita criado.");
      setTitle("");
      setInterpretation("");
      setGuideTip("");
      setOpen(false);
    },
    onError: (error) => feedback.error(humanizeError(error, locale)),
  });

  const points = pointsQuery.data ?? [];

  return (
    <section className="mt-4 rounded-xl border border-primary/20 bg-primary-soft/20 p-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="flex min-w-0 items-start gap-2.5">
          <MapPinned className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden="true" />
          <div>
            <p className="text-sm font-semibold">Pontos da visita</p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Conteúdo interpretativo que orienta o guia durante esta etapa. Não substitui o
              checklist.
            </p>
          </div>
        </div>
        {editable ? (
          <Button size="sm" variant="outline" className="min-h-9" onClick={() => setOpen(true)}>
            <Plus className="mr-1.5 size-3.5" aria-hidden="true" />
            Adicionar ponto
          </Button>
        ) : null}
      </div>

      {pointsQuery.isLoading ? (
        <p className="mt-3 text-xs text-muted-foreground">Carregando pontos…</p>
      ) : points.length === 0 ? (
        <p className="mt-3 rounded-lg border border-dashed border-border/70 px-3 py-2.5 text-xs text-muted-foreground">
          Nenhum ponto cadastrado nesta etapa.
        </p>
      ) : (
        <ol className="mt-3 space-y-2">
          {points.map((point, index) => (
            <li key={point.id} className="rounded-lg border border-border/70 bg-background/60 p-3">
              <div className="flex items-start gap-2.5">
                <span className="inline-flex size-6 shrink-0 items-center justify-center rounded-full bg-primary-soft font-mono text-[10px] font-semibold text-primary">
                  {index + 1}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium">{point.title}</p>
                  {point.interpretation ? (
                    <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-muted-foreground">
                      {point.interpretation}
                    </p>
                  ) : null}
                  {point.guide_tip ? (
                    <p className="mt-1.5 flex items-start gap-1.5 text-xs text-primary">
                      <Lightbulb className="mt-0.5 size-3 shrink-0" aria-hidden="true" />
                      <span className="line-clamp-2">{point.guide_tip}</span>
                    </p>
                  ) : null}
                </div>
              </div>
            </li>
          ))}
        </ol>
      )}

      <Dialog open={open} onOpenChange={(next) => (createPoint.isPending ? null : setOpen(next))}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Novo ponto da visita</DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor={`visit-point-title-${journeyStepId}`}>Título</Label>
              <Input
                id={`visit-point-title-${journeyStepId}`}
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                placeholder="Ex.: Anjos suspensos"
                className="min-h-11"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor={`visit-point-interpretation-${journeyStepId}`}>
                Conteúdo interpretativo
              </Label>
              <Textarea
                id={`visit-point-interpretation-${journeyStepId}`}
                value={interpretation}
                onChange={(event) => setInterpretation(event.target.value)}
                placeholder="O que o guia precisa apresentar neste ponto?"
                rows={4}
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor={`visit-point-tip-${journeyStepId}`}>Dica ao guia</Label>
              <Textarea
                id={`visit-point-tip-${journeyStepId}`}
                value={guideTip}
                onChange={(event) => setGuideTip(event.target.value)}
                placeholder="Ex.: destaque a sensação de leveza das esculturas."
                rows={3}
              />
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button
              variant="ghost"
              className="min-h-11"
              disabled={createPoint.isPending}
              onClick={() => setOpen(false)}
            >
              Cancelar
            </Button>
            <Button
              className="min-h-11"
              disabled={!title.trim() || createPoint.isPending}
              onClick={() => createPoint.mutate()}
            >
              {createPoint.isPending ? "Salvando…" : "Criar ponto"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </section>
  );
}
