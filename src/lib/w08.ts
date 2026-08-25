import type { Database } from "@/integrations/supabase/types";

/**
 * COBS OS · W08 — Communication & Notification Core.
 *
 * MESSAGE != DELIVERY != READ STATE.
 * A draft is editable intent. Publication RESOLVES the audience into a frozen
 * recipient snapshot and creates in-app deliveries as immutable history.
 * A published message is never edited — it is corrected by a NEW message that
 * supersedes it, or cancelled for governance (history is preserved either way).
 * Authorization is W01 membership only; W03 role labels select audience, never access.
 */

export type MessageRow = Database["public"]["Tables"]["messages"]["Row"];
export type MessageSelectorRow = Database["public"]["Tables"]["message_audience_selectors"]["Row"];
export type MessageRecipientRow = Database["public"]["Tables"]["message_recipients"]["Row"];
export type MessageDeliveryRow = Database["public"]["Tables"]["message_deliveries"]["Row"];
export type CommunicationEventRow = Database["public"]["Tables"]["communication_events"]["Row"];

export type MessageKind = Database["public"]["Enums"]["message_kind"];
export type MessagePriority = Database["public"]["Enums"]["message_priority"];
export type MessageStatus = Database["public"]["Enums"]["message_status"];
export type AudienceSelectorKind = Database["public"]["Enums"]["audience_selector_kind"];
export type CommunicationEventType = Database["public"]["Enums"]["communication_event_type"];
export type ParticipationKind = Database["public"]["Enums"]["participation_kind"];

export const MESSAGE_KINDS: MessageKind[] = [
  "operational",
  "alert",
  "instruction",
  "reminder",
  "update",
  "announcement",
  "other",
];

export const MESSAGE_PRIORITIES: MessagePriority[] = ["normal", "important", "urgent"];

export const PARTICIPATION_KINDS: ParticipationKind[] = [
  "participant",
  "crew",
  "support",
  "observer",
];

export const MESSAGE_STATUS_TONE: Record<MessageStatus, string> = {
  draft: "bg-elevated text-muted-foreground",
  scheduled: "bg-warning-soft text-warning",
  published: "bg-success-soft text-success",
  cancelled: "bg-destructive/10 text-destructive",
};

export const MESSAGE_PRIORITY_TONE: Record<MessagePriority, string> = {
  normal: "bg-elevated text-muted-foreground",
  important: "bg-warning-soft text-warning",
  urgent: "bg-destructive/10 text-destructive",
};

/** Delivery counters are DERIVED from the snapshot; the UI never recomputes them. */
export type DeliverySummary = {
  recipient_count: number;
  in_app_reachable_count: number;
  unreachable_count: number;
  read_count: number;
  source?: "preview" | "snapshot" | undefined;
};

export type FeedMessage = {
  id: string;
  kind: MessageKind;
  priority: MessagePriority;
  status: MessageStatus;
  title: string;
  body: string;
  locale: string;
  expires_at: string | null;
  scheduled_for: string | null;
  published_at: string | null;
  published_by: string | null;
  cancelled_at: string | null;
  cancel_reason: string | null;
  supersedes_message_id: string | null;
  journey_step_id: string | null;
  transport_leg_id: string | null;
  hospitality_stay_id: string | null;
  event_id: string | null;
  event_session_id: string | null;
  created_at: string;
  summary: DeliverySummary;
};

export type CommunicationFeed = { operation_id: string; messages: FeedMessage[] };

export type RecipientStateRow = {
  recipient_id: string;
  person_id: string;
  full_name: string;
  in_app_eligible: boolean;
  delivered_at: string | null;
  first_read_at: string | null;
};

export type RecipientState = {
  message_id: string;
  summary: DeliverySummary;
  recipients: RecipientStateRow[];
};

export type InboxMessage = {
  id: string;
  kind: MessageKind;
  priority: MessagePriority;
  status: MessageStatus;
  title: string;
  body: string;
  locale: string;
  operation_id: string | null;
  expires_at: string | null;
  published_at: string | null;
  cancelled_at: string | null;
  delivered_at: string | null;
  first_read_at: string | null;
};

export type Inbox = { person_id: string | null; messages: InboxMessage[] };

export const EMPTY_SUMMARY: DeliverySummary = {
  recipient_count: 0,
  in_app_reachable_count: 0,
  unreachable_count: 0,
  read_count: 0,
};

export function deliverySummary(input: unknown): DeliverySummary {
  const s = (input ?? {}) as Partial<DeliverySummary>;
  return {
    recipient_count: Number(s.recipient_count ?? 0),
    in_app_reachable_count: Number(s.in_app_reachable_count ?? 0),
    unreachable_count: Number(s.unreachable_count ?? 0),
    read_count: Number(s.read_count ?? 0),
    source: s.source,
  };
}

/** Only a DRAFT is editable. Everything else is history or governance. */
export function isDraft(status: MessageStatus) {
  return status === "draft";
}

export function isTerminalMessage(status: MessageStatus) {
  return status === "published" || status === "cancelled";
}

/** Mirrors the backend transition matrix — illegal actions are never offered. */
export type MessageAction =
  "edit" | "audience" | "delete" | "schedule" | "unschedule" | "publish" | "cancel" | "correct";

