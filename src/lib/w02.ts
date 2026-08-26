import type { Database } from "@/integrations/supabase/types";

/**
 * COBS OS · W02 — Experience / Offering / Operation client model.
 * EXPERIENCE (definition) != OFFERING (commercial format) != OPERATION (execution).
 */

export type ExperienceRow = Database["public"]["Tables"]["experiences"]["Row"];
export type OfferingRow = Database["public"]["Tables"]["offerings"]["Row"];
export type OperationRow = Database["public"]["Tables"]["operations"]["Row"];

export type ExperienceKind = Database["public"]["Enums"]["experience_kind"];
export type ExperienceStatus = Database["public"]["Enums"]["experience_status"];
export type OfferingStatus = Database["public"]["Enums"]["offering_status"];
export type OperationStatus = Database["public"]["Enums"]["operation_status"];

export const EXPERIENCE_KINDS: ExperienceKind[] = ["tourism", "event", "hybrid"];

export const OPERATION_STATUS_FLOW: OperationStatus[] = [
  "draft",
  "planning",
  "ready",
  "active",
  "completed",
];

/** Mirrors the database transition guard — the UI never offers an illegal move. */
export const OPERATION_TRANSITIONS: Record<OperationStatus, OperationStatus[]> = {
  draft: ["planning", "cancelled"],
  planning: ["ready", "draft", "cancelled"],
  ready: ["active", "planning", "cancelled"],
  active: ["completed", "cancelled"],
  completed: [],
  cancelled: [],
};

/** Completed/cancelled operations are historical records and operationally read-only. */
export function isOperationTerminal(status: OperationStatus | string | null | undefined) {
  return status === "completed" || status === "cancelled";
}

/** Planned window is a baseline: editable only before the operation is committed. */
export function isPlannedWindowEditable(status: OperationStatus) {
  return status === "draft" || status === "planning";
}

export function slugify(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

/** Operation code suggestion — stable, human-readable, tenant-unique by convention. */
export function suggestOperationCode(name: string, date: string) {
  const base = slugify(name).replace(/-/g, "").slice(0, 6).toUpperCase() || "OP";
  const compact = date ? date.slice(0, 10).replace(/-/g, "") : "";
  return `${base}-${compact}`;
}

/** IDEMPOTENCY: one intent = one key, stable across retries of the same form session. */
export function newIdempotencyKey() {
  return globalThis.crypto.randomUUID();
}

/** Effective window: forecast when it exists, otherwise the planned baseline. */
export function effectiveWindow(op: OperationRow) {
  return {
    start: op.expected_start ?? op.planned_start,
    end: op.expected_end ?? op.planned_end,
    isForecast: Boolean(op.expected_start && op.expected_end),
  };
}

/** <input type="datetime-local"> <-> ISO helpers (values are stored UTC). */
export function toLocalInput(iso: string | null | undefined) {
  if (!iso) return "";
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function fromLocalInput(value: string) {
  return new Date(value).toISOString();
}
