import * as React from "react";
import { createFileRoute, useParams } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowDown, ArrowUp, Clapperboard, Plus } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { humanizeError } from "@/lib/auth";
import { useI18n } from "@/lib/i18n";
import { formatDateTime } from "@/lib/format";
import { isOperationClosed, operationEmptyBody, ReadOnlyNotice } from "@/lib/operation-lock";
import { useTenant } from "@/lib/tenant";
import { fromLocalInput, toLocalInput } from "@/lib/w02";
import {
  EVENT_STATUS_TONE,
  OBSERVED_SESSION_ACTIONS,
  RUNTIME_STATE_TONE,
  SESSION_ACTIONS,
  SESSION_KINDS,
  STAFF_FUNCTIONS,
  isTerminalEvent,
  newIdempotencyKey,
  primaryAction,
  rpcArgs,
  sessionDelayMinutes,
  sessionResolution,
  type EventProgram,
  type EventRow,
  type EventRuntimeSnapshot,
  type EventSessionKind,
  type EventSourceKind,
  type EventStaffFunction,
  type ProgramSession,
  type RuntimeFeed,
  type VenueRow,
  type VenueSpaceRow,
} from "@/lib/w07";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { EmptyState } from "@/components/feedback/empty-state";
import { PanelSkeleton } from "@/components/feedback/loading";
import { feedback } from "@/components/feedback/feedback";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

/**
 * COBS OS · W07 — event production workspace.
 * LIFECYCLE != RUNTIME. Lifecycle buttons govern planning; runtime state is
 * derived from facts and is never set directly. External events expose only
 * observation commands — we never claim to have run someone else's show.
 */
export const Route = createFileRoute("/_authenticated/operations/$operationId/events")({
  head: () => ({
    meta: [
      { title: "Event production — program and live show control in COBS OS" },
      {
        name: "description",
        content:
          "Program, spaces, stage and crew for this operation, with execution recorded as facts rather than manual status.",
      },
      { property: "og:title", content: "Event production — COBS OS" },
      {
        property: "og:description",
        content: "Program, sessions, stage and crew, with planned, expected and actual separated.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: EventsTab,
});

const SELECT_CLASS =
  "min-h-11 w-full rounded-lg border border-border bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring";

function useEventQueries(eventId: string | null) {
  const program = useQuery({
    queryKey: ["event-program", eventId],
    enabled: Boolean(eventId),
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_event_program", { _event_id: eventId! });
      if (error) throw error;
      return data as unknown as EventProgram;
    },
  });

  const runtime = useQuery({
    queryKey: ["event-runtime", eventId],
    enabled: Boolean(eventId),
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_event_runtime_state", {
        _event_id: eventId!,
      });
      if (error) throw error;
      return data as unknown as EventRuntimeSnapshot;
    },
  });

  const facts = useQuery({
    queryKey: ["event-facts", eventId],
    enabled: Boolean(eventId),
    queryFn: async () => {
      const { data, error } = await supabase.rpc("list_event_runtime_events", {
        _event_id: eventId!,
      });
      if (error) throw error;
      return data as unknown as RuntimeFeed;
    },
  });

  return { program, runtime, facts };
}

function CreateEventForm({
  operationId,
  venues,
  onDone,
}: {
  operationId: string;
  venues: VenueRow[];
  onDone: () => void;
}) {
  const { t, locale } = useI18n();
  const [name, setName] = React.useState("");
  const [sourceKind, setSourceKind] = React.useState<EventSourceKind>("internal");
  const [venueId, setVenueId] = React.useState("");
  const [producer, setProducer] = React.useState("");
  const [start, setStart] = React.useState("");
  const [end, setEnd] = React.useState("");

  const create = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.rpc(
        "create_event",
        rpcArgs({
          _operation_id: operationId,
          _name: name,
          _source_kind: sourceKind,
          _planned_start: fromLocalInput(start),
          _planned_end: fromLocalInput(end),
          _idempotency_key: newIdempotencyKey(),
          _venue_id: venueId || undefined,
          _external_producer_name:
            sourceKind === "external" && producer.trim() ? producer.trim() : undefined,
        }),
      );
      if (error) throw error;
    },
    onSuccess: () => {
      feedback.success(t("w07.created"));
      onDone();
    },
    onError: (error) => feedback.error(humanizeError(error, locale)),
  });

  return (
    <form
      className="mt-4 grid gap-3 sm:grid-cols-2"
      onSubmit={(e) => {
        e.preventDefault();
        create.mutate();
      }}
    >
      <div className="space-y-1.5 sm:col-span-2">
        <Label htmlFor="ev-name">{t("w07.name")}</Label>
        <Input id="ev-name" required value={name} onChange={(e) => setName(e.target.value)} />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="ev-source">{t("w07.source")}</Label>
        <select
          id="ev-source"
          className={SELECT_CLASS}
          value={sourceKind}
          onChange={(e) => setSourceKind(e.target.value as EventSourceKind)}
        >
          <option value="internal">{t("w07.source.internal")}</option>
          <option value="external">{t("w07.source.external")}</option>
        </select>
        <p className="text-xs text-muted-foreground">{t("w07.sourceHint")}</p>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="ev-venue">{t("w07.venue")}</Label>
        <select
          id="ev-venue"
          className={SELECT_CLASS}
          value={venueId}
          onChange={(e) => setVenueId(e.target.value)}
        >
          <option value="">{t("w07.venueNone")}</option>
          {venues.map((venue) => (
            <option key={venue.id} value={venue.id}>
              {venue.name}
            </option>
          ))}
        </select>
      </div>
      {sourceKind === "external" ? (
        <div className="space-y-1.5 sm:col-span-2">
          <Label htmlFor="ev-producer">{t("w07.producer")}</Label>
          <Input id="ev-producer" value={producer} onChange={(e) => setProducer(e.target.value)} />
        </div>
      ) : null}
      <div className="space-y-1.5">
        <Label htmlFor="ev-start">
          {t("w07.planned")} · {t("w07.start")}
        </Label>
        <Input
          id="ev-start"
          type="datetime-local"
          required
          value={start}
          onChange={(e) => setStart(e.target.value)}
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="ev-end">
          {t("w07.planned")} · {t("w07.end")}
        </Label>
        <Input
          id="ev-end"
          type="datetime-local"
          required
          value={end}
          onChange={(e) => setEnd(e.target.value)}
        />
      </div>
      <div className="sm:col-span-2">
        <Button type="submit" className="min-h-11" disabled={create.isPending || !name.trim()}>
          {create.isPending ? t("common.saving") : t("w07.create")}
        </Button>
      </div>
    </form>
  );
}

