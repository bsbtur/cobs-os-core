import { describe, expect, test } from "vitest";
import { readFileSync } from "node:fs";

const sql = readFileSync(
  "supabase/migrations/20260907123500_communication_devices_direct_acl_hardening_v1.sql",
  "utf8",
).replace(/\s+/g, " ");

describe("communication_devices direct ACL hardening v1", () => {
  test("removes every direct client privilege from push-token storage", () => {
    expect(sql).toContain(
      "revoke all on table public.communication_devices from public, anon, authenticated;",
    );
  });

  test("preserves the server-side service_role path", () => {
    expect(sql).toContain("grant all on table public.communication_devices to service_role;");
  });

  test("does not add a client policy or change RLS semantics", () => {
    expect(sql).not.toMatch(/create\s+policy/i);
    expect(sql).not.toMatch(/disable\s+row\s+level\s+security/i);
  });
});
