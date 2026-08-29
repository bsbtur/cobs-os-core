import { useQuery } from "@tanstack/react-query";
import { CheckCircle2, CircleAlert, FileCheck2, Landmark, ShieldCheck } from "lucide-react";

import { PanelSkeleton } from "@/components/feedback/loading";
import { supabase } from "@/integrations/supabase/client";

type ReadinessRow = {
  participation_id: string;
  person_id: string;
  full_name: string;
  email: string | null;
  participation_status: "expected" | "confirmed" | "cancelled";
  finance_ok: boolean;
  contract_ok: boolean;
  documentation_state: string;
  documentation_ok: boolean;
  documentation_satisfied: number;
  documentation_required: number;
  ready_to_board: boolean;
};

function Gate({ label, ok, detail }: { label: string; ok: boolean; detail?: string }) {
  return (
    <span
      className={`inline-flex min-h-8 items-center gap-1.5 rounded-full border px-2.5 text-xs font-medium ${
        ok
          ? "border-success/30 bg-success/10 text-success"
          : "border-warning/40 bg-warning/10 text-warning"
      }`}
    >
      {ok ? <CheckCircle2 className="size-3.5" aria-hidden="true" /> : <CircleAlert className="size-3.5" aria-hidden="true" />}
      {label}{detail ? ` · ${detail}` : ""}
    </span>
  );
}

export function ParticipantReadinessPanel({ operationId }: { operationId: string }) {
  const readiness = useQuery({
    queryKey: ["operation-participant-readiness", operationId],
    queryFn: async () => {
      const db = supabase as any;
      const { data, error } = await db
        .from("operation_participant_readiness")
        .select("participation_id,person_id,full_name,email,participation_status,finance_ok,contract_ok,documentation_state,documentation_ok,documentation_satisfied,documentation_required,ready_to_board")
        .eq("operation_id", operationId)
        .order("full_name");
      if (error) throw error;
      return (data ?? []) as ReadinessRow[];
    },
  });

  if (readiness.isLoading) return <PanelSkeleton rows={2} />;
  if (readiness.isError) {
    return (
      <section className="surface-panel border-warning/30 p-4">
        <p className="text-sm font-medium">Gate de embarque indisponível</p>
        <p className="mt-1 text-xs text-muted-foreground">Não foi possível carregar Financeiro + Contrato + Documentação agora.</p>
      </section>
    );
  }

  const rows = (readiness.data ?? []).filter((row) => row.participation_status !== "cancelled");
  if (!rows.length) return null;
  const ready = rows.filter((row) => row.ready_to_board).length;

  return (
    <section className="surface-panel overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-4 py-3">
        <div>
          <div className="flex items-center gap-2">
            <ShieldCheck className="size-4 text-primary" aria-hidden="true" />
            <h3 className="font-semibold">Aptidão para embarque</h3>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">Gate derivado de fatos reais: financeiro, contrato, documentação e participação.</p>
        </div>
        <span className={`rounded-full px-3 py-1 text-sm font-semibold ${ready === rows.length ? "bg-success/10 text-success" : "bg-warning/10 text-warning"}`}>
          {ready}/{rows.length} aptos
        </span>
      </div>

      <div className="divide-y divide-border">
        {rows.map((row) => (
          <div key={row.participation_id} className="space-y-3 px-4 py-3">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <p className="text-sm font-semibold">{row.full_name}</p>
                <p className="text-xs text-muted-foreground">{row.email ?? "—"}</p>
              </div>
              <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${row.ready_to_board ? "bg-success/10 text-success" : "bg-warning/10 text-warning"}`}>
                {row.ready_to_board ? "APTO PARA EMBARQUE" : "PENDÊNCIAS"}
              </span>
            </div>

            <div className="flex flex-wrap gap-2">
              <Gate label="Financeiro" ok={row.finance_ok} />
              <Gate label="Contrato" ok={row.contract_ok} />
              <Gate
                label="Documentos"
                ok={row.documentation_ok}
                detail={row.documentation_required > 0 ? `${row.documentation_satisfied}/${row.documentation_required}` : row.documentation_state === "not_configured" ? "não configurado" : undefined}
              />
              <span className="inline-flex min-h-8 items-center gap-1.5 rounded-full border border-border px-2.5 text-xs text-muted-foreground">
                <Landmark className="size-3.5" aria-hidden="true" />
                Participação · {row.participation_status === "confirmed" ? "confirmada" : "esperada"}
              </span>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
