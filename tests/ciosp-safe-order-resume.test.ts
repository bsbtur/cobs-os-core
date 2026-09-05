import { readFileSync } from "node:fs";
import { describe, expect, it } from "bun:test";

const source = readFileSync(
  "supabase/functions/ciosp-public-order-status/index.ts",
  "utf8",
);

describe("CIOSP safe order resume", () => {
  it("requires a session-bound proof and never accepts email-only lookup", () => {
    expect(source).toContain('token_hash", hash');
    expect(source).toContain("invalid_resume_proof");
    expect(source).not.toContain("payer_email");
    expect(source).not.toContain("user_metadata");
  });

  it("returns balance and next installment without exposing provider snapshots", () => {
    expect(source).toContain("balance_minor");
    expect(source).toContain("next_installment");
    expect(source).not.toContain("response_snapshot");
    expect(source).not.toContain("pix_qr_code");
  });
});
