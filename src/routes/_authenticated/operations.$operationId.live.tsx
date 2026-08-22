import * as React from "react";
import { createFileRoute, Link, useParams } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  MoreHorizontal,
  Radio,
  Search,
  Users,
} from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { errorText, humanizeError } from "@/lib/auth";
import { MobilityLiveCard } from "@/components/mobility/mobility-live-card";
import { HospitalityLiveCard } from "@/components/hospitality/hospitality-live-card";
import { EventLiveCard } from "@/components/events/event-live-card";
import { CommunicationLiveCard } from "@/components/communication/communication-live-card";

import { useI18n } from "@/lib/i18n";
import { formatDateTime } from "@/lib/format";
import {
  SATISFYING_FACTS,
  eventLabel,
  matchesPersonSearch,
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
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { EmptyState } from "@/components/feedback/empty-state";
import { PanelSkeleton } from "@/components/feedback/loading";
import { feedback } from "@/components/feedback/feedback";
import { LiveTimingStrip } from "@/components/journey/live-timing-strip";
import { OperationCockpit } from "@/components/journey/operation-cockpit";
import { summarizeStepPresence, type CockpitAction } from "@/lib/live-cockpit";

import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

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
  boardingStarted,
  arrived,
  onRefresh,
}: {
  step: JourneyStepRow;
  roster: RosterRow[];
  presence: PresenceEventRow[];
  /** DEF-PILOT-008: BOARDED is only accepted after BOARDING_STARTED exists on this step. */
  boardingStarted: boolean;
  /** DEF-PILOT-025: DISEMBARKED is only accepted after ARRIVED exists on this step. */
  arrived: boolean;
  onRefresh: () => void;
}) {
  const { t, locale } = useI18n();
  // DEF-PILOT-019: ABSENCE_NOTED and NO_SHOW_CONFIRMED both require a reason server-side,
  // so both go through the same confirm dialog. Nothing is written until confirmation.
  const [reasonPrompt, setReasonPrompt] = React.useState<{
    row: RosterRow;
    fact: Extract<PresenceFact, "ABSENCE_NOTED" | "NO_SHOW_CONFIRMED">;
  } | null>(null);
  const [reason, setReason] = React.useState("");
  /**
   * DEF-PILOT-019 — presence correction (append-only retraction).
   * The UI never deletes an event: it calls public.retract_presence_fact, which
   * appends a PRESENCE_RETRACTED marker. Authorization stays with the backend
   * (owner/admin); no parallel permission rule is implemented in the frontend,
   * because tenant role is not reliably available in this route's context.
   */
  const [correctPrompt, setCorrectPrompt] = React.useState<{
    row: RosterRow;
    event: PresenceEventRow;
    idempotencyKey: string;
  } | null>(null);
  const [correctReason, setCorrectReason] = React.useState("");
  const [query, setQuery] = React.useState("");
  const [filter, setFilter] = React.useState<"all" | "pending" | "done">("all");

  /** Ids of facts that already carry a retraction — they are no longer effective. */
  const retractedIds = React.useMemo(() => {
    const set = new Set<string>();
    for (const event of presence) {
      if (event.retracts_presence_event_id) set.add(event.retracts_presence_event_id);
    }
    return set;
  }, [presence]);

  /** Effective (non-retracted, non-marker) presence event for a participation on this step. */
  const effectiveFor = (participationId: string): PresenceEventRow | null => {
    const rows = presence
      .filter(
        (event) =>
          event.participation_id === participationId &&
          event.journey_step_id === step.id &&
          event.presence_fact !== "PRESENCE_RETRACTED" &&
          !retractedIds.has(event.id),
      )
      .sort((a, b) => (a.occurred_at < b.occurred_at ? 1 : -1));
    return rows[0] ?? null;
  };

  const record = useMutation({
    mutationFn: async (input: { participationId: string; fact: PresenceFact; reason?: string }) => {
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
      setReasonPrompt(null);
      setReason("");
      onRefresh();
    },
    onError: (error) => feedback.error(humanizeError(error, locale)),
  });

  /** Maps known backend messages to safe, humanized copy (no SQL, no ids, no stack). */
  const correctionError = (error: unknown): string => {
    const raw = errorText(error);
    if (/already been retracted/i.test(raw)) return t("w04.presence.correctErrorAlready");
    if (/Presence record not found/i.test(raw)) return t("w04.presence.correctErrorNotFound");
    if (/reason is required/i.test(raw)) return t("w04.presence.correctErrorReason");
    if (/permission|not allowed|retraction cannot/i.test(raw))
      return t("w04.presence.correctErrorPermission");
    return humanizeError(error, locale);
  };

  const retract = useMutation({
    mutationFn: async (input: { presenceEventId: string; reason: string; key: string }) => {
      const { error } = await supabase.rpc("retract_presence_fact", {
        _presence_fact_id: input.presenceEventId,
        _reason: input.reason,
        _idempotency_key: input.key,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      feedback.success(t("w04.presence.corrected"));
      setCorrectPrompt(null);
      setCorrectReason("");
      onRefresh();
    },
    onError: (error) => feedback.error(correctionError(error)),
  });

  const satisfying = SATISFYING_FACTS[step.presence_requirement];
  // DEF-PILOT-025: on a disembarkation step the operational fact is DISEMBARKED,
  // which the server accepts only after ARRIVED exists on the same step.
  const primaryFact: PresenceFact =
    step.step_kind === "disembarkation"
      ? "DISEMBARKED"
      : step.presence_requirement === "boarded"
        ? "BOARDED"
        : "PRESENT_AT_MEETING_POINT";
  // BOARDED is rejected by the server until boarding is open on this step.
  const primaryBlocked =
    (primaryFact === "BOARDED" && !boardingStarted) || (primaryFact === "DISEMBARKED" && !arrived);

  /**
   * ROSTER / READINESS CONTRACT (mirrors the deployed public.w04_step_readiness).
   * Population = active roster members of the step's population
   * (`participants` -> participation_kind = 'participant', otherwise everyone).
   * Cancelled people are excluded and never reach this panel.
   * Readiness itself is decided by the server only; the panel never overrides it.
   */
  const relevant = roster.filter((row) =>
    step.presence_population === "participants" ? row.participation_kind === "participant" : true,
  );
  const visible = relevant.filter((row) => {
    const fact = effectiveFor(row.id)?.presence_fact as PresenceFact | undefined;
    const done = row.status === "confirmed" && Boolean(fact && satisfying.includes(fact));
    const matchesFilter = filter === "all" || (filter === "done" ? done : !done);
    const matchesQuery = matchesPersonSearch(row.people?.full_name, query);
    return matchesFilter && matchesQuery;
  });
  const unconfirmed = relevant.filter((row) => row.status !== "confirmed");
  const satisfiedCount = relevant.filter((row) => {
    if (row.status !== "confirmed") return false;
    const fact = effectiveFor(row.id)?.presence_fact as PresenceFact | undefined;
    return fact ? satisfying.includes(fact) : false;
  }).length;
  const evaluatedCount = relevant.filter((row) => row.status === "confirmed").length;

  return (
    <section className="surface-panel p-4">
      <div className="flex items-center gap-2">
        <Users className="size-4 text-muted-foreground" aria-hidden="true" />
        <SectionLabel>{t("w04.live.people")}</SectionLabel>
        <span className="ml-auto rounded-full bg-muted px-2.5 py-1 font-mono text-[11px] tabular-nums text-muted-foreground">
          {satisfiedCount}/{evaluatedCount} {t("w04.count.present")}
        </span>
      </div>
      <p className="mt-1 text-xs text-muted-foreground">{t("w04.presence.rosterNote")}</p>
      {primaryBlocked ? (
        <p className="mt-2 text-xs text-warning">{t("w04.presence.boardingNotOpen")}</p>
      ) : null}
      {unconfirmed.length > 0 ? (
        <div className="mt-2 flex flex-wrap items-center gap-2 rounded-lg bg-warning-soft px-3 py-2 text-xs text-warning">
          <AlertTriangle className="size-4 shrink-0" aria-hidden="true" />
          <span>
            {unconfirmed.length} {t("w04.presence.unconfirmedWarning")}
          </span>
          <Button asChild size="sm" variant="ghost" className="ml-auto min-h-9">
            <Link from="/operations/$operationId" to="/operations/$operationId/people">
              {t("w04.presence.goToRoster")}
            </Link>
          </Button>
        </div>
      ) : null}

      <div className="mt-3 space-y-2">
        <div className="relative">
          <Search
            className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden="true"
          />
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={t("w04.presence.search")}
            aria-label={t("w04.presence.search")}
            className="min-h-11 pl-9"
          />
        </div>
        <div className="grid grid-cols-3 gap-1 rounded-lg bg-muted p-1" role="group">
          {(["all", "pending", "done"] as const).map((value) => (
            <Button
              key={value}
              type="button"
              size="sm"
              variant={filter === value ? "secondary" : "ghost"}
              className="min-h-9 px-2"
              aria-pressed={filter === value}
              onClick={() => setFilter(value)}
            >
              {t(`w04.presence.filter.${value}`)}
            </Button>
          ))}
        </div>
      </div>

      <ul className="mt-3 space-y-2 sm:divide-y sm:divide-border/60 sm:space-y-0">
        {visible.map((row) => {
          const effective = effectiveFor(row.id);
          const fact = (effective?.presence_fact as PresenceFact | undefined) ?? null;
          const ok = fact ? satisfying.includes(fact) : false;
          return (
            <li
              key={row.id}
              className="rounded-xl border border-border/70 bg-background/60 p-3 sm:flex sm:flex-wrap sm:items-center sm:gap-2 sm:rounded-none sm:border-0 sm:bg-transparent sm:px-0 sm:py-2.5"
            >
              <div className="flex min-w-0 items-start justify-between gap-3 sm:flex-1 sm:items-center">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{row.people?.full_name}</p>
                  {row.status !== "confirmed" ? (
                    <span className="mt-1 inline-flex rounded bg-warning-soft px-1.5 py-0.5 text-[11px] text-warning">
                      {t(`w04.presence.status.${row.status}`)} · {t("w04.presence.notCounted")}
                    </span>
                  ) : null}
                </div>
                <span
                  className={`shrink-0 font-mono text-[10px] uppercase tracking-[0.12em] ${
                    ok ? "text-success" : "text-muted-foreground"
                  }`}
                >
                  {fact ? presenceLabel(fact, t) : t("w04.presence.pending")}
                </span>
              </div>
              <div className="mt-3 flex items-center gap-2 sm:mt-0 sm:w-auto">
                <Button
                  size="sm"
                  className="min-h-12 flex-1 text-sm sm:min-h-10 sm:flex-none"
                  disabled={record.isPending || primaryBlocked}
                  title={primaryBlocked ? t("w04.presence.boardingNotOpen") : undefined}
                  onClick={() => record.mutate({ participationId: row.id, fact: primaryFact })}
                >
                  {presenceLabel(primaryFact, t)}
                </Button>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      size="sm"
                      variant="outline"
                      className="min-h-12 shrink-0 px-3 sm:min-h-10"
                      aria-label={t("w04.presence.more")}
                    >
                      <MoreHorizontal className="size-4" aria-hidden="true" />
                      <span className="ml-1 sm:sr-only">{t("w04.presence.more")}</span>
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-60">
                    <DropdownMenuItem
                      disabled={record.isPending}
                      onSelect={() => {
                        setReason("");
                        setReasonPrompt({ row, fact: "ABSENCE_NOTED" });
                      }}
                    >
                      {presenceLabel("ABSENCE_NOTED", t)}
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onSelect={() => {
                        setReason("");
                        setReasonPrompt({ row, fact: "NO_SHOW_CONFIRMED" });
                      }}
                    >
                      {presenceLabel("NO_SHOW_CONFIRMED", t)}
                    </DropdownMenuItem>
                    {effective ? (
                      <>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                          disabled={retract.isPending}
                          onSelect={() => {
                            setCorrectReason("");
                            setCorrectPrompt({
                              row,
                              event: effective,
                              idempotencyKey: crypto.randomUUID(),
                            });
                          }}
                        >
                          {t("w04.presence.correct")}
                        </DropdownMenuItem>
                      </>
                    ) : null}
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </li>
          );
        })}
      </ul>
      {visible.length === 0 ? (
        <p className="py-6 text-center text-sm text-muted-foreground">
          {t("w04.presence.noResults")}
        </p>
      ) : null}

      <Dialog
        open={Boolean(reasonPrompt)}
        onOpenChange={(open) => {
          if (!open) {
            setReasonPrompt(null);
            setReason("");
          }
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{reasonPrompt ? presenceLabel(reasonPrompt.fact, t) : ""}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <p className="text-sm font-medium">{reasonPrompt?.row.people?.full_name}</p>
            <p className="text-sm text-muted-foreground">
              {reasonPrompt?.fact === "NO_SHOW_CONFIRMED"
                ? t("w04.presence.noShowOwnerOnly")
                : t("w04.presence.absenceReasonRequired")}
            </p>
            <div className="space-y-1.5">
              <Label htmlFor="presence-reason">
                {reasonPrompt?.fact === "NO_SHOW_CONFIRMED"
                  ? t("w04.presence.noShowReason")
                  : t("w04.presence.absenceReason")}
              </Label>
              <Textarea
                id="presence-reason"
                rows={2}
                value={reason}
                onChange={(event) => setReason(event.target.value)}
              />
            </div>
            <Button
              className="min-h-11 w-full"
              disabled={!reason.trim() || record.isPending}
              onClick={() =>
                reasonPrompt &&
                record.mutate({
                  participationId: reasonPrompt.row.id,
                  fact: reasonPrompt.fact,
                  reason: reason.trim(),
                })
              }
            >
              {t("w04.presence.mark")}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* DEF-PILOT-019 — correction dialog. Retraction only; the corrected fact
          is recorded afterwards by the operator through the normal buttons. */}
      <Dialog
        open={Boolean(correctPrompt)}
        onOpenChange={(open) => {
          if (!open) {
            setCorrectPrompt(null);
            setCorrectReason("");
          }
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t("w04.presence.correctTitle")}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <p className="text-sm font-medium">{correctPrompt?.row.people?.full_name}</p>
            <p className="text-sm">
              <span className="text-muted-foreground">{t("w04.presence.correctCurrent")}: </span>
              {correctPrompt
                ? presenceLabel(correctPrompt.event.presence_fact as PresenceFact, t)
                : ""}
            </p>
            <p className="text-sm text-muted-foreground">{t("w04.presence.correctExplain")}</p>
            <div className="space-y-1.5">
              <Label htmlFor="presence-correct-reason">{t("w04.presence.correctReason")}</Label>
              <Textarea
                id="presence-correct-reason"
                rows={2}
                value={correctReason}
                onChange={(event) => setCorrectReason(event.target.value)}
              />
            </div>
            <Button
              className="min-h-11 w-full"
              disabled={!correctReason.trim() || retract.isPending}
              onClick={() =>
                correctPrompt &&
                retract.mutate({
                  presenceEventId: correctPrompt.event.id,
                  reason: correctReason.trim(),
                  key: correctPrompt.idempotencyKey,
                })
              }
            >
              {t("w04.presence.correctConfirm")}
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
    onError: (error) => feedback.error(journeyActionError(error, t, locale)),
  });

  if (items.length === 0) return null;

  return (
    <section className="surface-panel p-4">
      <SectionLabel>{t("w04.live.checklist")}</SectionLabel>
      <ul className="mt-3 divide-y divide-border/60">
        {items.map((item) => {
          const last = stateOf(item.id);
          const done = last?.execution_action === "completed";
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
                {done ? t("w04.playbook.reopen") : t("w04.playbook.completed")}
              </Button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* Runtime action errors                                               */
/* ------------------------------------------------------------------ */

/**
 * Maps the known W04 runtime validation messages to safe, actionable copy.
 * Display only: it never changes what the server decided, and it never leaks
 * SQL, identifiers, stack traces or raw internals — unknown failures fall back
 * to the shared `humanizeError`.
 */
function journeyActionError(error: unknown, t: (key: string) => string, locale: string): string {
  const raw = errorText(error);
  const rules: Array<[RegExp, string]> = [
    [
      /permission for this operation runtime|not have permission|owners and admins/i,
      "w04.error.permission",
    ],
    [/Authentication required/i, "w04.error.auth"],
    [/operation must be ready before the journey/i, "w04.error.operationNotReady"],
    [
      /only be authorized on a running operation|ready or running operation/i,
      "w04.error.operationNotRunning",
    ],
    [/Another step is still running/i, "w04.error.anotherStepRunning"],
    [/was skipped and cannot be started/i, "w04.error.stepSkipped"],
    [/step has not started yet/i, "w04.error.stepNotStarted"],
    [/step is already closed|already completed|cannot be changed/i, "w04.error.stepClosed"],
    [/step is not ready yet/i, "w04.error.notReady"],
    [/has not arrived for this step/i, "w04.error.arrivalRequired"],
    [/Boarding has not started/i, "w04.error.boardingNotStarted"],
    [/does not track boarding/i, "w04.error.noBoardingTracking"],
    [/Departure has not been authorized/i, "w04.error.departureNotAuthorized"],
    [/already been authorized|unchanged/i, "w04.error.departureAlreadyAuthorized"],
    [/group has not departed yet/i, "w04.error.notDeparted"],
    [/already started cannot be skipped/i, "w04.error.stepAlreadyStarted"],
    [/reason is required to skip/i, "w04.error.reasonRequired"],
    [/cannot be recorded in the future/i, "w04.error.future"],
    [/cannot be backdated/i, "w04.error.backdated"],
  ];
  const hit = rules.find(([pattern]) => pattern.test(raw));
  return hit ? t(hit[1]) : humanizeError(error, locale);
}

/* ------------------------------------------------------------------ */
/* Step actions                                                        */
/* ------------------------------------------------------------------ */

function StepActions({
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
      feedback.error(journeyActionError(error, t, locale));
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
      const [
        operation,
        steps,
        events,
        resolutionEvents,
        boardingEvents,
        presence,
        items,
        executions,
        roster,
        state,
      ] = await Promise.all([
        supabase.from("operations").select("*").eq("id", operationId).maybeSingle(),
        supabase
          .from("journey_steps")
          .select("*")
          .eq("operation_id", operationId)
          .order("sequence"),
        supabase
          .from("journey_events")
          .select("*")
          .eq("operation_id", operationId)
          .order("occurred_at", { ascending: false })
          .limit(40),
        /**
         * DEF-PILOT-014: operational state must NOT be derived from the limited
         * visual feed above. These narrow, unbounded projections carry the facts
         * needed for terminal-state and boarding derivation.
         */
        supabase
          .from("journey_events")
          .select("journey_step_id, event_type")
          .eq("operation_id", operationId)
          .in("event_type", ["STEP_COMPLETED", "STEP_SKIPPED"]),
        supabase
          .from("journey_events")
          .select("journey_step_id, event_type")
          .eq("operation_id", operationId)
          .in("event_type", ["BOARDING_STARTED", "ARRIVED"]),
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
      if (resolutionEvents.error) throw resolutionEvents.error;
      if (boardingEvents.error) throw boardingEvents.error;
      return {
        operation: operation.data,
        steps: steps.data ?? [],
        events: (events.data ?? []) as JourneyEventRow[],
        resolvedStepIds: new Set(
          (resolutionEvents.data ?? [])
            .map((row) => row.journey_step_id)
            .filter((id): id is string => Boolean(id)),
        ),
        boardingStartedStepIds: new Set(
          (boardingEvents.data ?? [])
            .filter((row) => row.event_type === "BOARDING_STARTED")
            .map((row) => row.journey_step_id)
            .filter((id): id is string => Boolean(id)),
        ),
        // DEF-PILOT-025: ARRIVED is a precondition for DISEMBARKED and for
        // complete_disembarkation; the UI must mirror that backend invariant.
        arrivedStepIds: new Set(
          (boardingEvents.data ?? [])
            .filter((row) => row.event_type === "ARRIVED")
            .map((row) => row.journey_step_id)
            .filter((id): id is string => Boolean(id)),
        ),
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

  /**
   * V1.1 Cockpit CTA — calls the SAME W04 commands used by StepActions/StartNext.
   * No new backend rule: the server keeps every guard and may still refuse.
   */
  const cockpitCall = useMutation({
    mutationFn: async (input: { fn: string; stepId: string }) => {
      const { error } = await supabase.rpc(input.fn as "start_journey_step", {
        _journey_step_id: input.stepId,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      feedback.success(t("w04.live.recorded"));
      refresh();
    },
    onError: (error) => feedback.error(journeyActionError(error, t, locale)),
  });

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
      <EmptyState
        icon={Radio}
        title={t("w04.live.noSteps")}
        body={t("w04.live.noStepsBody")}
        action={
          <Button asChild className="min-h-11">
            <Link from="/operations/$operationId" to="/operations/$operationId/journey">
              {t("w04.journey.title")}
            </Link>
          </Button>
        }
      />
    );
  }

  const state = live.data?.state ?? null;
  const readiness: Readiness | null = state?.readiness ?? null;
  const current = steps.find((step) => step.id === state?.current_step_id) ?? null;
  const next = steps.find((step) => step.id === state?.next_step_id) ?? null;
  const events = live.data?.events ?? [];
  // DEF-PILOT-014: derived from unbounded projections, never from the feed above.
  const resolvedStepIds = live.data?.resolvedStepIds ?? new Set<string>();
  const boardingStartedStepIds = live.data?.boardingStartedStepIds ?? new Set<string>();
  const arrivedStepIds = live.data?.arrivedStepIds ?? new Set<string>();
  const journeyResolved = steps.length > 0 && steps.every((step) => resolvedStepIds.has(step.id));
  /**
   * Roster people relevant to this step whose participation is still `expected`.
   * Surfaced so the operator can act on them; cancelled people are excluded upstream.
   */
  const unconfirmedForCurrent = current
    ? (live.data?.roster ?? []).filter(
        (row) =>
          row.status !== "confirmed" &&
          (current.presence_population === "participants"
            ? row.participation_kind === "participant"
            : true),
      )
    : [];

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

      <OperationCockpit
        operationStatus={operation.status}
        current={current}
        next={next}
        readiness={readiness}
        arrived={current ? arrivedStepIds.has(current.id) : false}
        boardingStarted={current ? boardingStartedStepIds.has(current.id) : false}
        journeyResolved={journeyResolved}
        summary={
          current && current.presence_requirement !== "none"
            ? summarizeStepPresence({
                step: current,
                roster: live.data?.roster ?? [],
                presence: live.data?.presence ?? [],
              })
            : null
        }
        pending={cockpitCall.isPending}
        onAction={(action: CockpitAction) => {
          if (action.anchor) {
            document
              .getElementById(action.anchor)
              ?.scrollIntoView({ behavior: "smooth", block: "start" });
            return;
          }
          const stepId = current?.id ?? next?.id ?? null;
          if (action.rpc && stepId) cockpitCall.mutate({ fn: action.rpc, stepId });
        }}
      />

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

            <LiveTimingStrip current={current} next={next} />

            {readiness ? (
              <div
                className={`mt-3 flex flex-wrap items-center gap-2 rounded-lg px-3 py-2 text-sm ${
                  readiness.ready ? "bg-success-soft text-success" : "bg-warning-soft text-warning"
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

            {/* Expected (not yet confirmed) roster people relevant to this step. */}
            {readiness && readiness.requirement !== "none" && unconfirmedForCurrent.length > 0 ? (
              <p className="mt-2 text-sm text-warning">
                {unconfirmedForCurrent.length} {t("w04.presence.unconfirmedWarning")}{" "}
                {unconfirmedForCurrent.map((row) => row.people?.full_name).join(", ")}
              </p>
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
              {/* DISPLAY ONLY: the server gate is never overridden here — the operator
                  just sees why a gated action would be refused, before trying it. */}
              {readiness && !readiness.ready ? (
                <p className="mt-2 flex flex-wrap items-center gap-2 rounded-lg bg-warning-soft px-3 py-2 text-xs text-warning">
                  <AlertTriangle className="size-4 shrink-0" aria-hidden="true" />
                  <span>
                    {t("w04.live.blockedSummary")}{" "}
                    <span className="tabular-nums">
                      {readiness.missing_participations.length} {t("w04.live.blockedPeopleCount")}
                    </span>
                    {" · "}
                    <span className="tabular-nums">
                      {readiness.missing_required_items.length} {t("w04.live.blockedItemsCount")}
                    </span>
                  </span>
                </p>
              ) : null}
              <div className="mt-2">
                <StepActions
                  step={current}
                  ready={readiness?.ready ?? true}
                  arrived={arrivedStepIds.has(current.id)}
                  onRefresh={refresh}
                />
              </div>
            </div>
          </>
        ) : (
          <>
            {next ? (
              <>
                <p className="mt-1 text-sm text-muted-foreground">{t("w04.live.noCurrentBody")}</p>
                <StartNext step={next} onRefresh={refresh} />
              </>
            ) : journeyResolved ? (
              <div className="mt-2 space-y-3">
                <h3 className="text-lg font-semibold">{t("w04.live.journeyCompleted")}</h3>
                <p className="text-sm text-muted-foreground">
                  {t("w04.live.journeyCompletedBody")}
                </p>
                <Button asChild className="min-h-11" variant="default">
                  <Link to="/operations/$operationId" params={{ operationId }}>
                    {t("w04.live.goToOverview")}
                  </Link>
                </Button>
              </div>
            ) : (
              <p className="mt-1 text-sm text-muted-foreground">{t("w04.live.noCurrentBody")}</p>
            )}
          </>
        )}
      </article>

      {next ? (
        <article className="surface-panel p-4">
          <SectionLabel>{t("w04.live.next")}</SectionLabel>
          <h3 className="mt-1 text-base font-semibold">{next.title}</h3>
          {(next.expected_start ?? next.planned_start) ? (
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
        <div id="cockpit-people">
          <PresencePanel
            step={current}
            roster={live.data?.roster ?? []}
            presence={live.data?.presence ?? []}
            boardingStarted={boardingStartedStepIds.has(current.id)}
            arrived={arrivedStepIds.has(current.id)}
            onRefresh={refresh}
          />
        </div>
      ) : null}

      {current ? (
        <div id="cockpit-checklist">
          <ChecklistPanel
            items={(live.data?.items ?? []).filter((item) => item.journey_step_id === current.id)}
            executions={live.data?.executions ?? []}
            onRefresh={refresh}
          />
        </div>
      ) : null}

      <MobilityLiveCard operationId={operation.id} />

      <HospitalityLiveCard operationId={operation.id} />

      <EventLiveCard operationId={operation.id} />

      <CommunicationLiveCard operationId={operation.id} />

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
    onError: (error) => feedback.error(journeyActionError(error, t, locale)),
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
