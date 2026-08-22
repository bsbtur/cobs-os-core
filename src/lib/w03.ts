import type { Database } from "@/integrations/supabase/types";

/**
 * COBS OS · W03 — People · Participants · Crew · Contextual Roles (client model).
 *
 * PERSON != LOGIN · PERSON != ROLE · MEMBERSHIP != OPERATIONAL ROLE
 * PARTICIPATION != PHYSICAL PRESENCE — roster status is not attendance.
 */

export type RoleTypeRow = Database["public"]["Tables"]["operation_role_types"]["Row"];
export type ParticipationRow = Database["public"]["Tables"]["operation_participations"]["Row"];
export type RoleAssignmentRow = Database["public"]["Tables"]["operation_role_assignments"]["Row"];

export type ParticipationKind = Database["public"]["Enums"]["participation_kind"];
export type ParticipationStatus = Database["public"]["Enums"]["participation_status"];

export const PARTICIPATION_KINDS: ParticipationKind[] = [
  "participant",
  "crew",
  "support",
  "observer",
];

export const PARTICIPATION_STATUSES: ParticipationStatus[] = ["expected", "confirmed", "cancelled"];

/** Mirrors the database command surface — the UI never offers an impossible move. */
export const PARTICIPATION_TRANSITIONS: Record<ParticipationStatus, ParticipationStatus[]> = {
  expected: ["confirmed", "cancelled"],
  confirmed: ["expected", "cancelled"],
  cancelled: ["expected"],
};

/** Role labels are resolved from stable i18n-safe keys; custom types may carry a label. */
export function roleLabel(
  roleType: { key: string; label?: string | null } | null | undefined,
  t: (key: string) => string,
) {
  if (!roleType) return "—";
  if (roleType.label) return roleType.label;
  const translated = t(`role.${roleType.key}`);
  return translated === `role.${roleType.key}` ? roleType.key : translated;
}

/** IDEMPOTENCY: one intent = one key, stable across retries of the same form session. */
export function newIdempotencyKey() {
  return globalThis.crypto.randomUUID();
}
