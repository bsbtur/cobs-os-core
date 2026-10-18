import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  ENABLE_OPERATION_PROFITABILITY_PANEL,
  formatProfitabilityMoney,
  formatProfitabilityPercent,
  profitabilityState,
  type ProfitabilitySummary,
} from "@/lib/operation-profitability";

type SummaryClient = {
  select: (columns: string) => {
    eq: (column: string, value: string) => {
      eq: (column: string, value: string) => {
        maybeSingle: () => Promise<{ data: ProfitabilitySummary | null; error: { message: string } | null }>;
      };
    };
  };
};

export function OperationProfitabilityPanel({
  tenantId,
  operationId,
}: {
  tenantId: string;
  operationId: string;
}) {
  const summary = useQuery({
    queryKey: ["operation-profitability-summary", tenantId, operationId],
    enabled: ENABLE_OPERATION_PROFITABILITY_PANEL && Boolean(tenantId && operationId),
    queryFn: async () => {
      // View is already security_invoker=true; access is additionally restricted by tenant and operation.
      const view = supabase.from("operation_profitability_summary" as never) as unknown as SummaryClient;
      const { data, error } = await view.select("*").eq("tenant_id", tenantId).eq("operation_id", operationId).maybeSingle();
      if (error) throw error;
      return data;
    },
    retry: false,
  });

  if (!ENABLE_OPERATION_PROFITABILITY_PANEL) return null;

  const state = profitabilityState(summary.isPending, summary.isError, summary.data);
  return (
    <section className="surface-panel space-y-4 p-5" aria-label="Rentabilidade da operação">
      <div>
        <h3 className="text-lg font-semibold">Rentabilidade da operação</h3>
        <p className="text-xs text-muted-foreground">Projeção financeira · Somente leitura</p>
      </div>
      {state.kind === "loading" ? (
        <p role="status">Carregando projeção financeira…</p>
      ) : state.kind === "error" ? (
        <p role="alert">Não foi possível consultar a rentabilidade. Verifique o acesso ou tente novamente.</p>
      ) : state.kind === "missing" ? (
        <p>Planejamento financeiro ainda não disponível.</p>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {([
            ["Receita projetada", formatProfitabilityMoney(state.summary.gross_revenue_minor)],
            ["Custo planejado", formatProfitabilityMoney(state.summary.total_planned_cost_minor)],
            ["Lucro projetado", formatProfitabilityMoney(state.summary.projected_profit_minor)],
            ["Margem projetada", formatProfitabilityPercent(state.summary.margin_pct)],
            ["Ponto de equilíbrio", state.summary.break_even_passengers == null ? "—" : String(state.summary.break_even_passengers) + " passageiros"],
          ] as const).map(([label, value]) => (
            <div key={label} className="rounded-lg border border-border p-3">
              <p className="text-xs text-muted-foreground">{label}</p>
              <p className="text-lg font-semibold tabular-nums">{value}</p>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
