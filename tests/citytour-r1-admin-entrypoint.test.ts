import { readFileSync } from "node:fs";
import { describe, expect, it } from "bun:test";

const admin = readFileSync("src/components/dashboard/admin-overview.tsx", "utf8");

describe("City Tour R$1 QA admin entrypoint", () => {
  it("discovers the QA operation by stable code inside the active tenant", () => {
    expect(admin).toContain('CITYTO-QA-CLEAN-20260828-01');
    expect(admin).toContain('.eq("tenant_id", tenantId!)');
    expect(admin).toContain('.eq("code", CITYTOUR_QA_OPERATION_CODE)');
  });

  it("shows the QA dashboard entrypoint only when the fixture operation exists", () => {
    expect(admin).toContain('data?.cityTourQaOperationId ?');
    expect(admin).toContain('to="/qa/citytour-r1"');
  });

  it("does not add mutations or payment/provider calls to the admin overview", () => {
    expect(admin).not.toContain('functions.invoke');
    expect(admin).not.toContain('invite_participant_access');
    expect(admin).not.toContain('citytour-test-create-pix');
    expect(admin).not.toContain('contracts-clicksign-send');
  });
});
