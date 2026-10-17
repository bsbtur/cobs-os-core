import { readFileSync } from "node:fs";
import { describe, expect, test } from "bun:test";

const people = readFileSync("src/routes/_authenticated/people.tsx", "utf8");

describe("Manual People RPC staged integration", () => {
  test("keeps RPC disabled before staging grants/RLS validation", () => {
    expect(people).toContain("const ENABLE_MANUAL_PERSON_RPC = false");
    expect(people).toContain("if (ENABLE_MANUAL_PERSON_RPC)");
    expect(people).toContain('supabase.from("people").insert');
  });
  test("prepares isolated RPC with server-side idempotency without modifying other actions", () => {
    expect(people).toContain('rpc("create_person_manual"');
    expect(people).toContain("_idempotency_key: manualCreateAttempt.current.key");
    expect(people).toContain("nextManualPersonAttempt(");
    expect(people).toContain("manualCreateAttempt.current = null");
    expect(people).toContain("onClick={() => { manualCreateAttempt.current = null; setOpen(false); }}");
    expect(people).toContain("onClick={() => { manualCreateAttempt.current = null; setOpen((v) => !v); }}");
    expect(people).toContain('supabase.rpc("link_person_to_profile"');
    expect(people).toContain('supabase.from("people").delete()');
  });
});
