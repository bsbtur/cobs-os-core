export const ALLOWED_EVENT_TYPES = new Set(["lead.created", "order.confirmed"]);
export const ALLOWED_INTENTS = new Set([
  "price",
  "installment",
  "group",
  "ready_to_buy",
  "human_support",
  "other",
]);
export const ALLOWED_URGENCIES = new Set(["low", "medium", "high"]);

export type DispatchInput = {
  tenant_id?: unknown;
  operation_id?: unknown;
  event_type?: unknown;
  idempotency_key?: unknown;
  payload?: unknown;
};

export function isUuid(value: unknown): value is string {
  return (
    typeof value === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
  );
}

export function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function validateDispatchInput(value: unknown): string | null {
  if (!isPlainObject(value)) return "invalid_body";
  const body = value as DispatchInput;
  if (!isUuid(body.tenant_id)) return "invalid_tenant_id";
  if (body.operation_id != null && !isUuid(body.operation_id)) return "invalid_operation_id";
  if (typeof body.event_type !== "string" || !ALLOWED_EVENT_TYPES.has(body.event_type)) {
    return "unsupported_event_type";
  }
  if (
    typeof body.idempotency_key !== "string" ||
    body.idempotency_key.trim().length < 8 ||
    body.idempotency_key.length > 160
  ) {
    return "invalid_idempotency_key";
  }
  if (!isPlainObject(body.payload)) return "invalid_payload";
  if (JSON.stringify(body.payload).length > 12_000) return "payload_too_large";
  return null;
}

export function validateResultInput(value: unknown): string | null {
  if (!isPlainObject(value)) return "invalid_body";
  if (!isUuid(value.event_id) || !isUuid(value.tenant_id)) return "invalid_event_reference";
  if (value.outcome !== "completed" && value.outcome !== "failed") return "invalid_outcome";
  if (value.outcome === "completed") {
    // Lead classification keeps its structured commercial fields. Other
    // automation events may complete with provider_metadata only.
    const hasLeadFields =
      value.intent != null ||
      value.urgency != null ||
      value.summary != null ||
      value.suggested_reply != null;
    if (hasLeadFields) {
      if (typeof value.intent !== "string" || !ALLOWED_INTENTS.has(value.intent))
        return "invalid_intent";
      if (typeof value.urgency !== "string" || !ALLOWED_URGENCIES.has(value.urgency))
        return "invalid_urgency";
      if (typeof value.summary !== "string" || value.summary.length > 500)
        return "invalid_summary";
      if (typeof value.suggested_reply !== "string" || value.suggested_reply.length > 600)
        return "invalid_suggested_reply";
    }
  }
  if (value.provider_metadata != null && !isPlainObject(value.provider_metadata)) {
    return "invalid_provider_metadata";
  }
  return null;
}
