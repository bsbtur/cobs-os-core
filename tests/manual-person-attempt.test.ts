import { describe, expect, test } from "bun:test";
import { nextManualPersonAttempt } from "../src/lib/manual-person-attempt";

const input = { full_name: "Joana", email: "JOANA@example.test", phone: "+5561999000000" };
const tenant = "tenant-a";

describe("manual Person idempotency attempt lifecycle", () => {
  test("reuses the same key only for an identical normalized payload", () => {
    let created = 0;
    const generate = () => "key-" + ++created;
    const first = nextManualPersonAttempt(null, tenant, input, generate);
    const retry = nextManualPersonAttempt(first, tenant, { ...input, email: " joana@EXAMPLE.test " }, generate);
    expect(retry.key).toBe(first.key);
    expect(created).toBe(1);
    const changed = nextManualPersonAttempt(retry, tenant, { ...input, phone: "+5561888000000" }, generate);
    expect(changed.key).not.toBe(first.key);
    expect(created).toBe(2);
    const otherTenant = nextManualPersonAttempt(changed, "tenant-b", { ...input, phone: "+5561888000000" }, generate);
    expect(otherTenant.key).not.toBe(changed.key);
  });
  test("a closed or completed form starts a new logical request", () => {
    let created = 0;
    const generate = () => "key-" + ++created;
    const first = nextManualPersonAttempt(null, tenant, input, generate);
    const afterCancel = nextManualPersonAttempt(null, tenant, input, generate);
    const afterSuccess = nextManualPersonAttempt(null, tenant, input, generate);
    expect(new Set([first.key, afterCancel.key, afterSuccess.key]).size).toBe(3);
  });
});