function LifecyclePanel({ event, onChanged }: { event: EventRow; onChanged: () => void }) {
  const { t, locale } = useI18n();
  const { canManage, role } = useTenant();
  const canOperate = canManage || role === "operations_agent";
  const [reopenReason, setReopenReason] = React.useState("");

  const run = useMutation({
    mutationFn: async (command: "submit" | "lock" | "reopen" | "ready") => {
      const key = newIdempotencyKey();
      if (command === "submit") {
        const { error } = await supabase.rpc("submit_event_planning", {
          _event_id: event.id,
          _idempotency_key: key,
        });
        if (error) throw error;
        return;
      }
      if (command === "lock") {
        const { error } = await supabase.rpc("lock_event_program", {
          _event_id: event.id,
          _idempotency_key: key,
        });
        if (error) throw error;
        return;
      }
      if (command === "ready") {
        const { error } = await supabase.rpc("mark_event_ready", {
          _event_id: event.id,
          _idempotency_key: key,
        });
        if (error) throw error;
        return;
      }
      const { error } = await supabase.rpc("reopen_event_program", {
        _event_id: event.id,
        _idempotency_key: key,
        _reason: reopenReason.trim(),
      });
      if (error) throw error;
    },
    onSuccess: () => {
      feedback.success(t("w07.lifecycle.done"));
      setReopenReason("");
      onChanged();
    },
    onError: (error) => feedback.error(humanizeError(error, locale)),
  });

  if (!canOperate || isTerminalEvent(event.status)) return null;

  return (
    <section className="surface-panel space-y-3 p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-base font-semibold">{t("w07.lifecycle")}</h3>
        <span className={`rounded px-1.5 py-0.5 text-[11px] ${EVENT_STATUS_TONE[event.status]}`}>
          {t(`w07.status.${event.status}`)}
        </span>
      </div>

      <div className="flex flex-wrap gap-2">
        {event.status === "draft" ? (
          <Button
            className="min-h-11"
            disabled={run.isPending}
            onClick={() => run.mutate("submit")}
          >
            {t("w07.lifecycle.submit")}
          </Button>
        ) : null}
        {event.status === "planning" ? (
          <Button className="min-h-11" disabled={run.isPending} onClick={() => run.mutate("lock")}>
            {t("w07.lifecycle.lock")}
          </Button>
        ) : null}
        {event.status === "program_locked" ? (
          <Button className="min-h-11" disabled={run.isPending} onClick={() => run.mutate("ready")}>
            {t("w07.lifecycle.ready")}
          </Button>
        ) : null}
      </div>

      {event.status === "program_locked" || event.status === "ready" ? (
        <>
          <p className="text-xs text-muted-foreground">{t("w07.lifecycle.lockedNote")}</p>
          <div className="grid gap-2 sm:grid-cols-[1fr_auto] sm:items-end">
            <div className="space-y-1.5">
              <Label htmlFor="ev-reopen">{t("w07.lifecycle.reason")}</Label>
              <Input
                id="ev-reopen"
                value={reopenReason}
                onChange={(e) => setReopenReason(e.target.value)}
              />
            </div>
            <Button
              variant="outline"
              className="min-h-11"
              disabled={run.isPending || reopenReason.trim().length < 3}
              onClick={() => run.mutate("reopen")}
            >
              {t("w07.lifecycle.reopen")}
            </Button>
          </div>
        </>
      ) : null}
    </section>
  );
}

