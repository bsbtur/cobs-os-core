import { describe, expect, test } from "bun:test";
import { validateDispatchInput, validateResultInput } from "./contract";

const tenantId = "11111111-1111-4111-8111-111111111111";
const eventId = "22222222-2222-4222-8222-222222222222";

describe("automation gateway contract", () => {
  test("accepts the commercial lead event", () => {
    expect(
      validateDispatchInput({
        tenant_id: tenantId,
        event_type: "lead.created",
        idempotency_key: "lead:landing:123",
        payload: { name: "Ana", message: "Quero saber o preço" },
      }),
    ).toBeNull();
  });

  test("rejects unsupported commands before an n8n execution", () => {
    expect(
      validateDispatchInput({
        tenant_id: tenantId,
        event_type: "payment.approve",
        idempotency_key: "payment:123",
        payload: {},
      }),
    ).toBe("unsupported_event_type");
  });

  test("accepts a bounded structured result", () => {
    expect(
      validateResultInput({
        event_id: eventId,
        tenant_id: tenantId,
        outcome: "completed",
        intent: "price",
        urgency: "high",
        summary: "Lead pediu preço do pacote.",
        suggested_reply: "Olá! Vou apresentar as opções do CIOSP 2027.",
      }),
    ).toBeNull();
  });

  test("rejects unbounded model output", () => {
    expect(
      validateResultInput({
        event_id: eventId,
        tenant_id: tenantId,
        outcome: "completed",
        intent: "price",
        urgency: "high",
        summary: "ok",
        suggested_reply: "x".repeat(601),
      }),
    ).toBe("invalid_suggested_reply");
  });
});
