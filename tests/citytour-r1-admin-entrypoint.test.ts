import { readFileSync } from "node:fs";
import { describe, expect, it } from "bun:test";

const entry = readFileSync("src/components/dashboard/citytour-r1-qa-entry.tsx", "utf8");
const app = readFileSync("src/routes/_authenticated/app.tsx", "utf8");

describe("City Tour R$1 QA admin entrypoint", () => {
  it("discovers the QA operation by stable code inside the active tenant", () => {
    expect(entry).toContain('CITYTO-QA-CLEAN-20260828-01');
    expect(entry).toContain('.eq("tenant_id", tenantId!)');
    expect(entry).toContain('.eq("code", CITYTOUR_QA_OPERATION_CODE)');
  });

  it("stays hidden unless the QA fixture exists and the actor can manage", () => {
    expect(entry).toContain('if (!canManage || qaOperation.isLoading || qaOperation.isError || !qaOperation.data) return null;');
    expect(entry).toContain('to="/qa/citytour-r1"');
    expect(app).toContain('<CityTourR1QaEntry />');
    expect(app).toContain('canManage ?');
  });

  it("does not add mutations or payment/provider calls", () => {
    for (const source of [entry, app]) {
      expect(source).not.toContain('functions.invoke');
      expect(source).not.toContain('invite_participant_access');
      expect(source).not.toContain('citytour-test-create-pix');
      expect(source).not.toContain('contracts-clicksign-send');
      expect(source).not.toContain('.insert(');
      expect(source).not.toContain('.update(');
      expect(source).not.toContain('.delete(');
    }
  });
});
