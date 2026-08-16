import { useMutation } from "@tanstack/react-query";

import { feedback } from "@/components/feedback/feedback";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { humanizeError } from "@/lib/auth";
import { useI18n } from "@/lib/i18n";
import type { JourneyStepRow } from "@/lib/w04";

export function JourneyStepActions({
  step,
  ready,
  arrived,
  onRefresh,
}: {
  step: JourneyStepRow;
  ready: boolean;
  /** DEF-PILOT-023 / 025: ARRIVED exists on this step. */
  arrived: boolean;
  onRefresh: () => void;
}) {
  const { t, locale } = useI18n();

  const call = useMutation({
    mutationFn: async (fn: string) => {
      // DEF_PILOT_022 — temporary diagnostic instrumentation (no PII, no tokens)
      console.info("[W04_RPC_START]", { fn, stepId: step.id, at: new Date().toISOString() });
      const startedAt = performance.now();
      const { data, error } = await supabase.rpc(fn as "start_journey_step", {
        _journey_step_id: step.id,
      });
      console.info("[W04_RPC_RESULT]", {
        fn,
        ok: !error,
        errorCode: error?.code ?? null,
        errorMessage: error?.message ?? null,
        hasData: data != null,
        durationMs: performance.now() - startedAt,
      });
      if (error) throw error;
      return data;
    },
    onSuccess: (_data, fn) => {
      console.info("[W04_SUCCESS]", { fn, at: new Date().toISOString() });
      const action = actions.find((a) => a.fn === fn);
      feedback.success(`${t("w04.live.recorded")}: ${action?.label ?? ""}`.trim());
      onRefresh();
    },
    onError: (error, fn) => {
      console.info("[W04_ERROR]", {
        fn,
        message: error instanceof Error ? error.message : String(error),
        at: new Date().toISOString(),
      });
      feedback.error(humanizeError(error, locale));
    },
  });

  const actions: Array<{
    fn: string;
    label: string;
    gated?: boolean;
    className?: string;
    requiresArrival?: boolean;
  }> = [];
  if (step.step_kind === "meeting")
    actions.push({ fn: "start_gathering", label: t("w04.action.startGathering") });
  // DEF-PILOT-009: boarding action set is driven by the backend contract
  // (presence_requirement = 'boarded'), not only by step_kind = 'boarding'.
  if (step.presence_requirement === "boarded") {
    actions.push({ fn: "start_boarding", label: t("w04.action.startBoarding") });
    actions.push({ fn: "complete_boarding", label: t("w04.action.completeBoarding"), gated: true });
    actions.push({
      fn: "authorize_departure",
      label: t("w04.action.authorizeDeparture"),
      gated: true,
    });
    actions.push({
      fn: "record_departed",
      label: t("w04.action.departed"),
      className: "border-l border-border/60 pl-3 ml-1",
    });
  }
  // DEF-PILOT-025: disembarkation also needs ARRIVED before any disembark action.
  if (
    step.step_kind === "movement" ||
    step.step_kind === "arrival" ||
    step.step_kind === "return" ||
    step.step_kind === "disembarkation"
  ) {
    actions.push({ fn: "record_arrival", label: t("w04.action.arrived") });
  }
  if (step.step_kind === "disembarkation") {
    actions.push({
      fn: "complete_disembarkation",
      label: t("w04.action.disembarked"),
      gated: true,
      requiresArrival: true,
    });
  }
  actions.push({
    fn: "complete_journey_step",
    label: t("w04.action.completeStep"),
    gated: true,
    // DEF-PILOT-023: movement/return/disembarkation cannot close without ARRIVED.
    requiresArrival:
      step.step_kind === "movement" ||
      step.step_kind === "return" ||
      step.step_kind === "disembarkation",
  });

  return (
    <div className="flex flex-wrap gap-2">
      {actions.map((action) => (
        <Button
          key={action.fn}
          className={`min-h-12 flex-1 sm:flex-none ${action.className ?? ""}`}
          variant={action.gated ? "default" : "outline"}
          title={
            action.requiresArrival === true && !arrived
              ? t("w04.presence.arrivalNotRecorded")
              : undefined
          }
          disabled={
            call.isPending ||
            (action.gated === true && !ready) ||
            (action.requiresArrival === true && !arrived)
          }
          onClick={() => {
            console.info("[W04_CLICK]", {
              label: action.label,
              fn: action.fn,
              stepId: step.id,
              at: new Date().toISOString(),
            });
            call.mutate(action.fn);
          }}
        >
          {action.label}
        </Button>
      ))}
    </div>
  );
}