export const MESSAGE_ACTIONS: Record<MessageStatus, MessageAction[]> = {
  draft: ["edit", "audience", "schedule", "publish", "delete"],
  scheduled: ["edit", "audience", "unschedule", "publish", "cancel"],
  published: ["correct", "cancel"],
  cancelled: [],
};

export function canAct(status: MessageStatus, action: MessageAction) {
  return MESSAGE_ACTIONS[status].includes(action);
}

/** A message expires by TIME, never by manual status. */
export function isExpired(message: { expires_at: string | null }, now = Date.now()) {
  return Boolean(message.expires_at && new Date(message.expires_at).getTime() < now);
}

export function unreadCount(inbox: Inbox | null | undefined) {
  return (inbox?.messages ?? []).filter((m) => !m.first_read_at && !m.cancelled_at).length;
}

/** Publication is refused with a reason rather than silently producing a no-op send. */
export function publishBlockers(
  status: MessageStatus,
  summary: DeliverySummary,
  hasAudience: boolean,
): string[] {
  const blockers: string[] = [];
  if (status !== "draft" && status !== "scheduled") blockers.push("w08.block.status");
  if (!hasAudience) blockers.push("w08.block.noAudience");
  else if (summary.recipient_count === 0) blockers.push("w08.block.emptyAudience");
  else if (summary.in_app_reachable_count === 0) blockers.push("w08.block.noReachable");
  return blockers;
}

export function selectorLabel(
  selector: MessageSelectorRow,
  t: (key: string) => string,
  names: Record<string, string> = {},
) {
  switch (selector.selector_kind) {
    case "all_participations":
      return t("w08.audience.all");
    case "participation_kind":
      return `${t("w08.audience.kind")}: ${t(`kindLabel.${selector.participation_kind}`)}`;

    case "operation_role_type":
      return `${t("w08.audience.role")}: ${names[selector.role_type_id ?? ""] ?? "—"}`;
    case "explicit_person":
      return `${t("w08.audience.person")}: ${names[selector.person_id ?? ""] ?? "—"}`;
    default:
      return t("w08.audience.all");
  }
}

/** IDEMPOTENCY: one intent = one key, stable across retries on a bad connection. */
export function newIdempotencyKey() {
  return globalThis.crypto.randomUUID();
}

/** Drops undefined keys so optional RPC arguments stay absent, not explicit undefined. */
export function rpcArgs<T extends Record<string, unknown>>(input: T) {
  return Object.fromEntries(Object.entries(input).filter(([, value]) => value !== undefined)) as {
    [K in keyof T]: Exclude<T[K], undefined>;
  };
}

/**
 * W08 — External delivery outbox (read-only operator view).
 * The provider pipeline is the authority; the UI NEVER fabricates or mutates
 * status — it renders rows from `communication_outbox` and can only request a
 * retry through the audited `retry_communication_delivery` command.
 * `destination_snapshot`, provider ids and error payloads stay out of the UI.
 */
export type OutboxStatus =
  | "queued"
  | "processing"
  | "accepted"
  | "sent"
  | "delivered"
  | "read"
  | "retry_wait"
  | "failed"
  | "dead_letter";

export type OutboxRow = {
  id: string;
  message_id: string;
  person_id: string | null;
  channel: string;
  status: OutboxStatus;
  attempt_count: number;
  next_attempt_at: string | null;
  last_error_code: string | null;
  last_error_message: string | null;
  accepted_at: string | null;
  sent_at: string | null;
  delivered_at: string | null;
  read_at: string | null;
  failed_at: string | null;
  dead_lettered_at: string | null;
  updated_at: string | null;
};

export const OUTBOX_STATUSES: OutboxStatus[] = [
  "queued",
  "processing",
  "accepted",
  "sent",
  "delivered",
  "read",
  "retry_wait",
  "failed",
  "dead_letter",
];

/** Success → progress → failure, using only semantic tokens. */
export const OUTBOX_STATUS_TONE: Record<OutboxStatus, string> = {
  queued: "bg-elevated text-muted-foreground",
  processing: "bg-warning-soft text-warning",
  accepted: "bg-success-soft text-success",
  sent: "bg-success-soft text-success",
  delivered: "bg-success-soft text-success",
  read: "bg-success-soft text-success",
  retry_wait: "bg-warning-soft text-warning",
  failed: "bg-destructive/10 text-destructive",
  dead_letter: "bg-destructive/10 text-destructive",
};

/** Manual retry is offered ONLY for terminal failure states. */
export function canRetryOutbox(status: OutboxStatus) {
  return status === "failed" || status === "dead_letter";
}

/** The most relevant timestamp for a row, never recomputed client-side. */
export function lastRelevantOutboxTimestamp(row: OutboxRow): string | null {
  return (
    row.read_at ??
    row.delivered_at ??
    row.sent_at ??
    row.accepted_at ??
    row.failed_at ??
    row.dead_lettered_at ??
    row.updated_at ??
    null
  );
}

/** Compact per-status counters for the summary strip. Order is stable. */
export function summarizeOutbox(rows: OutboxRow[]): { status: OutboxStatus; count: number }[] {
  const counts = new Map<OutboxStatus, number>();
  for (const row of rows) counts.set(row.status, (counts.get(row.status) ?? 0) + 1);
  return OUTBOX_STATUSES.filter((s) => counts.has(s)).map((s) => ({
    status: s,
    count: counts.get(s) ?? 0,
  }));
}
