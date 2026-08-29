import { describe, expect, test } from "bun:test";
import {
  validateDispatchInput,
  validateResultForEvent,
  validateResultInput,
} from "../supabase/functions/automation-gateway/contract";

const tenantId = "869e78d3-5192-42d1-bd1f-97b02d9227a1";
const eventId = "44444444-4444-4444-8444-444444444444";

const structuredLeadResult = {
  event_id: eventId,
  tenant_id: tenantId,
  outcome: "completed",
  intent: "price",
  urgency: "low",
  summary: "Cliente deseja saber o preço.",
  suggested_reply: "A equipe comercial apresentará as opções.",
  provider_metadata: { workflow: "cobs-commercial-lead-v1" },
};

const orderResult = {
  event_id: eventId,
  tenant_id: tenantId,
  outcome: "completed",
  provider_metadata: {
    workflow: "cobs-order-confirmed-v1",
    action: "onboarding_prepared",
  },
};

describe("automation gateway contracts", () => {
  test("accepts lead.created dispatch", () => {
    expect(
      validateDispatchInput({
        tenant_id: tenantId,
        operation_id: null,
        event_type: "lead.created",
        idempotency_key: "qa:lead:contract:01",
        payload: { name: "Lead QA", message: "Quero saber o preço" },
      }),
    ).toBeNull();
  });

  test("accepts order.confirmed dispatch", () => {
    expect(
      validateDispatchInput({
        tenant_id: tenantId,
        operation_id: null,
        event_type: "order.confirmed",
        idempotency_key: "order.confirmed:44444444-4444-4444-8444-444444444444",
        payload: { order_id: eventId, confirmation_mode: "manual" },
      }),
    ).toBeNull();
  });

  test("rejects unsupported event type", () => {
    expect(
      validateDispatchInput({
        tenant_id: tenantId,
        event_type: "payment.approved",
        idempotency_key: "qa:unsupported:01",
        payload: {},
      }),
    ).toBe("unsupported_event_type");
  });

  test("keeps structured lead completion valid", () => {
    expect(validateResultInput(structuredLeadResult)).toBeNull();
    expect(validateResultForEvent(structuredLeadResult, "lead.created")).toBeNull();
  });

  test("requires structured fields for completed lead result", () => {
    expect(validateResultForEvent(orderResult, "lead.created")).toBe("missing_lead_result_fields");
  });

  test("accepts metadata-only order completion", () => {
    expect(validateResultInput(orderResult)).toBeNull();
    expect(validateResultForEvent(orderResult, "order.confirmed")).toBeNull();
  });

  test("rejects lead fields on order completion", () => {
    expect(validateResultForEvent(structuredLeadResult, "order.confirmed")).toBe(
      "unexpected_lead_result_fields",
    );
  });

  test("rejects malformed provider metadata", () => {
    expect(
      validateResultInput({
        event_id: eventId,
        tenant_id: tenantId,
        outcome: "completed",
        provider_metadata: "invalid",
      }),
    ).toBe("invalid_provider_metadata");
  });
});
