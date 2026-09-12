import { readFileSync } from "node:fs";
import { describe, expect, it } from "bun:test";

const source = readFileSync("src/routes/ciosp-2027_.reserva.tsx", "utf8");

describe("CIOSP reservation reload idempotency", () => {
  it("persists only the checkout idempotency key in sessionStorage", () => {
    expect(source).toContain('const CHECKOUT_IDEMPOTENCY_SESSION_KEY = "cobs:ciosp-2027:reserva:idempotency-key"');
    expect(source).toContain("window.sessionStorage.getItem(CHECKOUT_IDEMPOTENCY_SESSION_KEY)");
    expect(source).toContain("window.sessionStorage.setItem(CHECKOUT_IDEMPOTENCY_SESSION_KEY, created)");
  });

  it("reuses the persisted key when creating the checkout order", () => {
    expect(source).toContain("const idempotencyKey = useMemo(getCheckoutIdempotencyKey, [])");
    expect(source).toContain("idempotency_key: idempotencyKey");
  });

  it("does not persist the checkout token or Pix payload in browser storage", () => {
    expect(source).not.toMatch(/sessionStorage\.setItem\([^\n]*(checkout_token|qr_code|ticket_url)/);
    expect(source).not.toMatch(/localStorage\.setItem/);
  });
});
