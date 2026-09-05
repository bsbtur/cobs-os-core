import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";

const migration = readFileSync(
  "supabase/migrations/20260905162010_commerce_environment_isolation_v1.sql",
  "utf8",
);
const commerce = readFileSync("src/routes/_authenticated/commerce.index.tsx", "utf8");
const dashboard = readFileSync("src/components/dashboard/ciosp-commercial-dashboard.tsx", "utf8");
const detail = readFileSync("src/routes/_authenticated/commerce.$orderId.tsx", "utf8");

describe("Commerce production/QA isolation", () => {
  test("filters orders server-side with tenant authorization", () => {
    expect(migration).toContain("app_private.w09_require_commerce_read(_tenant_id)");
    expect(migration).toContain("_environment not in ('production', 'qa')");
    expect(migration).toContain("pc.metadata->>'environment' = 'test'");
    expect(migration).toContain("pc.metadata->>'environment' = 'production'");
    expect(migration).toContain("coalesce((o.metadata->>'qa_public_checkout')::boolean, false)");
    expect(migration).toContain("coalesce(o.metadata->>'source', '') <> 'public_checkout'");
  });

  test("keeps the RPC private from anonymous callers", () => {
    expect(migration).toContain(") from public, anon;");
    expect(migration).toContain(") to authenticated;");
  });

  test("Commerce defaults invalid or missing search state to production", () => {
    expect(commerce).toContain('search["environment"] === "qa" ? "qa" : "production"');
    expect(commerce).toContain('"list_orders_by_environment"');
    expect(commerce).toContain("Produção e QA nunca são exibidos na mesma lista.");
    expect(commerce).toContain('disabled={environment === "qa"}');
  });

  test("preserves environment through order navigation", () => {
    expect(commerce).toContain("search={{ environment }}");
    expect(dashboard).toContain("search={{ environment }}");
    expect(detail).toContain('<Link to="/commerce" search={{ environment }}>');
  });
});
