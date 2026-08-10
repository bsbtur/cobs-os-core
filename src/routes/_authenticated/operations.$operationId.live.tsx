import * as React from "react";
import { createFileRoute, Link, useParams } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, CheckCircle2, Clock, Radio, Users } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { humanizeError } from "@/lib/auth";
import { useI18n } from "@/lib/i18n";
import { formatDateTime } from "@/lib/format";
import {
  SATISFYING_FACTS,
  eventLabel,
  presenceLabel,
  type JourneyEventRow,
  type JourneyStepRow,
  type PlaybookExecutionRow,
  type PlaybookItemRow,
  type PresenceEventRow,
  type PresenceFact,
  type Readiness,
  type RuntimeState,
} from "@/lib/w04";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { EmptyState } from "@/components/feedback/empty-state";
import { PanelSkeleton } from "@/components/feedback/loading";
import { feedback } from "@/components/feedback/feedback";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

export const Route = createFileRoute("/_authenticated/operations/$operationId/live")({
  head: () => ({
    meta: [
      { title: "Live operation — COBS OS field runtime" },
      {
        name: "description",
        content:
          "Run the operation live: current step, recorded facts, people accounted for and required checklist items.",
      },
      { property: "og:title", content: "Live operation — COBS OS field runtime" },
      {
        property: "og:description",
        content: "Recorded facts only. Readiness is derived, never typed in.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: LiveRuntimePage,
});

type RosterRow = {
  id: string;
  participation_kind: string;
  status: string;
  people: { full_name: string } | null;
};

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
      {children}
    </p>
  );
}

/* ------------------------------------------------------------------ */
/* Presence roster                                                     */
/* ------------------------------------------------------------------ */

function PresencePanel({
  step,
  roster,
  presence,
  onRefresh,
}: {
  step: JourneyStepRow;
  roster: RosterRow[];
  presence: PresenceEventRow[];
  onRefresh: () => void;
}) {
  const { t, locale } = useI18n();
  const [noShow, setNoShow] = React.useState<RosterRow | null>(null);
  const [reason, setReason] = React.useState("");

  const latestFor = (participationId: string): PresenceFact | null => {
    const rows = presence
      .filter(
        (event) =>
          event.participation_id === participationId && event.journey_step_id === step.id,
      )
      .sort((a, b) => (a.occurred_at < b.occurred_at ? 1 : -1));
    return (rows[0]?.presence_fact as PresenceFact | undefined) ?? null;
  };

  const record = useMutation({
    mutationFn: async (input: {
      participationId: string;
      fact: PresenceFact;
      reason?: string;
    }) => {
      const { error } = await supabase.rpc("record_presence_fact", {
        _journey_step_id: step.id,
        _participation_id: input.participationId,
        _presence_fact: input.fact,
        ...(input.reason ? { _reason: input.reason } : {}),
      });
      if (error) throw error;
    },
    onSuccess: () => {
      feedback.success(t("w04.live.recorded"));
      setNoShow(null);
      setReason("");
      onRefresh();
    },
    onError: (error) => feedback.error(humanizeError(error, locale)),
  });

  const satisfying = SATISFYING_FACTS[step.presence_requirement];
  const primaryFact: PresenceFact =
    step.presence_requirement === "boarded" ? "BOARDED" : "PRESENT_AT_MEETING_POINT";

  const visible = roster.filter((row) =>
    step.presence_population === "participants"
      ? row.participation_kind === "participant"
      : row.status === "confirmed",
  );

  return (
    <section className="surface-panel p-4">
      <div className="flex items-center gap-2">
        <Users className="size-4 text-muted-foreground" aria-hidden="true" />
        <SectionLabel>{t("w04.live.people")}</SectionLabel>
      </div>
      <p className="mt-1 text-xs text-muted-foreground">{t("w04.presence.rosterNote")}</p>

      <ul className="mt-3 divide-y divide-border/60">
        {visible.map((row) => {
          const fact = latestFor(row.id);
          const ok = fact ? satisfying.includes(fact) : false;
          return (
            <li key={row.id} className="flex flex-wrap items-center gap-2 py-2.5">
              <span className="min-w-0 flex-1 truncate text-sm font-medium">
                {row.people?.full_name}
              </span>
              <span
                className={`font-mono text-[10px] uppercase tracking-[0.12em] ${
                  ok ? "text-success" : "text-muted-foreground"
                }`}
              >
                {fact ? presenceLabel(fact, t) : t("w04.presence.pending")}
              </span>
              <div className="flex gap-1.5">
                <Button
                  size="sm"
                  className="min-h-10"
                  disabled={record.isPending}
                  onClick={() =>
                    record.mutate({ participationId: row.id, fact: primaryFact })
                  }
                >
                  {presenceLabel(primaryFact, t)}
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="min-h-10"
                  disabled={record.isPending}
                  onClick={() =>
                    record.mutate({ participationId: row.id, fact: "ABSENCE_NOTED" })
                  }
                >
                  {presenceLabel("ABSENCE_NOTED", t)}
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  className="min-h-10"
                  onClick={() => setNoShow(row)}
                >
                  {presenceLabel("NO_SHOW_CONFIRMED", t)}
                </Button>
              </div>
            </li>
          );
        })}
      </ul>

      <Dialog open={Boolean(noShow)} onOpenChange={(open) => !open && setNoShow(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{presenceLabel("NO_SHOW_CONFIRMED", t)}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              {t("w04.presence.noShowOwnerOnly")}
            </p>
            <div className="space-y-1.5">
              <Label htmlFor="no-show-reason">{t("w04.presence.noShowReason")}</Label>
              <Textarea
                id="no-show-reason"
                rows={2}
                value={reason}
                onChange={(event) => setReason(event.target.value)}
              />
            </div>
            <Button
              className="min-h-11 w-full"
              disabled={!reason.trim() || record.isPending}
              onClick={() =>
                noShow &&
                record.mutate({
                  participationId: noShow.id,
                  fact: "NO_SHOW_CONFIRMED",
                  reason: reason.trim(),
                })
              }
            >
              {t("w04.presence.mark")}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* Checklist                                                           */
/* ------------------------------------------------------------------ */

function ChecklistPanel({
  items,
  executions,
  onRefresh,
}: {
  items: PlaybookItemRow[];
  executions: PlaybookExecutionRow[];
  onRefresh: () => void;
}) {
  const { t, locale } = useI18n();

  const stateOf = (itemId: string) =>
    executions
      .filter((row) => row.playbook_item_id === itemId)
      .sort((a, b) => (a.occurred_at < b.occurred_at ? 1 : -1))[0] ?? null;

  const act = useMutation({
    mutationFn: async (input: { itemId: string; done: boolean }) => {
      const { error } = input.done
        ? await supabase.rpc("complete_playbook_item", { _playbook_item_id: input.itemId })
        : await supabase.rpc("reopen_playbook_item", {
            _playbook_item_id: input.itemId,
            _reason: t("w04.playbook.reopen"),
          });
      if (error) throw error;
    },
    onSuccess: () => {
      feedback.success(t("w04.live.recorded"));
      onRefresh();
    },
    onError: (error) => feedback.error(humanizeError(error, locale)),
  });

  if (items.length === 0) return null;

  return (
    <section className="surface-panel p-4">
      <SectionLabel>{t("w04.live.checklist")}</SectionLabel>
      <ul className="mt-3 divide-y divide-border/60">
        {items.map((item) => {
          const last = stateOf(item.id);
          const done = last?.action === "completed";
          return (
            <li key={item.id} className="flex flex-wrap items-center gap-2 py-2.5">
              <CheckCircle2
                className={`size-4 ${done ? "text-success" : "text-muted-foreground/50"}`}
                aria-hidden="true"
              />
              <span className="min-w-0 flex-1 truncate text-sm">{item.title}</span>
              <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
                {t(`w04.requirementLabel.${item.requirement}`)}
              </span>
              <Button
                size="sm"
                variant={done ? "ghost" : "default"}
                className="min-h-10"
                disabled={act.isPending}
                onClick={() => act.mutate({ itemId: item.id, done: !done })}
              >
                {done ? t("w04.playbook.reopen") : t("w04.playbook.complete")}
              </Button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* Step actions                                                        */
/* ------------------------------------------------------------------ */

function StepActions({
  step,
  ready,
  onRefresh,
}: {
  step: JourneyStepRow;
  ready: boolean;
  onRefresh: () => void;
}) {
  const { t, locale } = useI18n();

  const call = useMutation({
    mutationFn: async (fn: string) => {
      const { error } = await supabase.rpc(fn as "start_journey_step", {
        _journey_step_id: step.id,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      feedback.success(t("w04.live.recorded"));
      onRefresh();
    },
    onError: (error) => feedback.error(humanizeError(error, locale)),
  });

  const actions: Array<{ fn: string; label: string; gated?: boolean }> = [];
  if (step.step_kind === "meeting") actions.push({ fn: "start_gathering", label: t("w04.action.startGathering") });
  if (step.step_kind === "boarding") {
    actions.push({ fn: "start_boarding", label: t("w04.action.startBoarding") });
    actions.push({ fn: "complete_boarding", label: t("w04.action.completeBoarding"), gated: true });
    actions.push({ fn: "authorize_departure", label: t("w04.action.authorizeDeparture"), gated: true });
    actions.push({ fn: "record_departed", label: t("w04.action.departed") });
  }
  if (step.step_kind === "movement" || step.step_kind === "arrival") {
    actions.push({ fn: "record_arrival", label: t("w04.action.arrived") });
  }
  if (step.step_kind === "disembarkation") {
    actions.push({ fn: "complete_disembarkation", label: t("w04.action.disembarked"), gated: true });
  }
  actions.push({ fn: "complete_journey_step", label: t("w04.action.completeStep"), gated: true });

  return (
    <div className="flex flex-wrap gap-2">
      {actions.map((action) => (
        <Button
          key={action.fn}
          className="min-h-12 flex-1 sm:flex-none"
          variant={action.gated ? "default" : "outline"}
          disabled={call.isPending || (action.gated === true && !ready)}
          onClick={() => call.mutate(action.fn)}
        >
          {action.label}
        </Button>
      ))}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Page                                                                */
/* ------------------------------------------------------------------ */

function LiveRuntimePage() {
  const { operationId } = useParams({ from: "/_authenticated/operations/$operationId/live" });
  const { t, locale } = useI18n();
  const queryClient = useQueryClient();

  const live = useQuery({
    queryKey: ["live", operationId],
    refetchInterval: 20000,
    queryFn: async () => {
      const [operation, steps, events, presence, items, executions, roster, state] =
        await Promise.all([
          supabase.from("operations").select("*").eq("id", operationId).maybeSingle(),
          supabase.from("journey_steps").select("*").eq("operation_id", operationId).order("sequence"),
          supabase
            .from("journey_events")
            .select("*")
            .eq("operation_id", operationId)
            .order("occurred_at", { ascending: false })
            .limit(40),
          supabase.from("participant_presence_events").select("*").eq("operation_id", operationId),
          supabase
            .from("playbook_items")
            .select("*")
            .eq("operation_id", operationId)
            .eq("is_active", true)
            .order("sequence"),
          supabase.from("playbook_executions").select("*").eq("operation_id", operationId),
          supabase
            .from("operation_participations")
            .select("id, participation_kind, status, people(full_name)")
            .eq("operation_id", operationId)
            .neq("status", "cancelled"),
          supabase.rpc("w04_operation_runtime_state", { _operation_id: operationId }),
        ]);
      if (operation.error) throw operation.error;
      if (steps.error) throw steps.error;
      return {
        operation: operation.data,
        steps: steps.data ?? [],
        events: (events.data ?? []) as JourneyEventRow[],
        presence: (presence.data ?? []) as PresenceEventRow[],
        items: (items.data ?? []) as PlaybookItemRow[],
        executions: (executions.data ?? []) as PlaybookExecutionRow[],
        roster: (roster.data ?? []) as unknown as RosterRow[],
        state: (state.data ?? null) as RuntimeState | null,
      };
    },
  });

  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: ["live", operationId] });
  };

  if (live.isLoading) return <PanelSkeleton />;

  const operation = live.data?.operation;
  if (!operation) {
    return (
      <EmptyState
        icon={Radio}
        title={t("w04.journey.forbidden")}
        body={t("w04.journey.forbiddenBody")}
      />
    );
  }

  const steps = live.data?.steps ?? [];
  if (steps.length === 0) {
    return (
      <EmptyState icon={Radio} title={t("w04.live.noSteps")} body={t("w04.live.noStepsBody")}>
        <Button asChild className="min-h-11">
          <Link from="/operations/$operationId" to="/operations/$operationId/journey">
            {t("w04.journey.title")}
          </Link>
        </Button>
      </EmptyState>
    );
  }

  const state = live.data?.state ?? null;
  const readiness: Readiness | null = state?.readiness ?? null;
  const current = steps.find((step) => step.id === state?.current_step_id) ?? null;
  const next = steps.find((step) => step.id === state?.next_step_id) ?? null;
  const events = live.data?.events ?? [];

  return (
    <section className="space-y-4">
      <header>
        <h2 className="text-xl font-semibold">{t("w04.live.title")}</h2>
        <p className="mt-1 text-sm text-muted-foreground">{t("w04.live.subtitle")}</p>
      </header>

      {operation.status !== "active" ? (
        <p className="surface-panel px-4 py-3 text-sm text-muted-foreground">
          {t("w04.live.notStarted")} {t("w04.live.notStartedBody")}
        </p>
      ) : null}

      {/* NOW */}
      <article className="surface-panel border-primary/40 p-4 sm:p-5">
        <SectionLabel>{t("w04.live.now")}</SectionLabel>
        {current ? (
          <>
            <h3 className="mt-1 text-2xl font-semibold tracking-tight">{current.title}</h3>
            <p className="text-sm text-muted-foreground">
              {t(`w04.kind.${current.step_kind}`)}
              {current.location_label ? ` · ${current.location_label}` : ""}
            </p>

            {readiness ? (
              <div
                className={`mt-3 flex flex-wrap items-center gap-2 rounded-lg px-3 py-2 text-sm ${
                  readiness.ready
                    ? "bg-success-soft text-success"
                    : "bg-warning-soft text-warning"
                }`}
              >
                {readiness.ready ? (
                  <CheckCircle2 className="size-4" aria-hidden="true" />
                ) : (
                  <AlertTriangle className="size-4" aria-hidden="true" />
                )}
                <span className="font-medium">
                  {readiness.ready ? t("w04.live.ready") : t("w04.live.notReady")}
                </span>
                <span className="tabular-nums">
                  {readiness.satisfied}/{readiness.evaluated} {t("w04.count.present")}
                </span>
              </div>
            ) : null}

            {readiness && !readiness.ready ? (
              <div className="mt-2 space-y-1 text-sm text-muted-foreground">
                {readiness.missing_participations.length > 0 ? (
                  <p>
                    <span className="font-medium">{t("w04.live.blockersPeople")}: </span>
                    {readiness.missing_participations.map((row) => row.full_name).join(", ")}
                  </p>
                ) : null}
                {readiness.missing_required_items.length > 0 ? (
                  <p>
                    <span className="font-medium">{t("w04.live.blockersItems")}: </span>
                    {readiness.missing_required_items.map((row) => row.title).join(", ")}
                  </p>
                ) : null}
              </div>
            ) : null}

            <div className="mt-4">
              <SectionLabel>{t("w04.live.action")}</SectionLabel>
              <div className="mt-2">
                <StepActions
                  step={current}
                  ready={readiness?.ready ?? true}
                  onRefresh={refresh}
                />
              </div>
            </div>
          </>
        ) : (
          <>
            <p className="mt-1 text-sm text-muted-foreground">{t("w04.live.noCurrentBody")}</p>
            {next ? (
              <StartNext step={next} onRefresh={refresh} />
            ) : null}
          </>
        )}
      </article>

      {next ? (
        <article className="surface-panel p-4">
          <SectionLabel>{t("w04.live.next")}</SectionLabel>
          <h3 className="mt-1 text-base font-semibold">{next.title}</h3>
          {next.expected_start ?? next.planned_start ? (
            <p className="text-sm tabular-nums text-muted-foreground">
              {formatDateTime((next.expected_start ?? next.planned_start) as string, {
                locale,
                timeZone: operation.timezone,
              })}
            </p>
          ) : null}
        </article>
      ) : null}

      {current && current.presence_requirement !== "none" ? (
        <PresencePanel
          step={current}
          roster={live.data?.roster ?? []}
          presence={live.data?.presence ?? []}
          onRefresh={refresh}
        />
      ) : null}

      {current ? (
        <ChecklistPanel
          items={(live.data?.items ?? []).filter((item) => item.journey_step_id === current.id)}
          executions={live.data?.executions ?? []}
          onRefresh={refresh}
        />
      ) : null}

      <section className="surface-panel p-4">
        <div className="flex items-center gap-2">
          <Clock className="size-4 text-muted-foreground" aria-hidden="true" />
          <SectionLabel>{t("w04.live.timeline")}</SectionLabel>
        </div>
        {events.length === 0 ? (
          <p className="mt-2 text-sm text-muted-foreground">{t("w04.live.noEvents")}</p>
        ) : (
          <ol className="mt-3 space-y-2">
            {events.map((event) => (
              <li key={event.id} className="flex flex-wrap items-baseline gap-2 text-sm">
                <span className="font-mono text-xs tabular-nums text-muted-foreground">
                  {formatDateTime(event.occurred_at, {
                    locale,
                    timeZone: operation.timezone,
                  })}
                </span>
                <span>{eventLabel(event.event_type, t)}</span>
              </li>
            ))}
          </ol>
        )}
      </section>
    </section>
  );
}

function StartNext({ step, onRefresh }: { step: JourneyStepRow; onRefresh: () => void }) {
  const { t, locale } = useI18n();
  const start = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.rpc("start_journey_step", { _journey_step_id: step.id });
      if (error) throw error;
    },
    onSuccess: () => {
      feedback.success(t("w04.live.recorded"));
      onRefresh();
    },
    onError: (error) => feedback.error(humanizeError(error, locale)),
  });

  return (
    <Button
      className="mt-4 min-h-12 w-full sm:w-auto"
      disabled={start.isPending}
      onClick={() => start.mutate()}
    >
      {t("w04.action.startStep")} — {step.title}
    </Button>
  );
}
