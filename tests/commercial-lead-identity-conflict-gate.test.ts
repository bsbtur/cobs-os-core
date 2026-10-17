import { readFileSync } from "node:fs";
import { describe, expect, test } from "bun:test";

const migration = readFileSync(
  "supabase/migrations/20261016233000_commercial_lead_identity_conflict_gate_v1.sql",
  "utf8",
);

describe("Commercial lead identity collision gate", () => {
  test("keeps tenant-scoped email and phone matches and blocks multiple people", () => {
    expect(migration).toContain("where p.tenant_id = _lead.tenant_id");
    expect(migration).toContain("lower(btrim(p.email)) = lower(btrim(_lead.email))");
    expect(migration).toContain("p.phone_e164 = _phone");
    expect(migration).toContain("if _matched_count > 1 then");
    expect(migration).toContain("commercial_lead_identity_conflict");
  });

  test("blocks conflicting non-empty details on the single matched person", () => {
    expect(migration).toContain("p.phone_e164 <> _phone");
    expect(migration).toContain("lower(btrim(p.email)) <> lower(btrim(_lead.email))");
    expect(migration).toContain("coalesce(_email_mismatch, false) or coalesce(_phone_mismatch, false)");
  });

  test("serializes email and phone before checking for existing people", () => {
    const emailLock = migration.indexOf("pg_advisory_xact_lock(pg_catalog.hashtextextended(_lead.tenant_id::text || ':email:'");
    const phoneLock = migration.indexOf("pg_advisory_xact_lock(pg_catalog.hashtextextended(_lead.tenant_id::text || ':phone:'");
    const identityMatch = migration.indexOf("select array_agg(p.id order by p.id)");
    expect(emailLock).toBeGreaterThan(-1);
    expect(phoneLock).toBeGreaterThan(emailLock);
    expect(identityMatch).toBeGreaterThan(phoneLock);
  });

  test("runs the gate before selecting or creating a person", () => {
    const gate = migration.indexOf("if _matched_count > 1 then");
    const personLookup = migration.indexOf("select * into _person\n    from public.people p");
    const insert = migration.indexOf("insert into public.people");
    expect(gate).toBeGreaterThan(-1);
    expect(personLookup).toBeGreaterThan(gate);
    expect(insert).toBeGreaterThan(gate);
  });

  test("preserves the approved converter interface and authenticated-only access", () => {
    expect(migration).toContain("function public.convert_commercial_lead_to_person(_lead_id uuid)");
    expect(migration).toContain("app_private.w09_require_commerce_manager(_lead.tenant_id)");
  });
});
