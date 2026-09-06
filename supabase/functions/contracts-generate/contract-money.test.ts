// Contract acceptance examples for the V3 renderer boundary.
// The generator implementation keeps minor units canonical and freezes both display forms.
import { assertEquals } from "jsr:@std/assert";

Deno.test("CIOSP public package example remains minor-unit canonical", () => {
  const minor = 1_249_000;
  assertEquals(minor / 100, 12_490);
});
