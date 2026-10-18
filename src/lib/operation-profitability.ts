export const ENABLE_OPERATION_PROFITABILITY_PANEL = false;

export type ProfitabilitySummary = {
  tenant_id: string;
  operation_id: string;
  expected_paying_passengers: number | null;
  gross_revenue_minor: number | null;
  selected_cost_minor: number | null;
  contingency_minor: number | null;
  tax_fee_minor: number | null;
  total_planned_cost_minor: number | null;
  projected_profit_minor: number | null;
  margin_pct: number | null;
  break_even_passengers: number | null;
};

export type ProfitabilityState =
  | { kind: "loading" }
  | { kind: "error" }
  | { kind: "missing" }
  | { kind: "ready"; summary: ProfitabilitySummary };

export function profitabilityState(
  loading: boolean,
  error: boolean,
  summary: ProfitabilitySummary | null | undefined,
): ProfitabilityState {
  if (loading) return { kind: "loading" };
  if (error) return { kind: "error" };
  if (!summary || summary.expected_paying_passengers == null) return { kind: "missing" };
  return { kind: "ready", summary };
}

export function formatProfitabilityMoney(value: number | null): string {
  if (value == null || !Number.isFinite(value)) return "—";
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value / 100);
}

export function formatProfitabilityPercent(value: number | null): string {
  if (value == null || !Number.isFinite(value)) return "—";
  return new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 2 }).format(value) + "%";
}
