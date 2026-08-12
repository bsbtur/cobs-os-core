import { describe, expect, test } from "bun:test";

import {
  buildApplyPayload,
  buildJourneyOrigin,
  buildPreviewRows,
  canSubmitApplication,
  effectiveRequirement,
  formatOffset,
  humanizeBlueprintError,
  previewEnd,
  previewInstant,
  resolveEffectiveAnchor,
  shortChecksum,
  slugifyBlueprint,
  sortStepsBySequence,
  stepOriginLabel,
  type BlueprintStepRow,
} from "@/lib/blueprints";
import { formatDateTime } from "@/lib/format";
import { defaultPresenceRequirement } from "@/lib/w04";

/**
 * POST_PILOT_RELEASE_05.1 — pure-function suite for the blueprint application surface.
 * Runs on the Bun test runner; no extra framework was added to the project.
 */

const t = (key: string) => key;

const ANCHOR = "2026-09-01T12:00:00.000Z";
const PLANNED = "2026-09-01T09:00:00.000Z";

function step(over: Partial<BlueprintStepRow> = {}): BlueprintStepRow {
  return {
    id: "step",
    version_id: "version",
    tenant_id: "tenant",
    sequence: 10,
    title: "Encontro",
    step_kind: "meeting",
    description: null,
    start_offset_minutes: 0,
    duration_minutes: null,
    location_label: null,
    traveler_label: null,
    traveler_facing: false,
    presence_requirement: null,
    presence_population: "participants",
    created_at: ANCHOR,
    updated_at: ANCHOR,
    ...over,
  } as BlueprintStepRow;
}

describe("1 · formatOffset", () => {
  test("zero, minutes and hours", () => {
    expect(formatOffset(0, t)).toBe("bp.offset.zero");
    expect(formatOffset(35, t)).toBe("+35 min bp.offset.after");
    expect(formatOffset(80, t)).toBe("+1 h 20 min bp.offset.after");
    expect(formatOffset(120, t)).toBe("+2 h bp.offset.after");
  });
});

describe("2 · previewInstant", () => {
  test("adds the offset to the anchor", () => {
    expect(previewInstant(ANCHOR, 90)).toBe("2026-09-01T13:30:00.000Z");
  });
  test("null anchor and invalid anchor yield null", () => {
    expect(previewInstant(null, 90)).toBeNull();
    expect(previewInstant("not-a-date", 90)).toBeNull();
  });
});

describe("3/4 · start and end with and without duration", () => {
  test("step with duration produces an end instant", () => {
    expect(previewEnd(ANCHOR, 60, 45)).toBe("2026-09-01T13:45:00.000Z");
  });
  test("step without duration has no end instant", () => {
    expect(previewEnd(ANCHOR, 60, null)).toBeNull();
  });
});

describe("5/6/7/8 · effective anchor", () => {
  test("operation planned_start is used when no manual value", () => {
    const anchor = resolveEffectiveAnchor("", PLANNED);
    expect(anchor).toEqual({ ok: true, iso: PLANNED, source: "planned" });
  });
  test("manual override wins", () => {
    const anchor = resolveEffectiveAnchor("2026-09-01T10:00:00.000Z", PLANNED);
    expect(anchor.ok && anchor.source).toBe("manual");
    expect(anchor.ok && anchor.iso).toBe("2026-09-01T10:00:00.000Z");
  });
  test("no manual value and no planned_start is a missing anchor", () => {
    expect(resolveEffectiveAnchor("", null)).toEqual({ ok: false, reason: "missing" });
    expect(resolveEffectiveAnchor(null, undefined)).toEqual({ ok: false, reason: "missing" });
  });
  test("invalid manual date never resolves", () => {
    expect(resolveEffectiveAnchor("31/02/2026 nonsense", PLANNED)).toEqual({
      ok: false,
      reason: "invalid",
    });
  });
});

