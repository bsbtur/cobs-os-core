import * as React from "react";
import { createFileRoute, useParams } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { MessagesSquare, Plus, Trash2 } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { humanizeError } from "@/lib/auth";
import { useI18n } from "@/lib/i18n";
import { formatDateTime } from "@/lib/format";
import { useTenant } from "@/lib/tenant";
import { fromLocalInput, toLocalInput } from "@/lib/w02";
import { roleLabel, type RoleTypeRow } from "@/lib/w03";
import {
  MESSAGE_KINDS,
  MESSAGE_PRIORITIES,
  MESSAGE_PRIORITY_TONE,
  MESSAGE_STATUS_TONE,
  PARTICIPATION_KINDS,
  canAct,
  deliverySummary,
  newIdempotencyKey,
  publishBlockers,
  rpcArgs,
  selectorLabel,
  type CommunicationEventRow,
  type CommunicationFeed,
  type FeedMessage,
  type MessageKind,
  type MessagePriority,
  type MessageSelectorRow,
  type ParticipationKind,
  type RecipientState,
} from "@/lib/w08";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { EmptyState } from "@/components/feedback/empty-state";
import { PanelSkeleton } from "@/components/feedback/loading";
import { feedback } from "@/components/feedback/feedback";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

/**
 * COBS OS · W08 — operation communication workspace.
 * DRAFT = intent · PUBLISHED = frozen history.
 * The UI never edits a published message and never fabricates delivery or read
 * state — every counter comes from the backend snapshot.
 */
