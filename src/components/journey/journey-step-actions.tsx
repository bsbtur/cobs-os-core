import { useLocation } from "@tanstack/react-router";
import { useMutation, useQuery } from "@tanstack/react-query";

import { feedback } from "@/components/feedback/feedback";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { humanizeError } from "@/lib/auth";
import { useI18n } from "@/lib/i18n";
import type { JourneyStepRow } from "@/lib/w04";

type StepAction = {
  fn: string;
  label: string;
  gated?: boolean;
  className?: string;
  requiresArrival?: boolean;
};

function requiresArrival(step: JourneyStepRow) {
  return (
    step.step_kind === "movement" ||
    step.step_kind === "return" ||
    step.step_kind === "disembarkation"
  );
}

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
  const location = useLocation();
  const focused = location.pathname.endsWith("/cockpit-v2");

  /**
   * Cockpit V2 needs one extra read-only fact to choose the protagonist action.
   * The Live runtime already exposes the full action matrix and is intentionally
   * unchanged. This query never writes or creates a parallel lifecycle.
   */
  const boardingState = useQuery({
    queryKey: ["cockpit-v2", "boarding-started", step.id],
    enabled: focused && step.presence_requirement === "boarded",
    refetchInterval: 20_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("journey_events")
        .select("id")
        .eq("journey_step_id", step.id)
        .eq("event_type", "BOARDING_STARTED")
        .limit(1);
      if (error) throw error;
      return (data?.length ?? 0) > 0;
    },
  });

  const boardingStarted = boardingState.data ?? false;

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
      const action = actions.find((candidate) => candidate.fn === fn);
      feedback.success(`${t("w04.live.recorded")}: ${action?.label ?? ""}`.trim());
      void boardingState.refetch();
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

  const actions: StepAction[] = [];
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
    requiresArrival: requiresArrival(step),
  });

  const primaryFn = focused
    ? step.presence_requirement === "boarded" && !boardingStarted
      ? "start_boarding"
      : ready && requiresArrival(step) && !arrived
        ? "record_arrival"
        : ready
          ? "complete_journey_step"
          : null
    : null;

  const visibleActions = focused
    ? actions.filter(
        (action) =>
          !(action.fn === "start_boarding" && boardingStarted) &&
          !(action.fn === "record_arrival" && arrived),
      )
    : actions;

  const primaryAction = primaryFn
    ? (visibleActions.find((action) => action.fn === primaryFn) ?? null)
    : null;
  const secondaryActions = primaryAction
    ? visibleActions.filter((action) => action.fn !== primaryAction.fn)
    : visibleActions;

  const isDisabled = (action: StepAction) =>
    call.isPending ||
    (action.gated === true && !ready) ||
    (action.requiresArrival === true && !arrived);

  const actionTitle = (action: StepAction) =>
    action.requiresArrival === true && !arrived ? t("w04.presence.arrivalNotRecorded") : undefined;

  const runAction = (action: StepAction) => {
    console.info("[W04_CLICK]", {
      label: action.label,
      fn: action.fn,
      stepId: step.id,
      at: new Date().toISOString(),
    });
    call.mutate(action.fn);
  };

  if (!focused) {
    return (
      <div className="flex flex-wrap gap-2">
        {visibleActions.map((action) => (
          <Button
            key={action.fn}
            className={`min-h-12 flex-1 sm:flex-none ${action.className ?? ""}`}
            variant={action.gated ? "default" : "outline"}
            title={actionTitle(action)}
            disabled={isDisabled(action)}
            onClick={() => runAction(action)}
          >
            {action.label}
          </Button>
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {primaryAction ? (
        <Button
          className="min-h-14 w-full rounded-2xl px-4 text-base font-semibold"
          title={actionTitle(primaryAction)}
          disabled={isDisabled(primaryAction) || boardingState.isLoading}
          onClick={() => runAction(primaryAction)}
        >
          {primaryAction.label}
        </Button>
      ) : null}

      {secondaryActions.length > 0 ? (
        <div className="space-y-2">
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
            {primaryAction ? "Outras ações" : "Ações disponíveis"}
          </p>
          <div className="flex flex-wrap gap-2">
            {secondaryActions.map((action) => (
              <Button
                key={action.fn}
                className={`min-h-11 flex-1 sm:flex-none ${action.className ?? ""}`}
                variant="outline"
                title={actionTitle(action)}
                disabled={isDisabled(action)}
                onClick={() => runAction(action)}
              >
                {action.label}
              </Button>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}