describe("9 · display timezone", () => {
  test("the same instant renders in the operation timezone", () => {
    const sp = formatDateTime(ANCHOR, { locale: "pt-BR", timeZone: "America/Sao_Paulo" });
    const utc = formatDateTime(ANCHOR, { locale: "pt-BR", timeZone: "UTC" });
    expect(sp).toContain("09:00");
    expect(utc).toContain("12:00");
  });
});

describe("10 · ordering", () => {
  test("preview rows are sorted by sequence", () => {
    const rows = sortStepsBySequence([{ sequence: 30 }, { sequence: 10 }, { sequence: 20 }]);
    expect(rows.map((r) => r.sequence)).toEqual([10, 20, 30]);
  });
  test("buildPreviewRows sorts unordered input", () => {
    const rows = buildPreviewRows(
      [step({ sequence: 20, start_offset_minutes: 60 }), step({ sequence: 10 })],
      resolveEffectiveAnchor("", ANCHOR),
    );
    expect(rows.map((r) => r.sequence)).toEqual([10, 20]);
    expect(rows[1]!.startIso).toBe("2026-09-01T13:00:00.000Z");
  });
});

describe("11/12/13 · effective presence requirement", () => {
  test("null falls back to the canonical default of the kind", () => {
    expect(effectiveRequirement(step({ step_kind: "meeting" }))).toBe(
      defaultPresenceRequirement("meeting"),
    );
    expect(effectiveRequirement(step({ step_kind: "movement" }))).toBe(
      defaultPresenceRequirement("movement"),
    );
  });
  test("arrival override to accounted is preserved", () => {
    expect(
      effectiveRequirement(step({ step_kind: "arrival", presence_requirement: "accounted" })),
    ).toBe("accounted");
  });
  test("activity override to accounted is preserved", () => {
    expect(
      effectiveRequirement(step({ step_kind: "activity", presence_requirement: "accounted" })),
    ).toBe("accounted");
  });
});

describe("14 · slug normalization", () => {
  test("accents, spaces and symbols are normalized", () => {
    expect(slugifyBlueprint("City Tour Brasília — Executivo!")).toBe(
      "city-tour-brasilia-executivo",
    );
    expect(slugifyBlueprint("  ---  ")).toBe("");
  });
});

describe("15 · error humanization", () => {
  test("known errors map to domain sentences", () => {
    expect(humanizeBlueprintError({ code: "23505", message: "duplicate key slug" }, t)).toBe(
      "bp.error.slugTaken",
    );
    expect(humanizeBlueprintError({ message: "operation already has a journey" }, t)).toBe(
      "bp.error.operationHasJourney",
    );
    expect(humanizeBlueprintError({ code: "42501", message: "permission denied" }, t)).toBe(
      "bp.error.forbidden",
    );
    expect(humanizeBlueprintError({ message: "anchor is required" }, t)).toBe("bp.error.noAnchor");
  });
  test("unknown errors fall back without leaking SQL", () => {
    expect(humanizeBlueprintError({ message: "syntax error at or near INSERT" }, t)).toBe(
      "bp.error.unexpected",
    );
  });
});

describe("16/17/18 · application payload", () => {
  const planned = resolveEffectiveAnchor("", PLANNED);
  const manual = resolveEffectiveAnchor("2026-09-01T10:30:00.000Z", PLANNED);

  test("planned anchor omits _anchor_start", () => {
    const payload = buildApplyPayload("op", "ver", "key", planned)!;
    expect(payload).toEqual({ _operation_id: "op", _version_id: "ver", _idempotency_key: "key" });
    expect("_anchor_start" in payload).toBe(false);
  });
  test("manual override sends _anchor_start", () => {
    const payload = buildApplyPayload("op", "ver", "key", manual)!;
    expect(payload._anchor_start).toBe("2026-09-01T10:30:00.000Z");
  });
  test("payload never carries _allow_existing_journey", () => {
    for (const payload of [
      buildApplyPayload("op", "ver", "key", planned)!,
      buildApplyPayload("op", "ver", "key", manual)!,
    ]) {
      expect(Object.keys(payload)).not.toContain("_allow_existing_journey");
    }
  });
  test("no payload without a valid anchor or version", () => {
    expect(buildApplyPayload("op", "ver", "key", resolveEffectiveAnchor("", null))).toBeNull();
    expect(buildApplyPayload("op", "", "key", planned)).toBeNull();
  });
});

