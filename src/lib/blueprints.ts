import type { Database, Json } from "@/integrations/supabase/types";
import type { AppRole } from "@/lib/tenant";
import {
  allowedPresenceRequirements,
  defaultPresenceRequirement,
  newIdempotencyKey,
  type PresencePopulation,
  type PresenceRequirement,
  type StepKind,
} from "@/lib/w04";

/**
 * COBS OS · W04 — Journey blueprints (client model, POST_PILOT_RELEASE_05).
 *
 * The backend is the authority: every mutation goes through the installed SECURITY DEFINER
 * RPCs, never through direct DML. This module only mirrors the contract so the interface can
 * propose the same thing the database would accept.
 *
 * The W04 presence matrix is NOT duplicated here — it is imported from `@/lib/w04`.
 */

export type BlueprintRow = Database["public"]["Tables"]["journey_blueprints"]["Row"];
export type BlueprintVersionRow = Database["public"]["Tables"]["journey_blueprint_versions"]["Row"];
export type BlueprintStepRow = Database["public"]["Tables"]["journey_blueprint_steps"]["Row"];
export type ProvisioningRow =
  Database["public"]["Tables"]["operation_journey_provisionings"]["Row"];

export type BlueprintStatus = Database["public"]["Enums"]["journey_blueprint_status"];
export type BlueprintVersionStatus =
  Database["public"]["Enums"]["journey_blueprint_version_status"];

export { newIdempotencyKey };

/* ------------------------------------------------------------------ */
/* Permissions — mirrored from the RPC role checks, never a substitute */
/* ------------------------------------------------------------------ */

/** Any active member of the tenant may read blueprints (RLS SELECT). */
export function canViewBlueprints(role: AppRole | null): boolean {
  return role === "owner" || role === "admin" || role === "operations_agent" || role === "member";
}

/** Create a blueprint, edit a draft version, create a new version, apply to an operation. */
export function canEditBlueprints(role: AppRole | null): boolean {
  return role === "owner" || role === "admin" || role === "operations_agent";
}

/** Publish a version or archive a blueprint. */
export function canPublishBlueprints(role: AppRole | null): boolean {
  return role === "owner" || role === "admin";
}

/* ------------------------------------------------------------------ */
/* Status helpers                                                      */
/* ------------------------------------------------------------------ */

export function isDraft(version: Pick<BlueprintVersionRow, "status">): boolean {
  return version.status === "draft";
}

export function isPublished(version: Pick<BlueprintVersionRow, "status">): boolean {
  return version.status === "published";
}

export function draftVersion<T extends Pick<BlueprintVersionRow, "status">>(
  versions: T[],
): T | null {
  return versions.find((v) => v.status === "draft") ?? null;
}

/** Highest published version_number, which is the one offered for cloning and application. */
export function latestPublishedVersion<
  T extends Pick<BlueprintVersionRow, "status" | "version_number">,
>(versions: T[]): T | null {
  const published = versions.filter((v) => v.status === "published");
  if (published.length === 0) return null;
  return published.reduce((best, v) => (v.version_number > best.version_number ? v : best));
}

/** A new version may only be branched from a published version when no draft is open. */
export function canCreateVersion(
  blueprint: Pick<BlueprintRow, "status">,
  versions: Pick<BlueprintVersionRow, "status" | "version_number">[],
): boolean {
  return (
    blueprint.status === "active" &&
    draftVersion(versions) === null &&
    latestPublishedVersion(versions) !== null
  );
}

/** Display-only short checksum; the full value is still shown on the published version card. */
export function shortChecksum(checksum: string | null): string {
  return checksum ? checksum.slice(0, 12) : "";
}

/* ------------------------------------------------------------------ */
/* Relative time preview                                               */
/* ------------------------------------------------------------------ */

