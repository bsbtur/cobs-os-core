import * as React from "react";
import { createFileRoute, Link, useParams } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";

import { EditJourneyStepDialog } from "@/components/journey/edit-journey-step-dialog";
import { EmptyState } from "@/components/feedback/empty-state";
import { PanelSkeleton } from "@/components/feedback/loading";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { type JourneyStepRow } from "@/lib/w04";

export const Route = createFileRoute(
  "/_authenticated/operations/$operationId/journey/$stepId/edit",
)({
  component: JourneyStepEditPage,
});

function JourneyStepEditPage() {
  const { operationId, stepId } = useParams({
    from: "/_authenticated/operations/$operationId/journey/$stepId/edit",
  });
  const [editing, setEditing] = React.useState<JourneyStepRow | null>(null);

  const step = useQuery({
    queryKey: ["journey-step", operationId, stepId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("journey_steps")
        .select("*")
        .eq("operation_id", operationId)
        .eq("id", stepId)
        .maybeSingle();
      if (error) throw error;
      return data as JourneyStepRow | null;
    },
  });

  React.useEffect(() => {
    if (step.data) setEditing(step.data);
  }, [step.data]);

  if (step.isLoading) return <PanelSkeleton />;

  if (!step.data) {
    return (
      <EmptyState
        title="Etapa indisponível"
        body="A etapa não existe ou você não possui acesso a ela."
      />
    );
  }

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm text-muted-foreground">Jornada</p>
          <h1 className="text-xl font-semibold">{step.data.title}</h1>
        </div>
        <div className="flex gap-2">
          <Button asChild variant="outline">
            <Link to="/operations/$operationId/journey" params={{ operationId }}>
              Voltar para Jornada
            </Link>
          </Button>
          <Button onClick={() => setEditing(step.data)}>Editar etapa</Button>
        </div>
      </div>

      <p className="surface-panel px-4 py-3 text-sm text-muted-foreground">
        Use “Editar etapa” para alterar os campos estruturais por meio do comando oficial W04.
      </p>

      <EditJourneyStepDialog
        step={editing}
        operationId={operationId}
        onOpenChange={(open) => {
          if (!open) setEditing(null);
        }}
      />
    </section>
  );
}
