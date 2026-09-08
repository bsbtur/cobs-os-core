import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";

const migration = readFileSync(
  "supabase/migrations/20260908012000_expire_staff_journey_alerts_at_milestone_v1.sql",
  "utf8",
);

describe("staff journey alert expiry", () => {
  test("expires each reminder at its milestone", () => {
    expect(migration).toContain("published_at,expires_at");
    expect(migration).toMatch(/now\(\),\s*_candidate\.milestone_at/);
  });

  test("preserves explicit-person delivery and existing alert identity", () => {
    expect(migration).toContain("'explicit_person'");
    expect(migration).toContain("'px12_staff_journey_alert'");
    expect(migration).toContain("'staff_alert_key'");
  });

  test("does not introduce destructive cleanup for historical alerts", () => {
    expect(migration).not.toMatch(/delete\s+from\s+public\.messages/i);
    expect(migration).not.toMatch(/update\s+public\.messages\s+set\s+status\s*=\s*'cancelled'/i);
  });
});