describe("19 · submission gating", () => {
  const anchor = resolveEffectiveAnchor("", PLANNED);
  test("ready preview with anchor and version enables submission", () => {
    expect(
      canSubmitApplication({ versionId: "v", anchor, previewState: "ready", pending: false }),
    ).toBe(true);
  });
  test("loading, error, empty, idle, missing anchor and pending all block", () => {
    const blocked = [
      { versionId: "v", anchor, previewState: "loading" as const, pending: false },
      { versionId: "v", anchor, previewState: "error" as const, pending: false },
      { versionId: "v", anchor, previewState: "empty" as const, pending: false },
      { versionId: "", anchor, previewState: "idle" as const, pending: false },
      {
        versionId: "v",
        anchor: resolveEffectiveAnchor("", null),
        previewState: "ready" as const,
        pending: false,
      },
      { versionId: "v", anchor, previewState: "ready" as const, pending: true },
    ];
    for (const input of blocked) expect(canSubmitApplication(input)).toBe(false);
  });
});

describe("20/21/22 · journey origin", () => {
  const origin = buildJourneyOrigin({
    appliedAt: ANCHOR,
    versionId: "11111111-2222-3333-4444-555555555555",
    versionNumber: 2,
    checksum: "abcdef0123456789abcdef0123456789",
    stepCount: 8,
    blueprintName: "City Tour Brasília",
  })!;

  test("origin exposes names and version, never a UUID", () => {
    expect(origin.blueprintName).toBe("City Tour Brasília");
    expect(origin.versionNumber).toBe(2);
    expect(origin.stepCount).toBe(8);
    const rendered = `${origin.blueprintName} v${origin.versionNumber} ${origin.checksumShort}`;
    expect(rendered).not.toContain("11111111");
  });
  test("checksum is abbreviated", () => {
    expect(origin.checksumShort).toBe("abcdef012345");
    expect(shortChecksum(null)).toBe("");
  });
  test("unresolvable provisioning yields no origin", () => {
    expect(
      buildJourneyOrigin({
        appliedAt: ANCHOR,
        versionId: "v",
        versionNumber: null,
        checksum: null,
        stepCount: null,
        blueprintName: null,
      }),
    ).toBeNull();
  });
  test("null source ids produce no chip and no error", () => {
    const labels = { prefix: "Origem: roteiro", versionShort: "v" };
    expect(stepOriginLabel({}, origin, labels)).toBeNull();
    expect(
      stepOriginLabel(
        { source_blueprint_version_id: null, source_blueprint_step_id: null },
        origin,
        labels,
      ),
    ).toBeNull();
    expect(
      stepOriginLabel(
        { source_blueprint_version_id: origin.versionId, source_blueprint_step_id: "s" },
        origin,
        labels,
      ),
    ).toBe("Origem: roteiro City Tour Brasília v2");
    expect(
      stepOriginLabel(
        { source_blueprint_version_id: "other", source_blueprint_step_id: "s" },
        origin,
        labels,
      ),
    ).toBeNull();
  });
});

describe("23 · idempotency key stability", () => {
  test("the same key is reused across retries of one attempt", () => {
    const key = "attempt-key";
    const anchor = resolveEffectiveAnchor("", PLANNED);
    const first = buildApplyPayload("op", "ver", key, anchor)!;
    const retry = buildApplyPayload("op", "ver", key, anchor)!;
    expect(first._idempotency_key).toBe(retry._idempotency_key);
  });
});