/** "+35 min" / "+1 h 20 min" / "no início" — offsets are always relative to the anchor. */
export function formatOffset(minutes: number, t: (key: string) => string): string {
  if (minutes === 0) return t("bp.offset.zero");
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  const parts: string[] = [];
  if (hours > 0) parts.push(`${hours} h`);
  if (rest > 0 || hours === 0) parts.push(`${rest} min`);
  return `+${parts.join(" ")} ${t("bp.offset.after")}`;
}

/** Absolute instant a step would receive when applied against a given anchor. */
export function previewInstant(anchorIso: string | null, offsetMinutes: number): string | null {
  if (!anchorIso) return null;
  const anchor = new Date(anchorIso);
  if (Number.isNaN(anchor.getTime())) return null;
  return new Date(anchor.getTime() + offsetMinutes * 60_000).toISOString();
}

/** Preview end instant; null when the step carries no duration. */
export function previewEnd(
  anchorIso: string | null,
  offsetMinutes: number,
  durationMinutes: number | null,
): string | null {
  if (durationMinutes === null) return null;
  return previewInstant(anchorIso, offsetMinutes + durationMinutes);
}

/* ------------------------------------------------------------------ */
/* Step drafts and payloads                                            */
/* ------------------------------------------------------------------ */

export type StepDraft = {
  title: string;
  step_kind: StepKind;
  description: string;
  start_offset_minutes: string;
  duration_minutes: string;
  location_label: string;
  traveler_label: string;
  traveler_facing: boolean;
  presence_requirement: PresenceRequirement;
  presence_population: PresencePopulation;
};

export function emptyStepDraft(kind: StepKind = "meeting"): StepDraft {
  return {
    title: "",
    step_kind: kind,
    description: "",
    start_offset_minutes: "0",
    duration_minutes: "",
    location_label: "",
    traveler_label: "",
    traveler_facing: false,
    presence_requirement: defaultPresenceRequirement(kind),
    presence_population: "participants",
  };
}

export function stepRowToDraft(step: BlueprintStepRow): StepDraft {
  return {
    title: step.title,
    step_kind: step.step_kind,
    description: step.description ?? "",
    start_offset_minutes: String(step.start_offset_minutes),
    duration_minutes: step.duration_minutes === null ? "" : String(step.duration_minutes),
    location_label: step.location_label ?? "",
    traveler_label: step.traveler_label ?? "",
    traveler_facing: step.traveler_facing,
    presence_requirement: step.presence_requirement ?? defaultPresenceRequirement(step.step_kind),
    presence_population: step.presence_population,
  };
}

export type StepDraftError = { field: keyof StepDraft; code: string };

/** Local pre-flight only. The RPC re-validates everything and remains the final authority. */
export function validateStepDraft(draft: StepDraft): StepDraftError[] {
  const errors: StepDraftError[] = [];
  if (!draft.title.trim()) errors.push({ field: "title", code: "required" });
  const offset = Number(draft.start_offset_minutes);
  if (draft.start_offset_minutes.trim() === "" || !Number.isInteger(offset) || offset < 0) {
    errors.push({ field: "start_offset_minutes", code: "invalid_offset" });
  }
  if (draft.duration_minutes.trim() !== "") {
    const duration = Number(draft.duration_minutes);
    if (!Number.isInteger(duration) || duration <= 0) {
      errors.push({ field: "duration_minutes", code: "invalid_duration" });
    }
  }
  if (!allowedPresenceRequirements(draft.step_kind).includes(draft.presence_requirement)) {
    errors.push({ field: "presence_requirement", code: "presence_contract" });
  }
  return errors;
}

/**
 * NULL means "let the backend apply the canonical default".
 * An explicit value is sent only for a legitimate override (e.g. arrival/accounted,
 * activity/accounted), never to restate the default.
 */
export function explicitRequirement(draft: StepDraft): PresenceRequirement | null {
  const canonical = defaultPresenceRequirement(draft.step_kind);
  return draft.presence_requirement === canonical ? null : draft.presence_requirement;
}

export type AddStepArgs = Database["public"]["Functions"]["add_blueprint_step"]["Args"];
export type UpdateStepArgs = Database["public"]["Functions"]["update_blueprint_step"]["Args"];

