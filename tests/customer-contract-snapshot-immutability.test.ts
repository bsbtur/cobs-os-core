import { readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";

const migration = readFileSync(
  "supabase/migrations/20260907051500_customer_contract_snapshot_immutability_v1.sql",
  "utf8",
);

describe("customer contract snapshot immutability", () => {
  test("freezes an existing CIOSP-2027 contract_snapshot", () => {
    expect(migration).toContain("old.template_key <> 'CIOSP-2027'");
    expect(migration).toContain("old.metadata->'contract_snapshot'");
    expect(migration).toContain("new.metadata->'contract_snapshot'");
    expect(migration).toContain("v_old_snapshot is distinct from v_new_snapshot");
    expect(migration).toContain("contract_snapshot_immutable");
  });

  test("allows metadata updates outside the frozen snapshot", () => {
    expect(migration).toContain("before update of metadata");
    expect(migration).not.toContain("old.metadata is distinct from new.metadata");
    expect(migration).toContain("allowing unrelated provider/operational metadata updates");
  });

  test("does not create legal approval, contracts or provider/payment actions", () => {
    expect(migration).not.toMatch(/insert\s+into\s+public\.customer_contracts/i);
    expect(migration).not.toMatch(/update\s+public\.contract_templates/i);
    expect(migration).not.toMatch(/update\s+public\.privacy_policy_versions/i);
    expect(migration.toLowerCase()).not.toContain("clicksign");
    expect(migration.toLowerCase()).not.toContain("payment_charges");
  });
});
