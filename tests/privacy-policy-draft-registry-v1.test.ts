import { readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";

const migration = readFileSync(
  "supabase/migrations/20260907031500_privacy_policy_draft_registry_v1.sql",
  "utf8",
);

describe("privacy policy draft registry v1", () => {
  test("registers drafts only for owner/admin and computes SHA-256 server-side", () => {
    expect(migration).toContain("register_privacy_policy_draft");
    expect(migration).toContain("array['owner','admin']");
    expect(migration).toContain("digest(convert_to(v_content,'UTF8'),'sha256')");
    expect(migration).toContain("'hash_algorithm','sha256'");
    expect(migration).toContain("'draft'");
  });

  test("freezes the exact content snapshot and makes a version immutable", () => {
    expect(migration).toContain("content_snapshot text");
    expect(migration).toContain("privacy_policy_version_immutable");
    expect(migration).toContain("v_existing.content_hash <> v_hash");
    expect(migration).toContain("coalesce(v_existing.content_snapshot,'') <> v_content");
    expect(migration).toContain("'idempotent',true");
  });

  test("does not expose an authenticated activation path", () => {
    expect(migration).not.toContain("activate_privacy_policy");
    expect(migration).not.toContain("status='active'");
    expect(migration).not.toContain("'active', jsonb_build_object");
    expect(migration).not.toContain("legal_reviewed_at=now()");
    expect(migration).toContain("formal_legal_validation_required");
  });

  test("blocks active status without frozen content and formal legal evidence", () => {
    expect(migration).toContain("guard_privacy_policy_activation_evidence");
    expect(migration).toContain("privacy_policy_formal_legal_review_required");
    expect(migration).toContain("new.legal_reviewed_at is null");
    expect(migration).toContain("new.legal_review_reference");
  });

  test("audit payload excludes the policy body", () => {
    expect(migration).toContain("privacy_policy.draft_registered");
    expect(migration).toContain("'content_hash',v_hash");
    const auditSection = migration.split("perform app_private.record_audit_event(")[1] ?? "";
    expect(auditSection).not.toContain("'content_snapshot'");
  });
});
