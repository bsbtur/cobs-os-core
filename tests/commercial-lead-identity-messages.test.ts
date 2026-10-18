import { readFileSync } from "node:fs";
import { describe, expect, test } from "bun:test";

const auth = readFileSync("src/lib/auth.tsx", "utf8");

describe("commercial lead identity error copy", () => {
  test("humanizes ambiguous identity conflicts without leaking internals", () => {
    expect(auth).toContain("/commercial_lead_identity_conflict/i");
    expect(auth).toContain(
      "Este lead conflita com uma Pessoa já cadastrada. Revise e-mail e telefone antes de aprovar.",
    );
  });

  test("humanizes historical identity review without suggesting automatic relink", () => {
    expect(auth).toContain("/commercial_lead_historical_identity_review_required/i");
    expect(auth).toContain(
      "Este lead já possui um vínculo histórico com dados divergentes. Revise manualmente; o COBS não vai relinkar a Pessoa automaticamente.",
    );
  });
});
