import { describe, expect, it } from "vitest";

import {
  canManageChecklist,
  isChecklistEditable,
  isDuplicateChecklistTitle,
  normalizeChecklistTitle,
} from "./w04";

type Item = Parameters<typeof isDuplicateChecklistTitle>[0][number];

const item = (over: Partial<Item>): Item => ({
  id: "a",
  title: "Conferir lista",
  journey_step_id: "step-1",
  is_active: true,
  ...over,
});

describe("checklist planning helpers", () => {
  it("normalizes trim, case, accents and inner spaces", () => {
    expect(normalizeChecklistTitle("  Conferir   LISTA ")).toBe("conferir lista");
    expect(normalizeChecklistTitle("Conferir Lísta")).toBe("conferir lista");
  });

  it("detects duplicates on the same step regardless of case/spacing", () => {
    const items = [item({})];
    expect(
      isDuplicateChecklistTitle(items, { stepId: "step-1", title: " conferir   lista " }),
    ).toBe(true);
  });

  it("ignores other steps and inactive items", () => {
    expect(
      isDuplicateChecklistTitle([item({ journey_step_id: "step-2" })], {
        stepId: "step-1",
        title: "Conferir lista",
      }),
    ).toBe(false);
    expect(
      isDuplicateChecklistTitle([item({ is_active: false })], {
        stepId: "step-1",
        title: "Conferir lista",
      }),
    ).toBe(false);
  });

  it("excludes the item being edited", () => {
    expect(
      isDuplicateChecklistTitle([item({})], {
        stepId: "step-1",
        title: "Conferir lista",
        excludeId: "a",
      }),
    ).toBe(false);
  });

  it("treats empty titles as non-duplicate", () => {
    expect(isDuplicateChecklistTitle([item({})], { stepId: "step-1", title: "   " })).toBe(false);
  });

  it("restricts management to tenant operators", () => {
    expect(canManageChecklist("owner")).toBe(true);
    expect(canManageChecklist("admin")).toBe(true);
    expect(canManageChecklist("operations_agent")).toBe(true);
    expect(canManageChecklist("member")).toBe(false);
    expect(canManageChecklist(null)).toBe(false);
  });

  it("allows editing only while the baseline is open", () => {
    expect(isChecklistEditable("draft", "admin")).toBe(true);
    expect(isChecklistEditable("planning", "operations_agent")).toBe(true);
    expect(isChecklistEditable("ready", "admin")).toBe(false);
    expect(isChecklistEditable("active", "owner")).toBe(false);
    expect(isChecklistEditable("completed", "owner")).toBe(false);
    expect(isChecklistEditable("planning", "member")).toBe(false);
  });
});