function SessionForm({
  eventId,
  adHoc,
  spaces,
  onDone,
}: {
  eventId: string;
  adHoc: boolean;
  spaces: VenueSpaceRow[];
  onDone: () => void;
}) {
  const { t, locale } = useI18n();
  const [title, setTitle] = React.useState("");
  const [kind, setKind] = React.useState<EventSessionKind>(adHoc ? "other" : "talk");
  const [spaceId, setSpaceId] = React.useState("");
  const [start, setStart] = React.useState("");
  const [end, setEnd] = React.useState("");
  const [reason, setReason] = React.useState("");

  const create = useMutation({
    mutationFn: async () => {
      if (adHoc) {
        const { error } = await supabase.rpc(
          "create_ad_hoc_session",
          rpcArgs({
            _event_id: eventId,
            _title: title,
            _ad_hoc_reason: reason.trim(),
            _idempotency_key: newIdempotencyKey(),
            _session_kind: kind,
            _venue_space_id: spaceId || undefined,
            _planned_start: start ? fromLocalInput(start) : undefined,
            _planned_end: end ? fromLocalInput(end) : undefined,
          }),
        );
        if (error) throw error;
        return;
      }
      const { error } = await supabase.rpc(
        "create_event_session",
        rpcArgs({
          _event_id: eventId,
          _title: title,
          _idempotency_key: newIdempotencyKey(),
          _session_kind: kind,
          _venue_space_id: spaceId || undefined,
          _planned_start: start ? fromLocalInput(start) : undefined,
          _planned_end: end ? fromLocalInput(end) : undefined,
        }),
      );
      if (error) throw error;
    },
    onSuccess: () => {
      feedback.success(t("w07.session.saved"));
      onDone();
    },
    onError: (error) => feedback.error(humanizeError(error, locale)),
  });

  return (
    <form
      className="mt-4 grid gap-3 sm:grid-cols-2"
      onSubmit={(e) => {
        e.preventDefault();
        if (adHoc && reason.trim().length < 3) {
          feedback.warning(t("w07.reasonRequired"));
          return;
        }
        create.mutate();
      }}
    >
      <div className="space-y-1.5 sm:col-span-2">
        <Label htmlFor="ss-title">{t("w07.session.title")}</Label>
        <Input id="ss-title" required value={title} onChange={(e) => setTitle(e.target.value)} />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="ss-kind">{t("w07.session.kind")}</Label>
        <select
          id="ss-kind"
          className={SELECT_CLASS}
          value={kind}
          onChange={(e) => setKind(e.target.value as EventSessionKind)}
        >
          {SESSION_KINDS.map((value) => (
            <option key={value} value={value}>
              {t(`w07.kind.${value}`)}
            </option>
          ))}
        </select>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="ss-space">{t("w07.space")}</Label>
        <select
          id="ss-space"
          className={SELECT_CLASS}
          value={spaceId}
          onChange={(e) => setSpaceId(e.target.value)}
        >
          <option value="">{t("w07.spaceNone")}</option>
          {spaces.map((space) => (
            <option key={space.id} value={space.id}>
              {space.name}
            </option>
          ))}
        </select>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="ss-start">
          {t("w07.planned")} · {t("w07.start")}
        </Label>
        <Input
          id="ss-start"
          type="datetime-local"
          value={start}
          onChange={(e) => setStart(e.target.value)}
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="ss-end">
          {t("w07.planned")} · {t("w07.end")}
        </Label>
        <Input
          id="ss-end"
          type="datetime-local"
          value={end}
          onChange={(e) => setEnd(e.target.value)}
        />
      </div>
      {adHoc ? (
        <div className="space-y-1.5 sm:col-span-2">
          <Label htmlFor="ss-reason">{t("w07.program.adhocReason")}</Label>
          <Input
            id="ss-reason"
            required
            value={reason}
            onChange={(e) => setReason(e.target.value)}
          />
        </div>
      ) : null}
      <div className="sm:col-span-2">
        <Button type="submit" className="min-h-11" disabled={create.isPending || !title.trim()}>
          {create.isPending ? t("common.saving") : t("common.save")}
        </Button>
      </div>
    </form>
  );
}

