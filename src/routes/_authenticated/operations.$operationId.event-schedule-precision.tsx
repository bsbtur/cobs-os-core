import { createFileRoute, useParams } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { feedback } from "@/components/feedback/feedback";
import { humanizeError } from "@/lib/auth";
import { useI18n } from "@/lib/i18n";
import { newIdempotencyKey } from "@/lib/w07";

export const Route = createFileRoute("/_authenticated/operations/$operationId/event-schedule-precision")({
  head: () => ({
    meta: [
      { title: "Precisão de horário do evento — COBS OS" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: EventSchedulePrecisionPage,
});

type EventLite = {
  id: string;
  name: string;
  planned_start: string;
  planned_end: string;
  status: string;
};

type RpcResult = { data: unknown; error: unknown };

async function setPrecision(eventId: string, precision: "datetime" | "date_only") {
  const rpc = supabase.rpc.bind(supabase) as unknown as (
    fn: string,
    args: Record<string, unknown>,
  ) => Promise<RpcResult>;
  const { error } = await rpc("set_event_schedule_precision", {
    _event_id: eventId,
    _schedule_precision: precision,
    _idempotency_key: newIdempotencyKey(),
  });
  if (error) throw error;
}

function EventSchedulePrecisionPage() {
  const { operationId } = useParams({
    from: "/_authenticated/operations/$operationId/event-schedule-precision",
  });
  const { locale } = useI18n();
  const queryClient = useQueryClient();

  const events = useQuery({
    queryKey: ["event-schedule-precision-admin", operationId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("events")
        .select("id,name,planned_start,planned_end,status")
        .eq("operation_id", operationId)
        .order("planned_start", { ascending: true });
      if (error) throw error;
      return (data ?? []) as EventLite[];
    },
  });

  const update = useMutation({
    mutationFn: async ({
      eventId,
      precision,
    }: {
      eventId: string;
      precision: "datetime" | "date_only";
    }) => setPrecision(eventId, precision),
    onSuccess: async () => {
      feedback.success("Precisão do horário atualizada.");
      await queryClient.invalidateQueries({ queryKey: ["w10-portal"] });
    },
    onError: (error) => feedback.error(humanizeError(error, locale)),
  });

  return (
    <main className="mx-auto w-full max-w-4xl space-y-4 p-4 sm:p-6">
      <div>
        <h1 className="text-xl font-semibold text-foreground">Precisão do horário do evento</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Use “Horário a confirmar” quando as datas são oficiais, mas os horários ainda não foram publicados.
        </p>
      </div>

      {events.isLoading ? (
        <p className="text-sm text-muted-foreground">Carregando eventos…</p>
      ) : events.error ? (
        <p className="text-sm text-destructive">Não foi possível carregar os eventos.</p>
      ) : (events.data ?? []).length === 0 ? (
        <p className="text-sm text-muted-foreground">Nenhum evento nesta operação.</p>
      ) : (
        <div className="space-y-3">
          {(events.data ?? []).map((event) => (
            <section key={event.id} className="surface-panel space-y-3 p-4">
              <div>
                <h2 className="font-medium text-foreground">{event.name}</h2>
                <p className="text-xs text-muted-foreground">Status: {event.status}</p>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  disabled={update.isPending}
                  onClick={() => update.mutate({ eventId: event.id, precision: "date_only" })}
                >
                  Horário a confirmar
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  disabled={update.isPending}
                  onClick={() => update.mutate({ eventId: event.id, precision: "datetime" })}
                >
                  Horário confirmado
                </Button>
              </div>
            </section>
          ))}
        </div>
      )}
    </main>
  );
}