export function buildAddStepPayload(
  versionId: string,
  draft: StepDraft,
  idempotencyKey: string,
): AddStepArgs {
  const requirement = explicitRequirement(draft);
  const duration = draft.duration_minutes.trim();
  return {
    _version_id: versionId,
    _title: draft.title.trim(),
    _step_kind: draft.step_kind,
    _start_offset_minutes: Number(draft.start_offset_minutes),
    _idempotency_key: idempotencyKey,
    _traveler_facing: draft.traveler_facing,
    _presence_population: draft.presence_population,
    ...(duration ? { _duration_minutes: Number(duration) } : {}),
    ...(requirement ? { _presence_requirement: requirement } : {}),
    ...(draft.description.trim() ? { _description: draft.description.trim() } : {}),
    ...(draft.location_label.trim() ? { _location_label: draft.location_label.trim() } : {}),
    ...(draft.traveler_label.trim() ? { _traveler_label: draft.traveler_label.trim() } : {}),
  };
}

export function buildUpdateStepPayload(
  stepId: string,
  draft: StepDraft,
  idempotencyKey: string,
): UpdateStepArgs {
  const requirement = explicitRequirement(draft);
  const duration = draft.duration_minutes.trim();
  return {
    _step_id: stepId,
    _idempotency_key: idempotencyKey,
    _title: draft.title.trim(),
    _step_kind: draft.step_kind,
    _start_offset_minutes: Number(draft.start_offset_minutes),
    _traveler_facing: draft.traveler_facing,
    _presence_population: draft.presence_population,
    _description: draft.description.trim(),
    _location_label: draft.location_label.trim(),
    _traveler_label: draft.traveler_label.trim(),
    ...(duration ? { _duration_minutes: Number(duration) } : { _clear_duration: true }),
    ...(requirement
      ? { _presence_requirement: requirement }
      : { _clear_presence_requirement: true }),
  };
}

/* ------------------------------------------------------------------ */
/* RPC result readers                                                  */
/* ------------------------------------------------------------------ */

function asRecord(value: Json | null): Record<string, Json> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, Json>)
    : {};
}

function readString(value: Json | null, key: string): string | null {
  const raw = asRecord(value)[key];
  return typeof raw === "string" ? raw : null;
}

function readNumber(value: Json | null, key: string): number | null {
  const raw = asRecord(value)[key];
  return typeof raw === "number" ? raw : null;
}

export type CreatedBlueprint = { blueprintId: string; versionId: string };

export function readCreatedBlueprint(result: Json | null): CreatedBlueprint | null {
  const blueprintId = readString(result, "blueprint_id");
  const versionId = readString(result, "version_id");
  return blueprintId && versionId ? { blueprintId, versionId } : null;
}

export function readVersionId(result: Json | null): string | null {
  return readString(result, "version_id");
}

export function readStepCount(result: Json | null): number | null {
  return readNumber(result, "step_count");
}

export type BlueprintViolation = {
  code: string;
  sequence: number | null;
  message: string;
};

export type ValidationResult = {
  valid: boolean;
  stepCount: number;
  violations: BlueprintViolation[];
};

export function readValidation(result: Json | null): ValidationResult {
  const record = asRecord(result);
  const rawViolations = Array.isArray(record["violations"]) ? record["violations"] : [];
  const violations: BlueprintViolation[] = rawViolations.map((entry) => {
    const item = asRecord(entry);
    return {
      code: typeof item["code"] === "string" ? item["code"] : "unknown",
      sequence: typeof item["sequence"] === "number" ? item["sequence"] : null,
      message: typeof item["message"] === "string" ? item["message"] : "",
    };
  });
  return {
    valid: record["valid"] === true,
    stepCount: typeof record["step_count"] === "number" ? record["step_count"] : 0,
    violations,
  };
}

/* ------------------------------------------------------------------ */
/* Error humanization                                                  */
/* ------------------------------------------------------------------ */

type SupabaseLikeError = { message?: string; code?: string; details?: string };

