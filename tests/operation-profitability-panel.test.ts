import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import {
  ENABLE_OPERATION_PROFITABILITY_PANEL,
  formatProfitabilityMoney,
  formatProfitabilityPercent,
  profitabilityState,
  type ProfitabilitySummary,
} from "../src/lib/operation-profitability";

const source = readFileSync("src/components/operations/operation-profitability-panel.tsx", "utf8");
const route = readFileSync("src/routes/_authenticated/operations.$operationId.index.tsx", "utf8");
const row: ProfitabilitySummary = {
  tenant_id: "tenant-a", operation_id: "operation-a", expected_paying_passengers: 20,
  gross_revenue_minor: 2000000, selected_cost_minor: 1100000,
  contingency_minor: 100000, tax_fee_minor: 20000,
  total_planned_cost_minor: 1220000, projected_profit_minor: 780000,
  margin_pct: 39, break_even_passengers: 13,
};

describe("operation profitability staged panel", () => {
  test("remains disabled and never requests data while disabled", () => {
    expect(ENABLE_OPERATION_PROFITABILITY_PANEL).toBe(false);
    expect(source).toContain("enabled: ENABLE_OPERATION_PROFITABILITY_PANEL");
    expect(source).toContain("if (!ENABLE_OPERATION_PROFITABILITY_PANEL) return null");
    expect(source).toMatch(/\.eq\("tenant_id", tenantId\)\s*\.eq\("operation_id", operationId\)/);
    expect(route).toContain("<OperationProfitabilityPanel");
    expect(source).not.toMatch(/\.insert\(|\.update\(|\.delete\(|\.rpc\(/);
  });
  test("keeps missing, loading, access error and valid data distinct", () => {
    expect(profitabilityState(true, false, undefined).kind).toBe("loading");
    expect(profitabilityState(false, true, undefined).kind).toBe("error");
    expect(profitabilityState(false, false, null).kind).toBe("missing");
    expect(profitabilityState(false, false, {...row,expected_paying_passengers:null}).kind).toBe("missing");
    const ready = profitabilityState(false, false, row);
    expect(ready.kind).toBe("ready");
  });
  test("uses view values without recalculating margins or inventing missing values", () => {
    expect(formatProfitabilityMoney(12345)).toContain("123,45");
    expect(formatProfitabilityMoney(0)).toContain("0,00");
    expect(formatProfitabilityMoney(null)).toBe("—");
    expect(formatProfitabilityPercent(null)).toBe("—");
    expect(formatProfitabilityPercent(39)).toBe("39%");
    expect(source).toContain("state.summary.margin_pct");
    expect(source).toContain("state.summary.break_even_passengers");
    expect(source).not.toContain("projected_profit_minor /");
  });
});
