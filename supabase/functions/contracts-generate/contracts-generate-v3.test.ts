// Structural regression tests for contracts-generate V3.
// These assertions intentionally avoid provider/network calls.
import { assert, assertMatch } from "jsr:@std/assert";

const source = await Deno.readTextFile(new URL("./index.ts", import.meta.url));

Deno.test("V3 generation is provider-neutral", () => {
  assert(!source.includes("!template.provider_template_id"));
  assert(source.includes('if (!template.legal_reviewed_at)'));
});

Deno.test("V3 freezes formatted total, words, payment plan and offer snapshot", () => {
  for (const field of ["grand_total_formatted", "grand_total_in_words", "payment_plan_display", "offer_snapshot"]) {
    assert(source.includes(field), `missing ${field}`);
  }
  assert(source.includes('schema_version: "contract-snapshot-v2"'));
});

Deno.test("V3 refuses generation without frozen commercial evidence", () => {
  assertMatch(source, /payment_plan_required/);
  assertMatch(source, /offer_snapshot_required/);
});

Deno.test("concurrent unique violation recovers as idempotent", () => {
  assert(source.includes('createError.code === "23505"'));
  assert(source.includes("raceExisting"));
});