/**
 * Blueprint-specific errors get a domain sentence; anything unrecognised falls back to the
 * generic message so no raw SQL text ever reaches the operator.
 */
export function humanizeBlueprintError(error: unknown, t: (key: string) => string): string {
  const err = (error ?? {}) as SupabaseLikeError;
  const message = `${err.message ?? ""} ${err.details ?? ""}`.toLowerCase();

  if (err.code === "23505" || message.includes("duplicate key")) {
    if (message.includes("slug")) return t("bp.error.slugTaken");
    if (message.includes("operation_id")) return t("bp.error.alreadyProvisioned");
    if (message.includes("single_draft")) return t("bp.error.draftExists");
    return t("bp.error.duplicate");
  }
  if (message.includes("already has") && message.includes("journey")) {
    return t("bp.error.operationHasJourney");
  }
  if (message.includes("provision")) return t("bp.error.alreadyProvisioned");
  if (message.includes("anchor")) return t("bp.error.noAnchor");
  if (message.includes("not authorized") || message.includes("permission") || err.code === "42501")
    return t("bp.error.forbidden");
  if (message.includes("published") && message.includes("immutable"))
    return t("bp.error.immutable");
  if (message.includes("archived")) return t("bp.error.archived");
  if (message.includes("presence")) return t("bp.error.presenceContract");
  if (message.includes("draft")) return t("bp.error.draftRequired");
  if (message.includes("jwt") || message.includes("session")) return t("bp.error.session");
  if (message.includes("tenant")) return t("bp.error.tenant");
  return t("bp.error.unexpected");
}

