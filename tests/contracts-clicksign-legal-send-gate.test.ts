import { readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";

const source = readFileSync("supabase/functions/contracts-clicksign-send/index.ts", "utf8");

describe("contracts-clicksign-send legal gate", () => {
  test("requires an active formally reviewed template before provider interaction", () => {
    expect(source).toContain('from("contract_templates")');
    expect(source).toContain('.eq("status", "active")');
    expect(source).toContain("legal_reviewed_at");
    expect(source).toContain('error: "contract_provider_send_locked"');
    expect(source).toContain('reason: "formal_legal_validation_required"');
  });

  test("requires the generated snapshot to explicitly allow provider send", () => {
    expect(source).toContain("ready_for_provider_send");
    expect(source).toContain('reason: "contract_snapshot_not_sendable"');
  });

  test("runs the legal gate before reading the PDF or calling Clicksign", () => {
    const gate = source.indexOf('from("contract_templates")');
    const pdf = source.indexOf('storage.from("customer-contracts").download');
    const provider = source.indexOf('await cs("/envelopes"');
    expect(gate).toBeGreaterThan(-1);
    expect(pdf).toBeGreaterThan(gate);
    expect(provider).toBeGreaterThan(gate);
  });
});
