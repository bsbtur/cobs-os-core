import * as React from "react";
import { createFileRoute, Link, useParams } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Award, CheckCircle2, Clock3, FileCheck2, MessageCircle, Route as RouteIcon, ShieldCheck, Trophy } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { PanelSkeleton } from "@/components/feedback/loading";

export const Route = createFileRoute("/_authenticated/operations/$operationId/excellence")({
  head: () => ({ meta: [{ title: "Excelência Operacional — COBS OS" }, { name: "robots", content: "noindex" }] }),
  component: OperationalExcellenceProduct,
});

type EvidenceRow = { dimension_key: string; outcome: string; points_awarded: number; points_possible: number; evidence: unknown };
type ExcellencePayload = {
  available: boolean;
  reason?: string;
  operation: { id: string; code: string; name: string; status: string };
  snapshot?: { id: string; score: number; rounded_score: number; classification: string; evaluation_status: string; coverage_percent: number };
  evidence?: EvidenceRow[];
};
type RpcClient = { rpc: (name: string, args?: Record<string, unknown>) => Promise<{ data: unknown; error: unknown }> };

const meta: Record<string, { label: string; icon: React.ComponentType<{ className?: string }> }> = {
  journey_execution: { label: "Execução da jornada", icon: RouteIcon },
  temporal_precision: { label: "Precisão temporal", icon: Clock3 },
  operational_compliance: { label: "Conformidade operacional", icon: ShieldCheck },
  flow_traceability: { label: "Rastreabilidade do fluxo", icon: FileCheck2 },
  communication_readiness: { label: "Comunicação operacional", icon: MessageCircle },
};

function classificationLabel(value?: string) {
  if (value === "gold") return "Operação Ouro";
  if (value === "silver") return "Operação Prata";
  if (value === "bronze") return "Operação Bronze";
  return "Operação em evolução";
}

function OperationalExcellenceProduct() {
  const { operationId } = useParams({ from: "/_authenticated/operations/$operationId/excellence" });
  const result = useQuery({
    queryKey: ["operation-excellence", operationId],
    queryFn: async () => {
      const client = supabase as unknown as RpcClient;
      const { data, error } = await client.rpc("get_operation_excellence", { _operation_id: operationId });
      if (error) throw error;
      return data as ExcellencePayload;
    },
  });

  if (result.isLoading) return <PanelSkeleton rows={5} />;
  if (result.isError) return <div className="surface-panel p-6"><h2 className="text-lg font-semibold">Excelência indisponível</h2><p className="mt-2 text-sm text-muted-foreground">Você não tem acesso a este resultado ou ele não pôde ser carregado.</p></div>;

  const data = result.data;
  if (!data?.available || !data.snapshot) {
    const cancelled = data?.reason === "cancelled";
    return <div className="space-y-5"><header><p className="font-mono text-[10px] uppercase tracking-[0.18em] text-primary">Excelência operacional</p><h2 className="mt-1 text-2xl font-semibold">{data?.operation?.name ?? "Operação"}</h2></header><section className="surface-panel p-6"><Award className="size-8 text-muted-foreground"/><h3 className="mt-3 text-lg font-semibold">{cancelled ? "Operação cancelada" : "Resultado final ainda não disponível"}</h3><p className="mt-2 text-sm text-muted-foreground">{cancelled ? "Operações canceladas não recebem classificação normal de excelência." : "A nota nasce somente quando a operação é concluída e o snapshot final canônico é congelado."}</p></section><Button variant="outline" asChild><Link to="/operations/$operationId" params={{ operationId }}>Voltar para a operação</Link></Button></div>;
  }

  const snapshot = data.snapshot;
  const evidence = data.evidence ?? [];
  const applicable = evidence.filter((row) => row.outcome !== "not_applicable");
  const earned = applicable.reduce((sum, row) => sum + Number(row.points_awarded || 0), 0);
  const possible = applicable.reduce((sum, row) => sum + Number(row.points_possible || 0), 0);
  const lost = Math.max(0, possible - earned);

  return <div className="mx-auto max-w-3xl space-y-5 pb-8">
    <header className="flex flex-wrap items-end justify-between gap-3"><div><p className="font-mono text-[10px] uppercase tracking-[0.18em] text-primary">Operational Excellence · somente leitura</p><h2 className="mt-1 text-2xl font-semibold">{data.operation.name}</h2><p className="mt-1 text-sm text-muted-foreground">{data.operation.code}</p></div><Button variant="outline" asChild><Link to="/operations/$operationId" params={{ operationId }}>Voltar</Link></Button></header>
    <section className="surface-panel relative overflow-hidden p-6 text-center sm:p-8"><div className="mx-auto grid size-20 place-items-center rounded-full border border-amber-500/30 bg-amber-500/10"><Trophy className="size-10 text-amber-500"/></div><p className="mt-4 font-mono text-[10px] uppercase tracking-[0.2em] text-amber-600 dark:text-amber-400">Excelência operacional</p><h1 className="mt-2 text-3xl font-bold">{classificationLabel(snapshot.classification)}</h1><div className="mt-2 text-6xl font-black tracking-tight">{snapshot.rounded_score}%</div><p className="mt-3 text-sm text-muted-foreground">Snapshot final canônico · congelado · cobertura {Number(snapshot.coverage_percent).toLocaleString("pt-BR")}%</p></section>
    <section className="grid gap-3 sm:grid-cols-3"><div className="surface-panel p-4"><p className="text-xs text-muted-foreground">Pontos conquistados</p><p className="mt-1 text-2xl font-bold">{earned.toFixed(1)}</p></div><div className="surface-panel p-4"><p className="text-xs text-muted-foreground">Pontos perdidos</p><p className="mt-1 text-2xl font-bold">{lost.toFixed(1)}</p></div><div className="surface-panel p-4"><p className="text-xs text-muted-foreground">Evidências</p><p className="mt-1 text-2xl font-bold">{evidence.length}</p></div></section>
    <section className="surface-panel p-5"><div className="flex items-center gap-2"><Award className="size-5 text-primary"/><h3 className="font-semibold">Por que recebi esta nota?</h3></div><div className="mt-4 space-y-3">{evidence.map((row, index) => { const item = meta[row.dimension_key] ?? { label: row.dimension_key, icon: CheckCircle2 }; const Icon = item.icon; const ratio = Number(row.points_possible) > 0 ? Math.round((Number(row.points_awarded) / Number(row.points_possible)) * 100) : null; return <div key={`${row.dimension_key}-${index}`} className="rounded-xl border border-border bg-elevated/40 p-4"><div className="flex items-center justify-between gap-3"><div className="flex items-center gap-2"><Icon className="size-4 text-primary"/><span className="font-medium">{item.label}</span></div><span className="font-mono text-xs">{row.outcome === "not_applicable" ? "N/A" : `${ratio}%`}</span></div><div className="mt-3 h-2 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full bg-primary" style={{ width: `${ratio ?? 0}%` }}/></div><p className="mt-2 text-xs text-muted-foreground">{Number(row.points_awarded).toFixed(2)} / {Number(row.points_possible).toFixed(2)} pontos · evidência canônica</p></div>; })}</div></section>
    <p className="text-center text-xs text-muted-foreground">A interface não recalcula nem altera a nota. O resultado é lido exclusivamente do snapshot final autorizado.</p>
  </div>;
}
