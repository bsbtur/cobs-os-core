import { describe, expect, it } from "vitest";

import type { RuntimeRpcDatabase } from "@/integrations/supabase/runtime-rpc-types";

type PrecisionArgs = RuntimeRpcDatabase["public"]["Functions"]["set_event_schedule_precision"]["Args"];

describe("set_event_schedule_precision contract", () => {
  it("requires event, precision and idempotency key", () => {
    const args: PrecisionArgs = {
      _event_id: "00000000-0000-0000-0000-000000000001",
      _schedule_precision: "date_only",
      _idempotency_key: "event-precision-contract-test",
    };

    expect(args._event_id).toBeTruthy();
    expect(args._schedule_precision).toBe("date_only");
    expect(args._idempotency_key.length).toBeGreaterThan(7);
  });
});