/** Slug proposal — same normalization used across the catalog surfaces. */
export function slugifyBlueprint(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

/* ------------------------------------------------------------------ */
/* Application: effective anchor, preview and payload                  */
/* POST_PILOT_RELEASE_05.1 — L2/L3/L4/L5 gap closure                   */
/* ------------------------------------------------------------------ */

/**
 * The anchor is the single instant every relative offset is measured from.
 * A manual override wins; otherwise the operation's planned start is used and
 * `_anchor_start` is omitted so the backend resolves the very same instant.
 */
export type AnchorResolution =
  | { ok: true; iso: string; source: "manual" | "planned" }
  | { ok: false; reason: "missing" | "invalid" };

function toIso(value: string | null | undefined): string | null {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

export function resolveEffectiveAnchor(
  manualValue: string | null | undefined,
  plannedStart: string | null | undefined,
): AnchorResolution {
  const manualRaw = (manualValue ?? "").trim();
  if (manualRaw !== "") {
    const iso = toIso(manualRaw);
    return iso ? { ok: true, iso, source: "manual" } : { ok: false, reason: "invalid" };
  }
  const planned = toIso(plannedStart ?? null);
  if (planned) return { ok: true, iso: planned, source: "planned" };
  return { ok: false, reason: "missing" };
}

export type ApplyBlueprintArgs =
  Database["public"]["Functions"]["apply_journey_blueprint_to_operation"]["Args"];

/**
 * Only the four contract arguments are ever sent. `_allow_existing_journey` does not exist
 * in this surface: the application never merges, replaces or re-provisions.
 */
export function buildApplyPayload(
  operationId: string,
  versionId: string,
  idempotencyKey: string,
  anchor: AnchorResolution,
): ApplyBlueprintArgs | null {
  if (!operationId || !versionId || !idempotencyKey || !anchor.ok) return null;
  return {
    _operation_id: operationId,
    _version_id: versionId,
    _idempotency_key: idempotencyKey,
    ...(anchor.source === "manual" ? { _anchor_start: anchor.iso } : {}),
  };
}

/** Steps are always previewed and applied in ascending sequence. */
export function sortStepsBySequence<T extends { sequence: number }>(steps: T[]): T[] {
  return [...steps].sort((a, b) => a.sequence - b.sequence);
}

/** NULL in the row means "canonical default for this kind" — resolved through @/lib/w04. */
export function effectiveRequirement(
  step: Pick<BlueprintStepRow, "step_kind" | "presence_requirement">,
): PresenceRequirement {
  return step.presence_requirement ?? defaultPresenceRequirement(step.step_kind);
}

export type PreviewRow = {
  sequence: number;
  title: string;
  stepKind: StepKind;
  offsetMinutes: number;
  durationMinutes: number | null;
  startIso: string | null;
  endIso: string | null;
  requirement: PresenceRequirement;
  population: PresencePopulation;
  travelerFacing: boolean;
};

/** Pure projection of a published version against an anchor — no W04 rule is redefined here. */
export function buildPreviewRows(
  steps: Pick<
    BlueprintStepRow,
    | "sequence"
    | "title"
    | "step_kind"
    | "start_offset_minutes"
    | "duration_minutes"
    | "presence_requirement"
    | "presence_population"
    | "traveler_facing"
  >[],
  anchor: AnchorResolution,
): PreviewRow[] {
  const anchorIso = anchor.ok ? anchor.iso : null;
  return sortStepsBySequence(steps).map((step) => ({
    sequence: step.sequence,
    title: step.title,
    stepKind: step.step_kind,
    offsetMinutes: step.start_offset_minutes,
    durationMinutes: step.duration_minutes,
    startIso: previewInstant(anchorIso, step.start_offset_minutes),
    endIso: previewEnd(anchorIso, step.start_offset_minutes, step.duration_minutes),
    requirement: effectiveRequirement(step),
    population: step.presence_population,
    travelerFacing: step.traveler_facing,
  }));
}

export type PreviewState = "idle" | "loading" | "error" | "empty" | "ready";

/** Single decision point for the confirm button and for calling the RPC at all. */
export function canSubmitApplication(input: {
  versionId: string;
  anchor: AnchorResolution;
  previewState: PreviewState;
  pending: boolean;
}): boolean {
  return (
    !input.pending && input.versionId !== "" && input.anchor.ok && input.previewState === "ready"
  );
}

/* ------------------------------------------------------------------ */
/* Journey origin (banner + per-step chip) — never exposes identifiers */
/* ------------------------------------------------------------------ */

export type JourneyOrigin = {
  blueprintName: string;
  versionNumber: number;
  checksumShort: string;
  stepCount: number | null;
  appliedAt: string;
  versionId: string;
};

/**
 * Builds the operator-facing origin from data already loaded for the banner.
 * Returns null when the provisioning cannot be resolved to a named blueprint;
 * no identifier is ever surfaced.
 */
export function buildJourneyOrigin(input: {
  appliedAt: string | null | undefined;
  versionId: string | null | undefined;
  versionNumber: number | null | undefined;
  checksum: string | null | undefined;
  stepCount: number | null | undefined;
  blueprintName: string | null | undefined;
}): JourneyOrigin | null {
  if (!input.appliedAt || !input.versionId) return null;
  if (!input.blueprintName || typeof input.versionNumber !== "number") return null;
  return {
    blueprintName: input.blueprintName,
    versionNumber: input.versionNumber,
    checksumShort: shortChecksum(input.checksum ?? null),
    stepCount: typeof input.stepCount === "number" ? input.stepCount : null,
    appliedAt: input.appliedAt,
    versionId: input.versionId,
  };
}

/**
 * Per-step chip label. Only steps materialised from the provisioned version get one;
 * null source ids are normal (manual steps) and never an error.
 */
export function stepOriginLabel(
  step: {
    source_blueprint_version_id?: string | null;
    source_blueprint_step_id?: string | null;
  },
  origin: JourneyOrigin | null,
  labels: { prefix: string; versionShort: string },
): string | null {
  if (!origin) return null;
  if (!step.source_blueprint_version_id || !step.source_blueprint_step_id) return null;
  if (step.source_blueprint_version_id !== origin.versionId) return null;
  return `${labels.prefix} ${origin.blueprintName} ${labels.versionShort}${origin.versionNumber}`;
}