export const Route = createFileRoute("/_authenticated/operations/$operationId/communication")({
  head: () => ({
    meta: [
      { title: "Operation communication — messages and delivery in COBS OS" },
      {
        name: "description",
        content:
          "Address operational messages to the roster of an operation, with audience resolved at publication and delivery recorded as facts.",
      },
      { property: "og:title", content: "Operation communication — COBS OS" },
      {
        property: "og:description",
        content: "Draft, audience, publication and read state, separated by design.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: CommunicationTab,
});

const SELECT_CLASS =
  "min-h-11 w-full rounded-lg border border-border bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring";

type PersonOption = { id: string; full_name: string };

function CreateMessageDialog({
  operationId,
  tenantId,
  open,
  onOpenChange,
  onCreated,
}: {
  operationId: string;
  tenantId: string;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onCreated: (id: string) => void;
}) {
  const { t, locale } = useI18n();
  const [title, setTitle] = React.useState("");
  const [body, setBody] = React.useState("");
  const [kind, setKind] = React.useState<MessageKind>("operational");
  const [priority, setPriority] = React.useState<MessagePriority>("normal");
  const idempotency = React.useRef(newIdempotencyKey());

  React.useEffect(() => {
    if (open) idempotency.current = newIdempotencyKey();
  }, [open]);

  const create = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.rpc(
        "create_message",
        rpcArgs({
          _tenant_id: tenantId,
          _title: title.trim(),
          _body: body.trim(),
          _kind: kind,
          _priority: priority,
          _locale: locale,
          _operation_id: operationId,
          _idempotency_key: idempotency.current,
        }),
      );
      if (error) throw error;
      return data as unknown as { message_id?: string; id?: string };
    },
    onSuccess: (data) => {
      feedback.success(t("w08.created"));
      setTitle("");
      setBody("");
      onOpenChange(false);
      const id = data?.message_id ?? data?.id;
      if (id) onCreated(id);
    },
    onError: (error) => feedback.error(humanizeError(error, locale)),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("w08.new")}</DialogTitle>
        </DialogHeader>
        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            create.mutate();
          }}
        >
          <div className="space-y-1.5">
            <Label htmlFor="w08-title">{t("w08.messageTitle")}</Label>
            <Input
              id="w08-title"
              value={title}
              maxLength={200}
              required
              onChange={(e) => setTitle(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="w08-body">{t("w08.body")}</Label>
            <Textarea
              id="w08-body"
              value={body}
              rows={5}
              required
              onChange={(e) => setBody(e.target.value)}
            />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="w08-kind">{t("w08.kind")}</Label>
              <select
                id="w08-kind"
                className={SELECT_CLASS}
                value={kind}
                onChange={(e) => setKind(e.target.value as MessageKind)}
              >
                {MESSAGE_KINDS.map((k) => (
                  <option key={k} value={k}>
                    {t(`w08.kind.${k}`)}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="w08-priority">{t("w08.priority")}</Label>
              <select
                id="w08-priority"
                className={SELECT_CLASS}
                value={priority}
                onChange={(e) => setPriority(e.target.value as MessagePriority)}
              >
                {MESSAGE_PRIORITIES.map((p) => (
                  <option key={p} value={p}>
                    {t(`w08.priority.${p}`)}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <Button type="submit" className="min-h-11 w-full" disabled={create.isPending}>
            {t("w08.create")}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function AudiencePanel({
  message,
  selectors,
  roleTypes,
  people,
  onChanged,
}: {
  message: FeedMessage;
  selectors: MessageSelectorRow[];
  roleTypes: RoleTypeRow[];
  people: PersonOption[];
  onChanged: () => void;
}) {
  const { t, locale } = useI18n();
  const editable = canAct(message.status, "audience");

  const names = React.useMemo(() => {
    const map: Record<string, string> = {};
    for (const r of roleTypes) map[r.id] = roleLabel(r, t);
    for (const p of people) map[p.id] = p.full_name;
    return map;
  }, [roleTypes, people, t]);

  const [all, setAll] = React.useState(false);
  const [kinds, setKinds] = React.useState<ParticipationKind[]>([]);
  const [roles, setRoles] = React.useState<string[]>([]);
  const [personId, setPersonId] = React.useState("");

  React.useEffect(() => {
    setAll(selectors.some((s) => s.selector_kind === "all_participations"));
    setKinds(
      selectors
        .filter((s) => s.selector_kind === "participation_kind" && s.participation_kind)
        .map((s) => s.participation_kind as ParticipationKind),
    );
    setRoles(
      selectors
        .filter((s) => s.selector_kind === "operation_role_type" && s.role_type_id)
        .map((s) => s.role_type_id as string),
    );
  }, [selectors]);

  const saveAudience = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.rpc(
        "set_message_audience",
        rpcArgs({
          _message_id: message.id,
          _all_participations: all,
          _participation_kinds: kinds.length ? kinds : undefined,
          _role_type_ids: roles.length ? roles : undefined,
          _idempotency_key: newIdempotencyKey(),
        }),
      );
      if (error) throw error;
    },
    onSuccess: () => {
      feedback.success(t("w08.audience.saved"));
      onChanged();
    },
    onError: (error) => feedback.error(humanizeError(error, locale)),
  });

  const addPerson = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.rpc(
        "add_message_audience_people",
        rpcArgs({
          _message_id: message.id,
          _person_ids: [personId],
          _idempotency_key: newIdempotencyKey(),
        }),
      );
      if (error) throw error;
    },
    onSuccess: () => {
      setPersonId("");
      feedback.success(t("w08.audience.saved"));
      onChanged();
    },
    onError: (error) => feedback.error(humanizeError(error, locale)),
  });

  const removeSelector = useMutation({
    mutationFn: async (selectorId: string) => {
      const { error } = await supabase.rpc(
        "remove_message_audience_selector",
        rpcArgs({ _selector_id: selectorId, _idempotency_key: newIdempotencyKey() }),
      );
      if (error) throw error;
    },
    onSuccess: () => {
      feedback.success(t("w08.audience.saved"));
      onChanged();
    },
    onError: (error) => feedback.error(humanizeError(error, locale)),
  });

  return (
    <section className="surface-panel space-y-3 p-4">
      <div>
        <h3 className="text-sm font-medium">{t("w08.audience.title")}</h3>
        <p className="mt-1 text-xs text-muted-foreground">{t("w08.audience.hint")}</p>
      </div>

      {selectors.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t("w08.audience.none")}</p>
      ) : (
        <ul className="space-y-1.5">
          {selectors.map((s) => (
            <li key={s.id} className="flex items-center gap-2 text-sm">
              <span className="min-w-0 flex-1 truncate">{selectorLabel(s, t, names)}</span>
              {editable ? (
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  className="min-h-9"
                  aria-label={t("w08.audience.remove")}
                  onClick={() => removeSelector.mutate(s.id)}
                >
                  <Trash2 className="size-4" aria-hidden="true" />
                </Button>
              ) : null}
            </li>
          ))}
        </ul>
      )}

      {editable ? (
        <div className="space-y-3 border-t border-border pt-3">
          <label className="flex items-center gap-2 text-sm">
            <Checkbox checked={all} onCheckedChange={(v) => setAll(v === true)} />
            {t("w08.audience.allToggle")}
          </label>

          <div className="space-y-1.5">
            <p className="text-xs text-muted-foreground">{t("w08.audience.kind")}</p>
            <div className="flex flex-wrap gap-3">
              {PARTICIPATION_KINDS.map((k) => (
                <label key={k} className="flex items-center gap-2 text-sm">
                  <Checkbox
                    checked={kinds.includes(k)}
                    onCheckedChange={(v) =>
                      setKinds((prev) =>
                        v === true ? [...prev, k] : prev.filter((item) => item !== k),
                      )
                    }
                  />
                  {t(`kindLabel.${k}`)}
                </label>
              ))}
            </div>
          </div>

          {roleTypes.length > 0 ? (
            <div className="space-y-1.5">
              <p className="text-xs text-muted-foreground">{t("w08.audience.role")}</p>
              <div className="flex flex-wrap gap-3">
                {roleTypes.map((r) => (
                  <label key={r.id} className="flex items-center gap-2 text-sm">
                    <Checkbox
                      checked={roles.includes(r.id)}
                      onCheckedChange={(v) =>
                        setRoles((prev) =>
                          v === true ? [...prev, r.id] : prev.filter((item) => item !== r.id),
                        )
                      }
                    />
                    {roleLabel(r, t)}
                  </label>
                ))}
              </div>
              <p className="text-xs text-muted-foreground">{t("w08.audience.roleHint")}</p>
            </div>
          ) : null}

          <Button
            type="button"
            className="min-h-11"
            disabled={saveAudience.isPending}
            onClick={() => saveAudience.mutate()}
          >
            {t("w08.save")}
          </Button>

          <div className="space-y-1.5 border-t border-border pt-3">
            <Label htmlFor="w08-person">{t("w08.audience.people")}</Label>
            <div className="flex gap-2">
              <select
                id="w08-person"
                className={SELECT_CLASS}
                value={personId}
                onChange={(e) => setPersonId(e.target.value)}
              >
                <option value="">—</option>
                {people.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.full_name}
                  </option>
                ))}
              </select>
              <Button
                type="button"
                variant="secondary"
                className="min-h-11 shrink-0"
                disabled={!personId || addPerson.isPending}
                onClick={() => addPerson.mutate()}
              >
                {t("w08.audience.addPeople")}
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}

function MessageDetail({
  message,
  operationId,
  onChanged,
  onSelect,
}: {
  message: FeedMessage;
  operationId: string;
  onChanged: () => void;
  onSelect: (id: string) => void;
}) {
  const { t, locale, timeZone } = useI18n();
  const { tenant } = useTenant();

  const selectors = useQuery({
    queryKey: ["w08-selectors", message.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("message_audience_selectors")
        .select("*")
        .eq("message_id", message.id)
        .order("created_at");
      if (error) throw error;
      return (data ?? []) as MessageSelectorRow[];
    },
  });

  const roleTypes = useQuery({
    queryKey: ["w08-role-types", tenant?.id],
    enabled: Boolean(tenant?.id),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("operation_role_types")
        .select("*")
        .eq("tenant_id", tenant!.id)
        .eq("is_active", true)
        .order("sort_order");
      if (error) throw error;
      return (data ?? []) as RoleTypeRow[];
    },
  });

  const rosterPeople = useQuery({
    queryKey: ["w08-roster-people", operationId],
    queryFn: async (): Promise<PersonOption[]> => {
      const { data, error } = await supabase
        .from("operation_participations")
        .select("person_id")
        .eq("operation_id", operationId);
      if (error) throw error;
      const ids = Array.from(new Set((data ?? []).map((r) => r.person_id)));
      if (ids.length === 0) return [];
      const { data: people, error: peopleError } = await supabase
        .from("people")
        .select("id, full_name")
        .in("id", ids)
        .order("full_name");
      if (peopleError) throw peopleError;
      return (people ?? []) as PersonOption[];

    },
  });

  const preview = useQuery({
    queryKey: ["w08-preview", message.id, message.status],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("preview_audience_count", {
        _message_id: message.id,
      });
      if (error) throw error;
      return deliverySummary(data);
    },
  });

  const recipients = useQuery({
    queryKey: ["w08-recipients", message.id],
    enabled: message.status === "published" || message.status === "cancelled",
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_message_recipient_state", {
        _message_id: message.id,
      });
      if (error) throw error;
      return data as unknown as RecipientState;
    },
  });

  const facts = useQuery({
    queryKey: ["w08-facts", message.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("communication_events")
        .select("*")
        .eq("message_id", message.id)
        .order("occurred_at", { ascending: false })
        .limit(100);
      if (error) throw error;
      return (data ?? []) as CommunicationEventRow[];
    },
  });

  const refresh = React.useCallback(() => {
    void selectors.refetch();
    void preview.refetch();
    void recipients.refetch();
    void facts.refetch();
    onChanged();
  }, [selectors, preview, recipients, facts, onChanged]);

  const runCommand = useMutation({
    mutationFn: async (input: { fn: string; args: Record<string, unknown> }) => {
      const { data, error } = await supabase.rpc(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        input.fn as any,
        rpcArgs({ ...input.args, _idempotency_key: newIdempotencyKey() }),
      );
      if (error) throw error;
      return data as unknown;
    },
    onError: (error) => feedback.error(humanizeError(error, locale)),
  });

  const [title, setTitle] = React.useState(message.title);
  const [body, setBody] = React.useState(message.body);
  const [expires, setExpires] = React.useState(toLocalInput(message.expires_at));
  const [scheduleFor, setScheduleFor] = React.useState(toLocalInput(message.scheduled_for));
  const [cancelReason, setCancelReason] = React.useState("");

  React.useEffect(() => {
    setTitle(message.title);
    setBody(message.body);
    setExpires(toLocalInput(message.expires_at));
    setScheduleFor(toLocalInput(message.scheduled_for));
    setCancelReason("");
  }, [message.id, message.title, message.body, message.expires_at, message.scheduled_for]);

  const summary = preview.data ?? deliverySummary(message.summary);
  const hasAudience = (selectors.data ?? []).length > 0;
  const blockers = publishBlockers(message.status, summary, hasAudience);

  return (
    <div className="space-y-4">
      <section className="surface-panel space-y-3 p-4">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="min-w-0 flex-1 truncate text-base font-medium">{message.title}</h2>
          <span
            className={`rounded px-1.5 py-0.5 text-[11px] ${MESSAGE_STATUS_TONE[message.status]}`}
          >
            {t(`w08.status.${message.status}`)}
          </span>
          <span
            className={`rounded px-1.5 py-0.5 text-[11px] ${MESSAGE_PRIORITY_TONE[message.priority]}`}
          >
            {t(`w08.priority.${message.priority}`)}
          </span>
        </div>
        {message.supersedes_message_id ? (
          <button
            type="button"
            className="text-xs text-primary underline"
            onClick={() => onSelect(message.supersedes_message_id!)}
          >
            {t("w08.supersedes")}
          </button>
        ) : null}
        {message.cancelled_at ? (
          <p className="text-xs text-destructive">
            {t("w08.status.cancelled")} · {formatDateTime(message.cancelled_at, { locale, timeZone })}
            {message.cancel_reason ? ` — ${message.cancel_reason}` : ""}
          </p>
        ) : null}
        <p className="whitespace-pre-wrap text-sm text-muted-foreground">{message.body}</p>
      </section>

      <section className="surface-panel grid grid-cols-2 gap-3 p-4 sm:grid-cols-4">
        {[
          ["w08.preview.recipients", summary.recipient_count],
          ["w08.preview.reachable", summary.in_app_reachable_count],
          ["w08.preview.unreachable", summary.unreachable_count],
          ["w08.preview.read", summary.read_count],
        ].map(([key, value]) => (
          <div key={key as string}>
            <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
              {t(key as string)}
            </p>
            <p className="text-lg font-medium tabular-nums">{value as number}</p>
          </div>
        ))}
        <p className="col-span-2 text-xs text-muted-foreground sm:col-span-4">
          {summary.source === "snapshot" ? t("w08.preview.snapshot") : t("w08.preview.live")}
        </p>
      </section>

      {canAct(message.status, "edit") ? (
        <section className="surface-panel space-y-3 p-4">
          <h3 className="text-sm font-medium">{t("w08.save")}</h3>
          <div className="space-y-1.5">
            <Label htmlFor="w08-edit-title">{t("w08.messageTitle")}</Label>
            <Input
              id="w08-edit-title"
              value={title}
              maxLength={200}
              onChange={(e) => setTitle(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="w08-edit-body">{t("w08.body")}</Label>
            <Textarea
              id="w08-edit-body"
              rows={5}
              value={body}
              onChange={(e) => setBody(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="w08-edit-expires">{t("w08.expiresAt")}</Label>
            <Input
              id="w08-edit-expires"
              type="datetime-local"
              value={expires}
              onChange={(e) => setExpires(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">{t("w08.expiresHint")}</p>
          </div>
          <Button
            type="button"
            className="min-h-11"
            disabled={runCommand.isPending}
            onClick={() =>
              runCommand.mutate(
                {
                  fn: "update_draft_message",
                  args: {
                    _message_id: message.id,
                    _title: title.trim(),
                    _body: body.trim(),
                    _expires_at: expires ? fromLocalInput(expires) : undefined,
                    _clear_expiry: !expires && Boolean(message.expires_at),
                  },
                },
                {
                  onSuccess: () => {
                    feedback.success(t("w08.saved"));
                    refresh();
                  },
                },
              )
            }
          >
            {t("w08.save")}
          </Button>
        </section>
      ) : null}

      {selectors.isLoading ? (
        <PanelSkeleton />
      ) : (
        <AudiencePanel
          message={message}
          selectors={selectors.data ?? []}
          roleTypes={roleTypes.data ?? []}
          people={rosterPeople.data ?? []}
          onChanged={refresh}
        />
      )}

      <section className="surface-panel space-y-3 p-4">
        <h3 className="text-sm font-medium">{t("w08.publish")}</h3>

        {canAct(message.status, "schedule") ? (
          <div className="space-y-1.5">
            <Label htmlFor="w08-schedule">{t("w08.scheduleFor")}</Label>
            <div className="flex gap-2">
              <Input
                id="w08-schedule"
                type="datetime-local"
                value={scheduleFor}
                onChange={(e) => setScheduleFor(e.target.value)}
              />
              <Button
                type="button"
                variant="secondary"
                className="min-h-11 shrink-0"
                disabled={!scheduleFor || runCommand.isPending}
                onClick={() =>
                  runCommand.mutate(
                    {
                      fn: "schedule_message",
                      args: {
                        _message_id: message.id,
                        _scheduled_for: fromLocalInput(scheduleFor),
                      },
                    },
                    {
                      onSuccess: () => {
                        feedback.success(t("w08.scheduled"));
                        refresh();
                      },
                    },
                  )
                }
              >
                {t("w08.schedule")}
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">{t("w08.scheduleHint")}</p>
          </div>
        ) : null}

        {canAct(message.status, "unschedule") ? (
          <Button
            type="button"
            variant="secondary"
            className="min-h-11"
            disabled={runCommand.isPending}
            onClick={() =>
              runCommand.mutate(
                { fn: "unschedule_message", args: { _message_id: message.id } },
                {
                  onSuccess: () => {
                    feedback.success(t("w08.unscheduled"));
                    refresh();
                  },
                },
              )
            }
          >
            {t("w08.unschedule")}
          </Button>
        ) : null}

        {canAct(message.status, "publish") ? (
          <div className="space-y-2">
            {blockers.length > 0 ? (
              <ul className="space-y-1 text-xs text-warning">
                {blockers.map((b) => (
                  <li key={b}>{t(b)}</li>
                ))}
              </ul>
            ) : null}
            <Button
              type="button"
              className="min-h-11"
              disabled={blockers.length > 0 || runCommand.isPending}
              onClick={() => {
                if (!window.confirm(t("w08.publishConfirm"))) return;
                runCommand.mutate(
                  { fn: "publish_message", args: { _message_id: message.id } },
                  {
                    onSuccess: () => {
                      feedback.success(t("w08.published"));
                      refresh();
                    },
                  },
                );
              }}
            >
              {t("w08.publish")}
            </Button>
          </div>
        ) : null}

        {canAct(message.status, "correct") ? (
          <div className="space-y-1.5 border-t border-border pt-3">
            <p className="text-xs text-muted-foreground">{t("w08.correctHint")}</p>
            <Button
              type="button"
              variant="secondary"
              className="min-h-11"
              disabled={runCommand.isPending}
              onClick={() =>
                runCommand.mutate(
                  { fn: "create_correction_message", args: { _message_id: message.id } },
                  {
                    onSuccess: (data) => {
                      feedback.success(t("w08.corrected"));
                      refresh();
                      const next = (data ?? {}) as { message_id?: string; id?: string };
                      const id = next.message_id ?? next.id;
                      if (id) onSelect(id);
                    },
                  },
                )
              }
            >
              {t("w08.correct")}
            </Button>
          </div>
        ) : null}

        {canAct(message.status, "cancel") ? (
          <div className="space-y-1.5 border-t border-border pt-3">
            <Label htmlFor="w08-cancel">{t("w08.cancelReason")}</Label>
            <Textarea
              id="w08-cancel"
              rows={2}
              value={cancelReason}
              onChange={(e) => setCancelReason(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">{t("w08.cancelHint")}</p>
            <Button
              type="button"
              variant="destructive"
              className="min-h-11"
              disabled={runCommand.isPending}
              onClick={() =>
                runCommand.mutate(
                  {
                    fn: "cancel_message",
                    args: {
                      _message_id: message.id,
                      _reason: cancelReason.trim() || undefined,
                    },
                  },
                  {
                    onSuccess: () => {
                      feedback.success(t("w08.cancelled"));
                      refresh();
                    },
                  },
                )
              }
            >
              {t("w08.cancel")}
            </Button>
          </div>
        ) : null}

        {canAct(message.status, "delete") ? (
          <Button
            type="button"
            variant="ghost"
            className="min-h-11 text-destructive"
            disabled={runCommand.isPending}
            onClick={() => {
              if (!window.confirm(t("w08.deleteConfirm"))) return;
              runCommand.mutate(
                { fn: "delete_draft_message", args: { _message_id: message.id } },
                {
                  onSuccess: () => {
                    feedback.success(t("w08.deleted"));
                    onSelect("");
                    onChanged();
                  },
                },
              );
            }}
          >
            {t("w08.delete")}
          </Button>
        ) : null}
      </section>

      {recipients.data ? (
        <section className="surface-panel space-y-2 p-4">
          <h3 className="text-sm font-medium">{t("w08.recipients.title")}</h3>
          <p className="text-xs text-muted-foreground">{t("w08.recipients.snapshotHint")}</p>
          {recipients.data.recipients.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t("w08.recipients.empty")}</p>
          ) : (
            <ul className="divide-y divide-border">
              {recipients.data.recipients.map((r) => (
                <li key={r.recipient_id} className="flex flex-wrap items-center gap-2 py-2 text-sm">
                  <span className="min-w-0 flex-1 truncate">{r.full_name}</span>
                  <span className="text-xs text-muted-foreground">
                    {r.in_app_eligible
                      ? t("w08.recipients.eligible")
                      : t("w08.recipients.ineligible")}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {r.first_read_at
                      ? `${t("w08.recipients.read")} · ${formatDateTime(r.first_read_at, { locale, timeZone })}`
                      : r.delivered_at
                        ? t("w08.recipients.unread")
                        : "—"}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
      ) : null}

      <section className="surface-panel space-y-2 p-4">
        <h3 className="text-sm font-medium">{t("w08.timeline")}</h3>
        {(facts.data ?? []).length === 0 ? (
          <p className="text-sm text-muted-foreground">—</p>
        ) : (
          <ul className="space-y-1.5">
            {(facts.data ?? []).map((f) => (
              <li key={f.id} className="flex flex-wrap gap-2 text-sm">
                <span className="font-medium">{t(`w08.fact.${f.event_type}`)}</span>
                <span className="ml-auto text-xs text-muted-foreground">
                  {formatDateTime(f.occurred_at, { locale, timeZone })}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function CommunicationTab() {
  const { operationId } = useParams({ from: "/_authenticated/operations/$operationId/communication" });
  const { t, locale, timeZone } = useI18n();
  const { tenant } = useTenant();
  const queryClient = useQueryClient();
  const [selectedId, setSelectedId] = React.useState<string>("");
  const [createOpen, setCreateOpen] = React.useState(false);

  const feed = useQuery({
    queryKey: ["w08-feed", operationId],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_operation_communication_feed", {
        _operation_id: operationId,
      });
      if (error) throw error;
      return data as unknown as CommunicationFeed;
    },
  });

  /* Realtime: exactly one table carries communication facts. */
  React.useEffect(() => {
    const channel = supabase
      .channel(`w08-${operationId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "communication_events" },
        () => {
          void queryClient.invalidateQueries({ queryKey: ["w08-feed", operationId] });
          void queryClient.invalidateQueries({ queryKey: ["w08-recipients"] });
          void queryClient.invalidateQueries({ queryKey: ["w08-facts"] });
        },
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [operationId, queryClient]);

  const messages = feed.data?.messages ?? [];
  const selected = messages.find((m) => m.id === selectedId) ?? null;

  const refresh = React.useCallback(() => {
    void feed.refetch();
  }, [feed]);

  if (feed.isLoading) return <PanelSkeleton rows={5} />;

  if (feed.isError) {
    return (
      <EmptyState
        icon={MessagesSquare}
        title={t("w08.forbidden")}
        body={`${t("w08.forbiddenBody")} — ${humanizeError(feed.error, locale)}`}
      />
    );
  }

  return (
    <div className="space-y-4">
      <header className="flex flex-wrap items-start gap-3">
        <div className="min-w-0 flex-1">
          <h1 className="text-lg font-medium">{t("w08.title")}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{t("w08.subtitle")}</p>
          <p className="mt-1 text-xs text-muted-foreground">{t("w08.boundary")}</p>
        </div>
        <Button type="button" className="min-h-11" onClick={() => setCreateOpen(true)}>
          <Plus className="mr-2 size-4" aria-hidden="true" />
          {t("w08.new")}
        </Button>
      </header>

      {tenant ? (
        <CreateMessageDialog
          operationId={operationId}
          tenantId={tenant.id}
          open={createOpen}
          onOpenChange={setCreateOpen}
          onCreated={(id) => {
            setSelectedId(id);
            refresh();
          }}
        />
      ) : null}

      {messages.length === 0 ? (
        <EmptyState icon={MessagesSquare} title={t("w08.empty")} body={t("w08.emptyBody")} />
      ) : (
        <div className="grid gap-4 lg:grid-cols-[minmax(0,320px)_minmax(0,1fr)]">
          <ul className="space-y-2">
            {messages.map((m) => (
              <li key={m.id}>
                <button
                  type="button"
                  onClick={() => setSelectedId(m.id)}
                  aria-current={m.id === selectedId ? "true" : undefined}
                  className={`w-full rounded-xl border p-3 text-left transition-colors ${
                    m.id === selectedId
                      ? "border-primary bg-primary-soft/40"
                      : "border-border hover:bg-elevated/60"
                  }`}
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="min-w-0 flex-1 truncate text-sm font-medium">{m.title}</span>
                    <span
                      className={`rounded px-1.5 py-0.5 text-[10px] ${MESSAGE_STATUS_TONE[m.status]}`}
                    >
                      {t(`w08.status.${m.status}`)}
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {t(`w08.kind.${m.kind}`)} ·{" "}
                    {formatDateTime(m.published_at ?? m.created_at, { locale, timeZone })}
                  </p>
                </button>
              </li>
            ))}
          </ul>

          {selected ? (
            <MessageDetail
              message={selected}
              operationId={operationId}
              onChanged={refresh}
              onSelect={setSelectedId}
            />
          ) : (
            <EmptyState icon={MessagesSquare} title={t("w08.empty")} body={t("w08.emptyBody")} />
          )}
        </div>
      )}
    </div>
  );
}
