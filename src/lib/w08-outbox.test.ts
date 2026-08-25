import { describe, expect, it } from "vitest";

import {
  OUTBOX_STATUSES,
  canRetryOutbox,
  lastRelevantOutboxTimestamp,
  summarizeOutbox,
  type OutboxRow,
  type OutboxStatus,
} from "@/lib/w08";

function row(overrides: Partial<OutboxRow>): OutboxRow {
  return {
    id: "o1",
    message_id: "m1",
    person_id: "p1",
    channel: "test",
    status: "queued",
    attempt_count: 0,
    next_attempt_at: null,
    last_error_code: null,
    last_error_message: null,
    accepted_at: null,
    sent_at: null,
    delivered_at: null,
    read_at: null,
    failed_at: null,
    dead_lettered_at: null,
    updated_at: "2026-08-25T12:00:00Z",
    ...overrides,
  };
}

describe("w08 outbox — status contract", () => {
  it("covers exactly the nine documented statuses", () => {
    expect(OUTBOX_STATUSES).toEqual([
      "queued",
      "processing",
      "accepted",
      "sent",
      "delivered",
      "read",
      "retry_wait",
      "failed",
      "dead_letter",
    ]);
  });

  it("allows manual retry only for failed and dead_letter", () => {
    const retryable: OutboxStatus[] = ["failed", "dead_letter"];
    for (const status of OUTBOX_STATUSES) {
      expect(canRetryOutbox(status)).toBe(retryable.includes(status));
    }
  });
});

describe("w08 outbox — lastRelevantOutboxTimestamp", () => {
  it("prefers read over every earlier fact", () => {
    const r = row({
      status: "read",
      accepted_at: "2026-08-25T12:01:00Z",
      sent_at: "2026-08-25T12:02:00Z",
      delivered_at: "2026-08-25T12:03:00Z",
      read_at: "2026-08-25T12:04:00Z",
    });
    expect(lastRelevantOutboxTimestamp(r)).toBe("2026-08-25T12:04:00Z");
  });

  it("falls back to the failure timestamp for failed rows", () => {
    const r = row({ status: "failed", failed_at: "2026-08-25T12:05:00Z" });
    expect(lastRelevantOutboxTimestamp(r)).toBe("2026-08-25T12:05:00Z");
  });

  it("falls back to updated_at when no lifecycle timestamp exists", () => {
    const r = row({ status: "queued" });
    expect(lastRelevantOutboxTimestamp(r)).toBe("2026-08-25T12:00:00Z");
  });

  it("returns null when nothing is known", () => {
    expect(lastRelevantOutboxTimestamp(row({ updated_at: null }))).toBeNull();
  });
});

describe("w08 outbox — summarizeOutbox", () => {
  it("counts per status, omits empty statuses and keeps stable order", () => {
    const rows = [
      row({ id: "1", status: "read" }),
      row({ id: "2", status: "failed" }),
      row({ id: "3", status: "read" }),
      row({ id: "4", status: "queued" }),
    ];
    expect(summarizeOutbox(rows)).toEqual([
      { status: "queued", count: 1 },
      { status: "read", count: 2 },
      { status: "failed", count: 1 },
    ]);
  });

  it("summarizes an empty list to an empty strip", () => {
    expect(summarizeOutbox([])).toEqual([]);
  });
});
