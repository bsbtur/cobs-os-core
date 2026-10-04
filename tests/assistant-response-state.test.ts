import { describe, expect, test } from "bun:test";
import { ASSISTANT_RESPONSE_WAIT_MS, getAssistantResponseState, getAssistantPollingInterval } from "../src/lib/assistant-response-state";

const now = Date.parse("2026-10-04T18:41:56Z");
const pending = { role: "user", status: "pending", createdAt: new Date(now).toISOString() };

describe("assistant response waiting", () => {
  test("stops the processing indicator exactly at the wait limit", () => {
    expect(getAssistantResponseState(pending, now)).toBe("processing");
    expect(getAssistantResponseState(pending, now + ASSISTANT_RESPONSE_WAIT_MS - 1)).toBe("processing");
    expect(getAssistantResponseState(pending, now + ASSISTANT_RESPONSE_WAIT_MS)).toBe("delayed");
  });

  test("recovers when a late reply completes and exposes actual failures", () => {
    const later = now + ASSISTANT_RESPONSE_WAIT_MS * 2;
    expect(getAssistantResponseState({ ...pending, status: "completed" }, later)).toBeNull();
    expect(getAssistantResponseState({ ...pending, status: "failed" }, now)).toBe("failed");
    expect(getAssistantResponseState({ ...pending, role: "assistant" }, later)).toBeNull();
  });

  test("keeps polling for late answers without indefinitely polling every two seconds", () => {
    expect(getAssistantPollingInterval([pending], now)).toBe(2_000);
    expect(getAssistantPollingInterval([pending], now + ASSISTANT_RESPONSE_WAIT_MS)).toBe(10_000);
    const fresh = { ...pending, createdAt: new Date(now + ASSISTANT_RESPONSE_WAIT_MS).toISOString() };
    expect(getAssistantPollingInterval([pending, fresh], now + ASSISTANT_RESPONSE_WAIT_MS)).toBe(2_000);
    expect(getAssistantPollingInterval([], now)).toBe(10_000);
  });

  test("does not keep an endless processing indicator for unusable timestamps", () => {
    expect(getAssistantResponseState({ ...pending, createdAt: "" }, now)).toBe("delayed");
    expect(getAssistantResponseState({ ...pending, createdAt: new Date(now + 1).toISOString() }, now)).toBe("delayed");
  });
});
