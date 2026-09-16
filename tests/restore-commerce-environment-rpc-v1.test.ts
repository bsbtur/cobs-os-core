import { describe, expect, test } from "vitest";
import fs from "node:fs";
import path from "node:path";

const migration = fs.readFileSync(
  path.resolve("supabase/migrations/20260916130000_restore_commerce_environment_rpc_v1.sql"),
  "utf8",
);

describe("restore Commerce environment RPC v1", () => {
  test("restores the canonical environment-isolated listing with tenant authorization", () => {
    expect(migration).toContain("create or replace function public.list_orders_by_environment");
    expect(migration).toContain("app_private.w09_require_commerce_read(_tenant_id)");
    expect(migration).toContain("_environment not in ('production', 'qa')");
    expect(migration).toContain("pc.metadata->>'environment'='test'");
    expect(migration).toContain("pc.metadata->>'environment'='production'");
  });

  test("keeps browser execution authenticated-only", () => {
    expect(migration).toContain("revoke all on function public.list_orders_by_environment");
    expect(migration).toContain("from public, anon");
    expect(migration).toContain("to authenticated");
  });
});