function SessionCard({
  session,
  event,
  spaces,
  canOperate,
  onChanged,
}: {
  session: ProgramSession;
  event: EventRow;
  spaces: VenueSpaceRow[];
  canOperate: boolean;
  onChanged: () => void;
}) {
  const { t, locale, timeZone } = useI18n();
  const tz = event.timezone || timeZone;
  const [reason, setReason] = React.useState("");
  const [observedAt, setObservedAt] = React.useState(toLocalInput(new Date().toISOString()));
  const [observerNote, setObserverNote] = React.useState("");
  const external = event.source_kind === "external";
  const actions = external
    ? OBSERVED_SESSION_ACTIONS[session.runtime_state]
    : SESSION_ACTIONS[session.runtime_state];
  const delay = sessionDelayMinutes(session);

  const act = useMutation({
    mutationFn: async (action: string) => {
      const key = newIdempotencyKey();
      if (external) {
        const args = {
          _session_id: session.session_id,
          _observed_at: fromLocalInput(observedAt),
          _observer_note: observerNote.trim(),
          _idempotency_key: key,
        };
        const { error } = await supabase.rpc(
          action === "start"
            ? "record_observed_session_started"
            : "record_observed_session_completed",
          args,
        );
        if (error) throw error;
        return;
      }
      if (action === "cancel") {
        const { error } = await supabase.rpc("cancel_session", {
          _session_id: session.session_id,
          _reason: reason.trim(),
          _idempotency_key: key,
        });
        if (error) throw error;
        return;
      }
      const fn = (
        {
          start: "start_session",
          pause: "pause_session",
          resume: "resume_session",
          complete: "complete_session",
        } as const
      )[action as "start" | "pause" | "resume" | "complete"];
      const { error } = await supabase.rpc(fn, {
        _session_id: session.session_id,
        _idempotency_key: key,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      feedback.success(t("w07.run.done"));
      setReason("");
      setObserverNote("");
      onChanged();
    },
    onError: (error) => feedback.error(humanizeError(error, locale)),
  });

  const changeSpace = useMutation({
    mutationFn: async (spaceId: string) => {
      const { error } = await supabase.rpc("change_session_space", {
        _session_id: session.session_id,
        _venue_space_id: spaceId,
        _reason: reason.trim() || t("w07.session.changeSpace"),
        _idempotency_key: newIdempotencyKey(),
      });
      if (error) throw error;
    },
    onSuccess: () => {
      feedback.success(t("w07.run.done"));
      onChanged();
    },
    onError: (error) => feedback.error(humanizeError(error, locale)),
  });

  const spaceName = spaces.find((s) => s.id === session.venue_space_id)?.name ?? null;

  return (
    <li className="rounded-lg border border-border bg-elevated/50 p-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-mono text-[10px] tabular-nums text-muted-foreground">
          {String(session.sequence).padStart(2, "0")}
        </span>
        <span className="font-medium">{session.title}</span>
        <span className="text-xs text-muted-foreground">
          {t(`w07.kind.${session.session_kind}`)}
        </span>
        {session.is_ad_hoc ? (
          <span className="rounded bg-warning-soft px-1.5 py-0.5 text-[11px] text-warning">
            {t("w07.program.adhocBadge")}
          </span>
        ) : null}
        <span
          className={`ml-auto rounded px-1.5 py-0.5 text-[11px] ${RUNTIME_STATE_TONE[session.runtime_state]}`}
        >
          {t(`w07.runtime.${session.runtime_state}`)}
        </span>
      </div>

      <p className="mt-1 text-xs text-muted-foreground">
        {spaceName ? `${spaceName} · ` : ""}
        {session.planned_start
          ? formatDateTime(session.planned_start, { locale, timeZone: tz })
          : t("w07.pending")}
        {delay !== 0
          ? ` · ${Math.abs(delay)} ${delay > 0 ? t("w07.session.delay") : t("w07.session.ahead")}`
          : ""}
      </p>

      {canOperate && !isTerminalEvent(event.status) && actions.length > 0 ? (
        <div className="mt-3 space-y-2">
          {external ? (
            <div className="grid gap-2 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor={`obs-at-${session.session_id}`}>{t("w07.observe.at")}</Label>
                <Input
                  id={`obs-at-${session.session_id}`}
                  type="datetime-local"
                  value={observedAt}
                  onChange={(e) => setObservedAt(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor={`obs-note-${session.session_id}`}>{t("w07.observe.note")}</Label>
                <Input
                  id={`obs-note-${session.session_id}`}
                  value={observerNote}
                  onChange={(e) => setObserverNote(e.target.value)}
                />
              </div>
            </div>
          ) : null}

          <div className="flex flex-wrap gap-2">
            {actions.map((action) => (
              <Button
                key={action}
                size="sm"
                variant={action === "cancel" ? "outline" : "default"}
                className="min-h-9"
                disabled={
                  act.isPending ||
                  (external && observerNote.trim().length < 3) ||
                  (action === "cancel" && reason.trim().length < 3)
                }
                onClick={() => act.mutate(action)}
              >
                {external
                  ? action === "start"
                    ? t("w07.observe.sessionStarted")
                    : t("w07.observe.sessionCompleted")
                  : t(`w07.session.${action}`)}
              </Button>
            ))}
          </div>

          {!external && actions.includes("cancel") ? (
            <div className="space-y-1.5">
              <Label htmlFor={`cancel-${session.session_id}`}>
                {t("w07.session.cancelReason")}
              </Label>
              <Input
                id={`cancel-${session.session_id}`}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
              />
            </div>
          ) : null}

          {!external && spaces.length > 0 && session.runtime_state !== "completed" ? (
            <div className="space-y-1.5">
              <Label htmlFor={`space-${session.session_id}`}>{t("w07.session.changeSpace")}</Label>
              <select
                id={`space-${session.session_id}`}
                className={SELECT_CLASS}
                value={session.venue_space_id ?? ""}
                disabled={changeSpace.isPending}
                onChange={(e) => {
                  if (e.target.value) changeSpace.mutate(e.target.value);
                }}
              >
                <option value="">{t("w07.spaceNone")}</option>
                {spaces.map((space) => (
                  <option key={space.id} value={space.id}>
                    {space.name}
                  </option>
                ))}
              </select>
            </div>
          ) : null}
        </div>
      ) : null}
    </li>
  );
}

function ProgramPanel({
  event,
  program,
  spaces,
  canOperate,
  onChanged,
}: {
  event: EventRow;
  program: EventProgram | undefined;
  spaces: VenueSpaceRow[];
  canOperate: boolean;
  onChanged: () => void;
}) {
  const { t, locale } = useI18n();
  const [adding, setAdding] = React.useState<false | "planned" | "adhoc">(false);
  const sessions = program?.sessions ?? [];
  const locked = program?.program_locked ?? false;

  const reorder = useMutation({
    mutationFn: async (ids: string[]) => {
      const { error } = await supabase.rpc("reorder_event_sessions", {
        _event_id: event.id,
        _session_ids: ids,
        _idempotency_key: newIdempotencyKey(),
      });
      if (error) throw error;
    },
    onSuccess: () => {
      feedback.success(t("w07.program.reordered"));
      onChanged();
    },
    onError: (error) => feedback.error(humanizeError(error, locale)),
  });

  const move = (index: number, delta: number) => {
    const ids = sessions.map((s) => s.session_id);
    const target = index + delta;
    if (target < 0 || target >= ids.length) return;
    const next = [...ids];
    const [moved] = next.splice(index, 1);
    next.splice(target, 0, moved!);
    reorder.mutate(next);
  };

  const canAuthor = canOperate && !locked && !isTerminalEvent(event.status);
  const canAdHoc = canOperate && locked && !isTerminalEvent(event.status);

  return (
    <section id="w07-program" className="surface-panel space-y-3 p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-base font-semibold">{t("w07.program")}</h3>
        <div className="flex flex-wrap gap-2">
          {canAuthor ? (
            <Button size="sm" className="min-h-9" onClick={() => setAdding("planned")}>
              <Plus className="mr-1.5 size-4" aria-hidden="true" />
              {t("w07.program.add")}
            </Button>
          ) : null}
          {canAdHoc ? (
            <Button
              size="sm"
              variant="outline"
              className="min-h-9"
              onClick={() => setAdding("adhoc")}
            >
              <Plus className="mr-1.5 size-4" aria-hidden="true" />
              {t("w07.program.adhoc")}
            </Button>
          ) : null}
        </div>
      </div>

      {sessions.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t("w07.program.emptyBody")}</p>
      ) : (
        <ul className="space-y-2">
          {sessions.map((session, index) => (
            <div key={session.session_id} className="flex items-start gap-2">
              {canAuthor ? (
                <div className="flex flex-col gap-1 pt-3">
                  <Button
                    size="icon"
                    variant="ghost"
                    className="size-8"
                    aria-label={t("w07.program.up")}
                    disabled={reorder.isPending || index === 0}
                    onClick={() => move(index, -1)}
                  >
                    <ArrowUp className="size-4" aria-hidden="true" />
                  </Button>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="size-8"
                    aria-label={t("w07.program.down")}
                    disabled={reorder.isPending || index === sessions.length - 1}
                    onClick={() => move(index, 1)}
                  >
                    <ArrowDown className="size-4" aria-hidden="true" />
                  </Button>
                </div>
              ) : null}
              <div className="flex-1">
                <SessionCard
                  session={session}
                  event={event}
                  spaces={spaces}
                  canOperate={liveCanOperate}
                  onChanged={onChanged}
                />
              </div>
            </div>
          ))}
        </ul>
      )}

      <Dialog open={adding !== false} onOpenChange={(open) => !open && setAdding(false)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {adding === "adhoc" ? t("w07.program.adhoc") : t("w07.program.add")}
            </DialogTitle>
          </DialogHeader>
          {adding !== false ? (
            <SessionForm
              eventId={event.id}
              adHoc={adding === "adhoc"}
              spaces={spaces}
              onDone={() => {
                setAdding(false);
                onChanged();
              }}
            />
          ) : null}
        </DialogContent>
      </Dialog>
    </section>
  );
}

function RunPanel({
  event,
  snapshot,
  canOperate,
  onChanged,
}: {
  event: EventRow;
  snapshot: EventRuntimeSnapshot | undefined;
  canOperate: boolean;
  onChanged: () => void;
}) {
  const { t, locale } = useI18n();
  const [note, setNote] = React.useState("");
  const [cancelReason, setCancelReason] = React.useState("");
  const [observedAt, setObservedAt] = React.useState(toLocalInput(new Date().toISOString()));
  const [observerNote, setObserverNote] = React.useState("");
  const external = event.source_kind === "external";
  const state = snapshot?.runtime_state ?? "scheduled";
  const action = primaryAction(event, snapshot ?? null);

  const run = useMutation({
    mutationFn: async (command: "start" | "complete" | "cancel" | "note") => {
      const key = newIdempotencyKey();
      if (command === "note") {
        const { error } = await supabase.rpc("record_event_note", {
          _event_id: event.id,
          _note: note.trim(),
          _idempotency_key: key,
        });
        if (error) throw error;
        return;
      }
      if (command === "cancel") {
        const { error } = await supabase.rpc(
          "cancel_event",
          rpcArgs({
            _event_id: event.id,
            _reason: cancelReason.trim(),
            _idempotency_key: key,
            _observed_at: external ? fromLocalInput(observedAt) : undefined,
            _observer_note: external ? observerNote.trim() : undefined,
          }),
        );
        if (error) throw error;
        return;
      }
      if (external) {
        const { error } = await supabase.rpc(
          command === "start" ? "record_observed_event_started" : "record_observed_event_completed",
          {
            _event_id: event.id,
            _observed_at: fromLocalInput(observedAt),
            _observer_note: observerNote.trim(),
            _idempotency_key: key,
          },
        );
        if (error) throw error;
        return;
      }
      const { error } = await supabase.rpc(command === "start" ? "start_event" : "complete_event", {
        _event_id: event.id,
        _idempotency_key: key,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      feedback.success(t("w07.run.done"));
      setNote("");
      setCancelReason("");
      setObserverNote("");
      onChanged();
    },
    onError: (error) => feedback.error(humanizeError(error, locale)),
  });

  if (!canOperate || isTerminalEvent(event.status)) return null;

  const canStart = state === "scheduled" && event.status === "ready";
  /* OBS-W07-001: an internal event may only close once every session is resolved. */
  const resolution = sessionResolution(snapshot ?? null);
  const blockedBySessions = !external && resolution.unresolved_total > 0;
  const canComplete = state === "running";
  const canCancel = state === "scheduled" || state === "running";
  const observationIncomplete = external && observerNote.trim().length < 3;

  return (
    <section className="surface-panel space-y-3 p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-base font-semibold">{external ? t("w07.observe") : t("w07.run")}</h3>
        <span
          className={`rounded px-1.5 py-0.5 text-[11px] ${RUNTIME_STATE_TONE[state as keyof typeof RUNTIME_STATE_TONE]}`}
        >
          {t(`w07.runtime.${state}`)}
        </span>
      </div>

      <p className="text-sm text-muted-foreground">{t(action.key)}</p>
      {external ? <p className="text-xs text-muted-foreground">{t("w07.observe.hint")}</p> : null}

      {external ? (
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="ev-obs-at">{t("w07.observe.at")}</Label>
            <Input
              id="ev-obs-at"
              type="datetime-local"
              value={observedAt}
              onChange={(e) => setObservedAt(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="ev-obs-note">{t("w07.observe.note")}</Label>
            <Input
              id="ev-obs-note"
              value={observerNote}
              onChange={(e) => setObserverNote(e.target.value)}
            />
          </div>
        </div>
      ) : null}

      <div className="flex flex-wrap gap-2">
        {canStart ? (
          <Button
            className="min-h-11"
            disabled={run.isPending || observationIncomplete}
            onClick={() => run.mutate("start")}
          >
            {external ? t("w07.observe.eventStarted") : t("w07.run.startEvent")}
          </Button>
        ) : null}
        {canComplete ? (
          <Button
            className="min-h-11"
            variant={blockedBySessions ? "outline" : "default"}
            disabled={run.isPending || observationIncomplete || blockedBySessions}
            onClick={() => run.mutate("complete")}
          >
            {external ? t("w07.observe.eventCompleted") : t("w07.run.completeEvent")}
          </Button>
        ) : null}
      </div>

      {canComplete && blockedBySessions ? (
        <div className="space-y-2 rounded-md border border-warning/40 bg-warning-soft p-3">
          <p className="text-sm font-medium text-warning">
            {`${resolution.unresolved_total} ${
              resolution.unresolved_total === 1
                ? t("w07.run.unresolvedOne")
                : t("w07.run.unresolvedMany")
            }`}
          </p>
          <ul className="space-y-1 text-xs text-muted-foreground">
            {resolution.unresolved.map((session) => (
              <li key={session.session_id} className="flex flex-wrap items-center gap-2">
                <span>
                  {session.sequence}. {session.title}
                </span>
                <span
                  className={`rounded px-1.5 py-0.5 ${RUNTIME_STATE_TONE[session.runtime_state]}`}
                >
                  {t(`w07.runtime.${session.runtime_state}`)}
                </span>
              </li>
            ))}
          </ul>
          <p className="text-xs text-muted-foreground">{t("w07.run.unresolvedHint")}</p>
          <Button
            size="sm"
            variant="ghost"
            className="min-h-9 px-0 text-warning"
            onClick={() =>
              document.getElementById("w07-program")?.scrollIntoView({ behavior: "smooth" })
            }
          >
            {t("w07.run.goToSessions")}
          </Button>
        </div>
      ) : null}

      {state === "scheduled" && event.status !== "ready" ? (
        <p className="text-xs text-muted-foreground">{t("w07.run.needsReady")}</p>
      ) : null}

      {canCancel ? (
        <div className="grid gap-2 border-t border-border pt-3 sm:grid-cols-[1fr_auto] sm:items-end">
          <div className="space-y-1.5">
            <Label htmlFor="ev-cancel">{t("w07.run.cancelReason")}</Label>
            <Input
              id="ev-cancel"
              value={cancelReason}
              onChange={(e) => setCancelReason(e.target.value)}
            />
          </div>
          <Button
            variant="outline"
            className="min-h-11 text-destructive"
            disabled={run.isPending || cancelReason.trim().length < 3 || observationIncomplete}
            onClick={() => run.mutate("cancel")}
          >
            {t("w07.run.cancelEvent")}
          </Button>
        </div>
      ) : null}

      <div className="grid gap-2 border-t border-border pt-3 sm:grid-cols-[1fr_auto] sm:items-end">
        <div className="space-y-1.5">
          <Label htmlFor="ev-note">{t("w07.run.note")}</Label>
          <Textarea
            id="ev-note"
            rows={2}
            placeholder={t("w07.run.notePlaceholder")}
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
        </div>
        <Button
          variant="outline"
          className="min-h-11"
          disabled={run.isPending || note.trim().length < 3}
          onClick={() => run.mutate("note")}
        >
          {t("w07.run.note")}
        </Button>
      </div>
    </section>
  );
}

function CrewPanel({
  event,
  sessions,
  canOperate,
}: {
  event: EventRow;
  sessions: ProgramSession[];
  canOperate: boolean;
}) {
  const { t, locale } = useI18n();
  const { tenant } = useTenant();
  const queryClient = useQueryClient();
  const [personId, setPersonId] = React.useState("");
  const [fn, setFn] = React.useState<EventStaffFunction>("producer");
  const [speakerSession, setSpeakerSession] = React.useState("");
  const [speakerPerson, setSpeakerPerson] = React.useState("");
  const [speakerRole, setSpeakerRole] = React.useState("");

  const people = useQuery({
    queryKey: ["w07-people", tenant?.id],
    enabled: Boolean(tenant?.id),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("people")
        .select("id, full_name")
        .eq("tenant_id", tenant!.id)
        .order("full_name");
      if (error) throw error;
      return data ?? [];
    },
  });

  const staff = useQuery({
    queryKey: ["event-staff", event.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("event_staff_assignments")
        .select("id, person_id, staff_function, session_id")
        .eq("event_id", event.id);
      if (error) throw error;
      return data ?? [];
    },
  });

  const speakers = useQuery({
    queryKey: ["event-speakers", event.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("event_session_speakers")
        .select("id, person_id, session_id, speaking_role")
        .eq("event_id", event.id);
      if (error) throw error;
      return data ?? [];
    },
  });

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ["event-staff", event.id] });
    void queryClient.invalidateQueries({ queryKey: ["event-speakers", event.id] });
  };

  const addStaff = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.rpc("assign_event_staff", {
        _event_id: event.id,
        _person_id: personId,
        _staff_function: fn,
        _idempotency_key: newIdempotencyKey(),
      });
      if (error) throw error;
    },
    onSuccess: () => {
      feedback.success(t("w07.staff.added"));
      setPersonId("");
      invalidate();
    },
    onError: (error) => feedback.error(humanizeError(error, locale)),
  });

  const removeStaff = useMutation({
    mutationFn: async (assignmentId: string) => {
      const { error } = await supabase.rpc("remove_event_staff", {
        _assignment_id: assignmentId,
        _idempotency_key: newIdempotencyKey(),
      });
      if (error) throw error;
    },
    onSuccess: () => {
      feedback.success(t("w07.staff.removed"));
      invalidate();
    },
    onError: (error) => feedback.error(humanizeError(error, locale)),
  });

  const addSpeaker = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.rpc(
        "assign_session_speaker",
        rpcArgs({
          _session_id: speakerSession,
          _person_id: speakerPerson,
          _idempotency_key: newIdempotencyKey(),
          _speaking_role: speakerRole.trim() || undefined,
        }),
      );
      if (error) throw error;
    },
    onSuccess: () => {
      feedback.success(t("w07.speakers.added"));
      setSpeakerPerson("");
      setSpeakerRole("");
      invalidate();
    },
    onError: (error) => feedback.error(humanizeError(error, locale)),
  });

  const removeSpeaker = useMutation({
    mutationFn: async (speakerId: string) => {
      const { error } = await supabase.rpc("remove_session_speaker", {
        _speaker_id: speakerId,
        _idempotency_key: newIdempotencyKey(),
      });
      if (error) throw error;
    },
    onSuccess: () => {
      feedback.success(t("w07.speakers.removed"));
      invalidate();
    },
    onError: (error) => feedback.error(humanizeError(error, locale)),
  });

  const nameOf = (id: string) => people.data?.find((p) => p.id === id)?.full_name ?? id;
  const sessionTitle = (id: string | null) =>
    sessions.find((s) => s.session_id === id)?.title ?? null;
  const editable = canOperate && !isTerminalEvent(event.status);

  return (
    <section className="surface-panel space-y-4 p-5">
      <div>
        <h3 className="text-base font-semibold">{t("w07.people")}</h3>
        <p className="mt-1 text-xs text-muted-foreground">{t("w07.people.noAuth")}</p>
      </div>

      <div className="space-y-2">
        <p className="text-sm font-medium">{t("w07.staff")}</p>
        {staff.data && staff.data.length > 0 ? (
          <ul className="space-y-1.5">
            {staff.data.map((row) => (
              <li
                key={row.id}
                className="flex flex-wrap items-center gap-2 rounded-lg border border-border bg-elevated/50 px-3 py-2 text-sm"
              >
                <span className="font-medium">{nameOf(row.person_id)}</span>
                <span className="text-muted-foreground">{t(`w07.fn.${row.staff_function}`)}</span>
                {editable ? (
                  <Button
                    size="sm"
                    variant="ghost"
                    className="ml-auto min-h-9"
                    disabled={removeStaff.isPending}
                    onClick={() => removeStaff.mutate(row.id)}
                  >
                    {t("w07.remove")}
                  </Button>
                ) : null}
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground">{t("w07.staff.empty")}</p>
        )}

        {editable ? (
          <div className="grid gap-2 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
            <div className="space-y-1.5">
              <Label htmlFor="staff-person">{t("w07.people.person")}</Label>
              <select
                id="staff-person"
                className={SELECT_CLASS}
                value={personId}
                onChange={(e) => setPersonId(e.target.value)}
              >
                <option value="">—</option>
                {(people.data ?? []).map((person) => (
                  <option key={person.id} value={person.id}>
                    {person.full_name}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="staff-fn">{t("w07.staff.function")}</Label>
              <select
                id="staff-fn"
                className={SELECT_CLASS}
                value={fn}
                onChange={(e) => setFn(e.target.value as EventStaffFunction)}
              >
                {STAFF_FUNCTIONS.map((value) => (
                  <option key={value} value={value}>
                    {t(`w07.fn.${value}`)}
                  </option>
                ))}
              </select>
            </div>
            <Button
              className="min-h-11"
              disabled={addStaff.isPending || !personId}
              onClick={() => addStaff.mutate()}
            >
              {t("w07.staff.add")}
            </Button>
          </div>
        ) : null}
      </div>

      <div className="space-y-2 border-t border-border pt-4">
        <p className="text-sm font-medium">{t("w07.speakers")}</p>
        {speakers.data && speakers.data.length > 0 ? (
          <ul className="space-y-1.5">
            {speakers.data.map((row) => (
              <li
                key={row.id}
                className="flex flex-wrap items-center gap-2 rounded-lg border border-border bg-elevated/50 px-3 py-2 text-sm"
              >
                <span className="font-medium">{nameOf(row.person_id)}</span>
                <span className="text-muted-foreground">
                  {[sessionTitle(row.session_id), row.speaking_role].filter(Boolean).join(" · ")}
                </span>
                {editable ? (
                  <Button
                    size="sm"
                    variant="ghost"
                    className="ml-auto min-h-9"
                    disabled={removeSpeaker.isPending}
                    onClick={() => removeSpeaker.mutate(row.id)}
                  >
                    {t("w07.remove")}
                  </Button>
                ) : null}
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground">{t("w07.speakers.empty")}</p>
        )}

        {editable && sessions.length > 0 ? (
          <div className="grid gap-2 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="sp-session">{t("w07.session.title")}</Label>
              <select
                id="sp-session"
                className={SELECT_CLASS}
                value={speakerSession}
                onChange={(e) => setSpeakerSession(e.target.value)}
              >
                <option value="">—</option>
                {sessions.map((session) => (
                  <option key={session.session_id} value={session.session_id}>
                    {session.title}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="sp-person">{t("w07.people.person")}</Label>
              <select
                id="sp-person"
                className={SELECT_CLASS}
                value={speakerPerson}
                onChange={(e) => setSpeakerPerson(e.target.value)}
              >
                <option value="">—</option>
                {(people.data ?? []).map((person) => (
                  <option key={person.id} value={person.id}>
                    {person.full_name}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="sp-role">{t("w07.speakers.role")}</Label>
              <Input
                id="sp-role"
                value={speakerRole}
                onChange={(e) => setSpeakerRole(e.target.value)}
              />
            </div>
            <div className="flex items-end">
              <Button
                className="min-h-11"
                disabled={addSpeaker.isPending || !speakerSession || !speakerPerson}
                onClick={() => addSpeaker.mutate()}
              >
                {t("w07.speakers.add")}
              </Button>
            </div>
          </div>
        ) : null}
      </div>
    </section>
  );
}

function FactsPanel({ event, feed }: { event: EventRow; feed: RuntimeFeed | undefined }) {
  const { t, locale, timeZone } = useI18n();
  const tz = event.timezone || timeZone;
  const facts = feed?.facts ?? [];

  return (
    <section className="surface-panel space-y-3 p-5">
      <h3 className="text-base font-semibold">{t("w07.timeline")}</h3>
      {facts.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t("w07.timeline.empty")}</p>
      ) : (
        <ol className="space-y-2">
          {facts.map((fact) => (
            <li key={fact.id} className="flex flex-wrap items-baseline gap-2 text-sm">
              <span className="font-mono text-[10px] tabular-nums text-muted-foreground">
                {formatDateTime(fact.occurred_at, { locale, timeZone: tz })}
              </span>
              <span className="font-medium">{t(`w07.fact.${fact.event_type}`)}</span>
              {fact.observed ? (
                <span className="rounded bg-primary-soft px-1.5 py-0.5 text-[11px] text-primary">
                  {t("w07.observe.badge")}
                </span>
              ) : null}
              {fact.note || fact.observer_note ? (
                <span className="text-muted-foreground">{fact.note ?? fact.observer_note}</span>
              ) : null}
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

function EventsTab() {
  const { operationId } = useParams({ from: "/_authenticated/operations/$operationId" });
  const { t, locale, timeZone } = useI18n();
  const { tenant, canManage, role } = useTenant();
  const canOperate = canManage || role === "operations_agent";
  const queryClient = useQueryClient();
  const [creating, setCreating] = React.useState(false);
  const [selectedId, setSelectedId] = React.useState<string | null>(null);

  const operation = useQuery({
    queryKey: ["operation-status", operationId],
    queryFn: async () => {
      const { data, error } = await supabase.from("operations").select("status").eq("id", operationId).maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const events = useQuery({
    queryKey: ["events", operationId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("events")
        .select("*")
        .eq("operation_id", operationId)
        .order("planned_start");
      if (error) throw error;
      return (data ?? []) as EventRow[];
    },
  });

  const venues = useQuery({
    queryKey: ["venues", tenant?.id],
    enabled: Boolean(tenant?.id),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("venues")
        .select("*")
        .eq("tenant_id", tenant!.id)
        .order("name");
      if (error) throw error;
      return (data ?? []) as VenueRow[];
    },
  });

  const list = events.data ?? [];
  const selected = list.find((e) => e.id === selectedId) ?? list[0] ?? null;

  const spaces = useQuery({
    queryKey: ["venue-spaces", selected?.venue_id],
    enabled: Boolean(selected?.venue_id),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("venue_spaces")
        .select("*")
        .eq("venue_id", selected!.venue_id!)
        .order("name");
      if (error) throw error;
      return (data ?? []) as VenueSpaceRow[];
    },
  });

  const { program, runtime, facts } = useEventQueries(selected?.id ?? null);

  const refresh = React.useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: ["events", operationId] });
    if (!selected) return;
    void queryClient.invalidateQueries({ queryKey: ["event-program", selected.id] });
    void queryClient.invalidateQueries({ queryKey: ["event-runtime", selected.id] });
    void queryClient.invalidateQueries({ queryKey: ["event-facts", selected.id] });
  }, [queryClient, operationId, selected]);

  /* Realtime is limited to the two approved W07 tables. */
  React.useEffect(() => {
    if (!selected) return;
    const channel = supabase
      .channel(`w07-${selected.id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "event_runtime_events" }, () =>
        refresh(),
      )
      .on("postgres_changes", { event: "*", schema: "public", table: "event_sessions" }, () =>
        refresh(),
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [selected, refresh]);

  if (events.isLoading || operation.isLoading) return <PanelSkeleton rows={4} />;

  const operationClosed = isOperationClosed(operation.data?.status);
  const liveCanOperate = canOperate && !operationClosed;

  return (
    <div className="space-y-5">
      {operationClosed ? <ReadOnlyNotice /> : null}

      <header className="surface-panel animate-rise space-y-2 p-5">
        <div className="flex flex-wrap items-center gap-3">
          <h2 className="text-xl font-semibold">{t("w07.title")}</h2>
          {liveCanOperate ? (
            <Button className="ml-auto min-h-11" onClick={() => setCreating(true)}>
              <Plus className="mr-2 size-4" aria-hidden="true" />
              {t("w07.new")}
            </Button>
          ) : null}
        </div>
        <p className="text-sm text-muted-foreground">{t("w07.subtitle")}</p>
        <p className="text-xs text-muted-foreground">{t("w07.boundary")}</p>
      </header>

      {list.length === 0 ? (
        <EmptyState icon={Clapperboard} title={t("w07.empty")} body={operationEmptyBody(operationClosed, locale, "Nenhum evento foi registrado nesta operação.", "No event was recorded for this operation.", t("w07.emptyBody"))} />
      ) : null}

      {list.length > 1 ? (
        <nav className="flex gap-1 overflow-x-auto rounded-xl border border-border bg-elevated/50 p-1">
          {list.map((event) => (
            <button
              key={event.id}
              type="button"
              onClick={() => setSelectedId(event.id)}
              className={`min-h-11 whitespace-nowrap rounded-lg px-3.5 text-sm font-medium transition-colors ${
                selected?.id === event.id
                  ? "bg-primary-soft text-primary"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {event.name}
            </button>
          ))}
        </nav>
      ) : null}

      {selected ? (
        <>
          <section className="surface-panel space-y-2 p-5">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="text-lg font-semibold">{selected.name}</h3>
              <span
                className={`rounded px-1.5 py-0.5 text-[11px] ${EVENT_STATUS_TONE[selected.status]}`}
              >
                {t(`w07.status.${selected.status}`)}
              </span>
              <span className="rounded bg-elevated px-1.5 py-0.5 text-[11px] text-muted-foreground">
                {t(`w07.source.${selected.source_kind}`)}
              </span>
            </div>
            <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
              {venues.data?.find((v) => v.id === selected.venue_id)?.name ?? t("w07.venueNone")} ·{" "}
              {formatDateTime(selected.planned_start, {
                locale,
                timeZone: selected.timezone || timeZone,
              })}
            </p>
            {selected.external_producer_name ? (
              <p className="text-sm text-muted-foreground">
                {t("w07.producer")}: {selected.external_producer_name}
              </p>
            ) : null}
          </section>

          <RunPanel
            event={selected}
            snapshot={runtime.data}
            canOperate={liveCanOperate}
            onChanged={refresh}
          />
          {!operationClosed ? <LifecyclePanel event={selected} onChanged={refresh} /> : null}
          <ProgramPanel
            event={selected}
            program={program.data}
            spaces={spaces.data ?? []}
            canOperate={liveCanOperate}
            onChanged={refresh}
          />
          <CrewPanel
            event={selected}
            sessions={program.data?.sessions ?? []}
            canOperate={canOperate}
          />
          <FactsPanel event={selected} feed={facts.data} />
        </>
      ) : null}

      {!operationClosed ? (
      <Dialog open={creating} onOpenChange={setCreating}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("w07.new")}</DialogTitle>
          </DialogHeader>
          <CreateEventForm
            operationId={operationId}
            venues={venues.data ?? []}
            onDone={() => {
              setCreating(false);
              void queryClient.invalidateQueries({ queryKey: ["events", operationId] });
            }}
          />
        </DialogContent>
      </Dialog>
      ) : null}
    </div>
  );
}
