import { readFileSync } from "node:fs";
import { describe, expect, test } from "bun:test";

const people = readFileSync("src/routes/_authenticated/people.tsx", "utf8");
const operationPeople = readFileSync(
  "src/routes/_authenticated/operations.$operationId.people.tsx",
  "utf8",
);
const manualPerson = readFileSync("src/lib/manual-person.ts", "utf8");
const auth = readFileSync("src/lib/auth.tsx", "utf8");
const auditMigration = readFileSync(
  "supabase/migrations/20261018012725_create_person_manual_audit_v2.sql",
  "utf8",
);

describe("Manual People RPC staged integration", () => {
  test("keeps one shared rollout flag disabled", () => {
    expect(manualPerson).toContain("export const ENABLE_MANUAL_PERSON_RPC = false");
    expect(people).toContain("ENABLE_MANUAL_PERSON_RPC");
    expect(operationPeople).toContain("ENABLE_MANUAL_PERSON_RPC");
  });

  test("keeps both current direct-insert fallbacks while the flag is disabled", () => {
    expect(people).toContain('supabase.from("people").insert');
    expect(operationPeople).toContain('.from("people")');
    expect(operationPeople).toContain(".insert({");
  });

  test("routes both manual creation surfaces through the same governed helper when enabled", () => {
    expect(people).toContain("createManualPerson(");
    expect(operationPeople).toContain("createManualPerson(");
    expect(people).toContain("nextManualPersonAttempt(");
    expect(operationPeople).toContain("nextManualPersonAttempt(");
    expect(operationPeople).toContain("return result.personId");
  });

  test("central helper calls only create_person_manual and validates person_id", () => {
    expect(manualPerson).toContain('supabase.rpc("create_person_manual"');
    expect(manualPerson).toContain("_idempotency_key: idempotencyKey");
    expect(manualPerson).toContain('typeof payload["person_id"] === "string"');
    expect(manualPerson).toContain('throw new Error("manual_person_missing_person_id")');
  });

  test("does not change unrelated People actions", () => {
    expect(people).toContain('supabase.rpc("link_person_to_profile"');
    expect(people).toContain('supabase.from("people").delete()');
    expect(operationPeople).toContain('supabase.rpc("add_operation_participation"');
  });

  test("adds one audit event only on first governed creation", () => {
    expect(auditMigration).toContain("app_private.record_audit_event");
    expect(auditMigration).toContain("'identity.person_manual_created'");
    expect(auditMigration).toContain("'person'");
    expect(auditMigration).toContain("jsonb_build_object('source','manual')");
    expect(auditMigration).toContain("return jsonb_build_object(\n      'person_id',_prior.person_id,\n      'unchanged',true");
  });

  test("humanizes governed manual Person errors", () => {
    for (const code of [
      "person_email_conflict_requires_review",
      "manual_person_idempotency_conflict",
      "manual_person_previous_person_deleted",
      "manual_person_invalid_input",
      "manual_person_unauthorized",
      "manual_person_missing_person_id",
    ]) {
      expect(auth).toContain(code);
    }
  });
});
