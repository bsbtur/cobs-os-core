import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";

const webhook = readFileSync("supabase/functions/contracts-clicksign-webhook/index.ts", "utf8");
const reconcile = readFileSync("supabase/functions/contracts-clicksign-reconcile/index.ts", "utf8");

describe("Clicksign contract state machine", () => {
  test("webhook advances active states one step at a time and never regresses", () => {
    expect(webhook).toContain("const progression: Record<string, number> = { draft: 0, sent: 1, viewed: 2, signed: 3 }");
    expect(webhook).toContain("nextRank === currentRank + 1");
    expect(webhook).toContain("if (canApplyStatus(current, mapped.status))");
    expect(webhook).not.toContain("if (!terminal || current === mapped.status)");
  });

  test("webhook keeps terminal states immutable while allowing cancellation or expiry from active states", () => {
    expect(webhook).toContain('["signed", "cancelled", "expired", "superseded"].includes(current)');
    expect(webhook).toContain('if (next === "cancelled" || next === "expired") return true');
  });

  test("webhook uses compare-and-set so concurrent provider events cannot overwrite a newer state", () => {
    expect(webhook).toContain('.eq("status", current)');
    expect(webhook).toContain('.select("id,status")');
    expect(webhook).toContain(".maybeSingle()");
    expect(webhook).toContain('error: "contract_changed_during_webhook"');

    const transitionGate = webhook.indexOf("if (canApplyStatus(current, mapped.status))");
    const compareAndSet = webhook.indexOf('.eq("status", current)');
    const lostRace = webhook.indexOf('error: "contract_changed_during_webhook"');
    expect(compareAndSet).toBeGreaterThan(transitionGate);
    expect(lostRace).toBeGreaterThan(compareAndSet);
  });

  test("reconcile cannot promote an unsent draft directly to signed", () => {
    expect(reconcile).toContain('if (!["sent", "viewed"].includes(contract.status))');
    expect(reconcile).toContain('error: "contract_not_sent_to_provider"');

    const sentGate = reconcile.indexOf('if (!["sent", "viewed"].includes(contract.status))');
    const providerRead = reconcile.indexOf("await clicksignEnvelope(contract.provider_envelope_id)");
    const signedUpdate = reconcile.indexOf('.update({ status: "signed"');
    expect(sentGate).toBeGreaterThan(-1);
    expect(providerRead).toBeGreaterThan(sentGate);
    expect(signedUpdate).toBeGreaterThan(providerRead);
  });
});
