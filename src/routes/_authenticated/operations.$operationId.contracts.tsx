import { createFileRoute, useParams } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { CheckCircle2, Clock3, FileText, XCircle } from "lucide-react";

import { Button } from "@/components/ui/button";
import { PanelSkeleton } from "@/components/feedback/loading";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/_authenticated/operations/$operationId/contracts")({
  component: OperationContracts,
});

const db = supabase as any;
const STATUS_LABEL: Record<string, string> = {
  draft: "Rascunho",
  sent: "Aguardando assinatura",
  viewed: "Visualizado",
  signed: "Assinado",
  cancelled: "Cancelado",
  expired: "Expirado",
  superseded: "Substituído",
};

function Metric({ label, value, tone = "default" }: { label: string; value: number; tone?: "default" | "success" | "warning" | "danger" }) {
  const Icon = tone === "success" ? CheckCircle2 : tone === "danger" ? XCircle : tone === "warning" ? Clock3 : FileText;
  return <div className="surface-panel p-4"><div className="flex items-center justify-between gap-3"><p className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">{label}</p><Icon className="size-4 text-muted-foreground" aria-hidden="true" /></div><p className="mt-2 text-2xl font-semibold">{value}</p></div>;
}

const when = (value?: string | null) => value ? new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short", timeZone: "America/Sao_Paulo" }).format(new Date(value)) : "—";

function OperationContracts() {
  const { operationId } = useParams({ from: "/_authenticated/operations/$operationId/contracts" });

  const summary = useQuery({
    queryKey: ["operation-contract-summary", operationId],
    queryFn: async () => {
      const { data, error } = await db.from("operation_contract_summary").select("*").eq("operation_id", operationId).maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const contracts = useQuery({
    queryKey: ["operation-contracts", operationId],
    queryFn: async () => {
      const { data, error } = await db.from("customer_contracts").select("id,status,customer_person_id,template_key,template_version,sent_at,viewed_at,signed_at,cancelled_at,signed_document_path,created_at,person:people!customer_contracts_customer_person_id_fkey(full_name,email)").eq("operation_id", operationId).order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  const events = useQuery({
    queryKey: ["operation-contract-events", operationId],
    enabled: (contracts.data?.length ?? 0) > 0,
    queryFn: async () => {
      const ids = (contracts.data ?? []).map((c: any) => c.id);
      if (!ids.length) return [];
      const { data, error } = await db.from("contract_events").select("id,contract_id,event_type,source,event_at").in("contract_id", ids).order("event_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  if (summary.isLoading || contracts.isLoading) return <PanelSkeleton rows={5} />;
  const s: any = summary.data ?? {};
  const rows: any[] = contracts.data ?? [];
  const eventRows: any[] = events.data ?? [];

  const openSignedDocument = async (path: string) => {
    const { data, error } = await db.storage.from("customer-contracts").createSignedUrl(path, 60);
    if (error) throw error;
    window.open(data.signedUrl, "_blank", "noopener,noreferrer");
  };

  return <div className="space-y-6">
    <section><h2 className="text-2xl font-semibold">Contratos</h2><p className="text-sm text-muted-foreground">Envio → visualização → assinatura → documento final → auditoria.</p></section>

    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
      <Metric label="Total" value={Number(s.total_contracts ?? rows.length)} />
      <Metric label="Aguardando" value={Number(s.awaiting_signature ?? rows.filter((r) => ["sent","viewed"].includes(r.status)).length)} tone="warning" />
      <Metric label="Visualizados" value={Number(s.viewed_contracts ?? rows.filter((r) => r.status === "viewed").length)} />
      <Metric label="Assinados" value={Number(s.signed_contracts ?? rows.filter((r) => r.status === "signed").length)} tone="success" />
      <Metric label="Cancelados / expirados" value={Number(s.cancelled_contracts ?? 0) + Number(s.expired_contracts ?? 0)} tone="danger" />
    </div>

    <section className="surface-panel overflow-hidden">
      <div className="border-b border-border px-4 py-3"><h3 className="font-semibold">Contratos da operação</h3><p className="text-sm text-muted-foreground">Estado real por passageiro. O documento assinado é servido por URL temporária do Storage privado.</p></div>
      {rows.length === 0 ? <p className="p-5 text-sm text-muted-foreground">Nenhum contrato criado para esta operação.</p> : <div className="divide-y divide-border">{rows.map((c: any) => {
        const timeline = eventRows.filter((e) => e.contract_id === c.id).slice(0, 5);
        return <article key={c.id} className="space-y-3 p-4">
          <div className="flex flex-wrap items-start justify-between gap-3"><div><p className="font-semibold">{c.person?.full_name ?? "Passageiro"}</p><p className="text-sm text-muted-foreground">{c.person?.email ?? "—"} · {c.template_key} / {c.template_version}</p></div><span className="rounded-full border border-border px-2.5 py-1 text-xs font-medium">{STATUS_LABEL[c.status] ?? c.status}</span></div>
          <div className="grid gap-2 text-sm sm:grid-cols-3"><p><span className="text-muted-foreground">Enviado:</span> {when(c.sent_at)}</p><p><span className="text-muted-foreground">Visualizado:</span> {when(c.viewed_at)}</p><p><span className="text-muted-foreground">Assinado:</span> {when(c.signed_at)}</p></div>
          <div className="flex flex-wrap gap-2">{c.signed_document_path ? <Button size="sm" variant="outline" onClick={() => void openSignedDocument(c.signed_document_path)}><FileText className="mr-2 size-4" />Abrir contrato assinado</Button> : <span className="text-xs text-muted-foreground">Documento final ainda não disponível.</span>}</div>
          {timeline.length ? <details><summary className="cursor-pointer text-sm font-medium">Histórico de auditoria ({eventRows.filter((e) => e.contract_id === c.id).length})</summary><ol className="mt-2 space-y-1 border-l border-border pl-3">{timeline.map((e) => <li key={e.id} className="text-xs text-muted-foreground"><span className="font-medium text-foreground">{e.event_type}</span> · {e.source} · {when(e.event_at)}</li>)}</ol></details> : null}
        </article>;
      })}</div>}
    </section>
  </div>;
}
