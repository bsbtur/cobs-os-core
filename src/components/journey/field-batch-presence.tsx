import * as React from "react";
import { useLocation } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckSquare2, UsersRound } from "lucide-react";

import { Button } from "@/components/ui/button";
import { feedback } from "@/components/feedback/feedback";
import { supabase } from "@/integrations/supabase/client";
import { humanizeError } from "@/lib/auth";
import { useI18n } from "@/lib/i18n";
import {
  SATISFYING_FACTS,
  presenceLabel,
  type JourneyStepRow,
  type PresenceEventRow,
  type PresenceFact,
  type RuntimeState,
} from "@/lib/w04";

type RosterRow = {
  id: string;
  participation_kind: string;
  status: string;
  people: { full_name: string } | null;
};

export function FieldBatchPresence({ operationId }: { operationId: string }) {
  const location = useLocation();
  const { t, locale } = useI18n();
  const queryClient = useQueryClient();
  const isLive = location.pathname.endsWith(`/operations/${operationId}/live`);
  const [selected, setSelected] = React.useState<Set<string>>(new Set());

  const batch = useQuery({
    queryKey: ["px06-batch-presence", operationId],
    enabled: isLive,
    refetchInterval: 20_000,
    queryFn: async () => {
      const [steps, roster, presence, gates, state] = await Promise.all([
        supabase.from("journey_steps").select("*").eq("operation_id", operationId).order("sequence"),
        supabase
          .from("operation_participations")
          .select("id, participation_kind, status, people(full_name)")
          .eq("operation_id", operationId)
          .neq("status", "cancelled"),
        supabase.from("participant_presence_events").select("*").eq("operation_id", operationId),
        supabase
          .from("journey_events")
          .select("journey_step_id, event_type")
          .eq("operation_id", operationId)
          .in("event_type", ["BOARDING_STARTED", "ARRIVED"]),
        supabase.rpc("w04_operation_runtime_state", { _operation_id: operationId }),
      ]);
      if (steps.error) throw steps.error;
      if (roster.error) throw roster.error;
      if (presence.error) throw presence.error;
      if (gates.error) throw gates.error;
      if (state.error) throw state.error;
      return {
        steps: (steps.data ?? []) as JourneyStepRow[],
        roster: (roster.data ?? []) as unknown as RosterRow[],
        presence: (presence.data ?? []) as PresenceEventRow[],
        gates: gates.data ?? [],
        state: (state.data ?? null) as RuntimeState | null,
      };
    },
  });

  const current = batch.data?.steps.find((step) => step.id === batch.data?.state?.current_step_id) ?? null;
  const requirement = current?.presence_requirement ?? "none";
  const primaryFact: PresenceFact | null = !current
    ? null
    : current.step_kind === "disembarkation"
      ? "DISEMBARKED"
      : requirement === "boarded"
        ? "BOARDED"
        : requirement === "none"
          ? null
          : "PRESENT_AT_MEETING_POINT";

  const retracted = React.useMemo(() => {
    const ids = new Set<string>();
    for (const event of batch.data?.presence ?? []) if (event.retracts_presence_event_id) ids.add(event.retracts_presence_event_id);
    return ids;
  }, [batch.data?.presence]);

  const effectiveFact = React.useCallback(
    (participationId: string): PresenceFact | null => {
      if (!current) return null;
      const event = (batch.data?.presence ?? [])
        .filter(
          (row) =>
            row.participation_id === participationId &&
            row.journey_step_id === current.id &&
            row.presence_fact !== "PRESENCE_RETRACTED" &&
            !retracted.has(row.id),
        )
        .sort((a, b) => (a.occurred_at < b.occurred_at ? 1 : -1))[0];
      return (event?.presence_fact as PresenceFact | undefined) ?? null;
    },
    [batch.data?.presence, current, retracted],
  );

  const candidates = React.useMemo(() => {
    if (!current || !primaryFact || requirement === "none") return [];
    const satisfying = SATISFYING_FACTS[requirement];
    return (batch.data?.roster ?? []).filter((row) => {
      if (row.status !== "confirmed") return false;
      if (current.presence_population === "participants" && row.participation_kind !== "participant") return false;
      const fact = effectiveFact(row.id);
      return !fact || !satisfying.includes(fact);
    });
  }, [batch.data?.roster, current, effectiveFact, primaryFact, requirement]);

  React.useEffect(() => {
    setSelected((previous) => new Set([...previous].filter((id) => candidates.some((row) => row.id === id))));
  }, [candidates]);

  const boardingStarted = Boolean(
    current && batch.data?.gates.some((row) => row.journey_step_id === current.id && row.event_type === "BOARDING_STARTED"),
  );
  const arrived = Boolean(
    current && batch.data?.gates.some((row) => row.journey_step_id === current.id && row.event_type === "ARRIVED"),
  );
  const blocked = primaryFact === "BOARDED" ? !boardingStarted : primaryFact === "DISEMBARKED" ? !arrived : false;

  const apply = useMutation({
    mutationFn: async () => {
      if (!current || !primaryFact || selected.size === 0) return { success: 0, failed: 0 };
      let success = 0;
      let failed = 0;
      // Intentionally sequential. Every traveler uses the canonical single-person RPC,
      // preserving one auditable fact per participation and avoiding an opaque bulk write.
      for (const participationId of selected) {
        const { error } = await supabase.rpc("record_presence_fact", {
          _journey_step_id: current.id,
          _participation_id: participationId,
          _presence_fact: primaryFact,
        });
        if (error) failed += 1;
        else success += 1;
      }
      return { success, failed };
    },
    onSuccess: ({ success, failed }) => {
      if (success > 0) feedback.success(`${success} registro(s) confirmado(s).`);
      if (failed > 0) feedback.error(`${failed} registro(s) não puderam ser confirmados.`);
      setSelected(new Set());
      void queryClient.invalidateQueries({ queryKey: ["px06-batch-presence", operationId] });
      void queryClient.invalidateQueries({ queryKey: ["live", operationId] });
    },
    onError: (error) => feedback.error(humanizeError(error, locale)),
  });

  if (!isLive || batch.isLoading || batch.isError || !current || !primaryFact || candidates.length < 2) return null;

  const allSelected = candidates.length > 0 && candidates.every((row) => selected.has(row.id));

  return (
    <section className="surface-panel p-4 sm:hidden" aria-label="Modo em lote">
      <div className="flex items-center gap-2">
        <UsersRound className="size-4 text-primary" aria-hidden="true" />
        <div className="min-w-0 flex-1">
          <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-primary">Modo em lote</p>
          <p className="mt-0.5 text-xs text-muted-foreground">Selecione viajantes pendentes e registre o mesmo fato individualmente.</p>
        </div>
        <span className="rounded-full bg-muted px-2 py-1 font-mono text-[10px] tabular-nums">{selected.size}/{candidates.length}</span>
      </div>

      <div className="mt-3 flex gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="min-h-11 flex-1"
          onClick={() => setSelected(allSelected ? new Set() : new Set(candidates.map((row) => row.id)))}
        >
          {allSelected ? "Limpar seleção" : "Selecionar pendentes"}
        </Button>
      </div>

      <div className="mt-3 max-h-56 space-y-1.5 overflow-y-auto rounded-lg border border-border/70 p-2">
        {candidates.map((row) => {
          const checked = selected.has(row.id);
          return (
            <label key={row.id} className="flex min-h-11 cursor-pointer items-center gap-3 rounded-md px-2 py-1.5 hover:bg-muted/60">
              <input
                type="checkbox"
                className="size-5 accent-current"
                checked={checked}
                onChange={() => {
                  setSelected((previous) => {
                    const next = new Set(previous);
                    if (next.has(row.id)) next.delete(row.id);
                    else next.add(row.id);
                    return next;
                  });
                }}
              />
              <span className="min-w-0 flex-1 truncate text-sm font-medium">{row.people?.full_name ?? "Viajante"}</span>
            </label>
          );
        })}
      </div>

      <Button
        type="button"
        className="mt-3 min-h-14 w-full text-base font-semibold"
        disabled={selected.size === 0 || blocked || apply.isPending}
        title={blocked ? t("w04.presence.boardingNotOpen") : undefined}
        onClick={() => apply.mutate()}
      >
        <CheckSquare2 className="mr-2 size-5" aria-hidden="true" />
        {apply.isPending ? "Registrando…" : `${presenceLabel(primaryFact, t)} · ${selected.size}`}
      </Button>
      <p className="mt-2 text-[11px] text-muted-foreground">Cada pessoa continua gerando um fato separado no audit trail.</p>
    </section>
  );
}