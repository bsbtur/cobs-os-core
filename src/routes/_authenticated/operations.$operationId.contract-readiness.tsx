import { createFileRoute, Link, useParams } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { CheckCircle2, CircleAlert, FileLock2, Scale } from "lucide-react";

import { PanelSkeleton } from "@/components/feedback/loading";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";

type ReadinessCheck = {
  key: string;
  label: string;
  status: "ready" | "blocked";
  kind: "technical" | "legal";
  detail: string;
};

type Readiness = {
  operation_id: string;
  template_key: string;
  technical_ready: boolean;
  legal_ready: boolean;
  provider_send_ready: boolean;
  checks: ReadinessCheck[];
  note: string;
};

export const Route = createFileRoute("/_authenticated/operations/$operationId/contract-readiness")({
  component: ContractReadinessPage,
});

function ContractReadinessPage() {
  const { operationId } = useParams({ from: "/_authenticated/operations/$operationId/contract-readiness" });
  const readiness = useQuery({
    queryKey: ["contract-readiness", operationId],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_operation_contract_readiness", {
        _operation_id: operationId,
        _template_key: "CIOSP-2027",
      });
      if (error) throw error;
      return data as Readiness;
    },
  });

  if (readiness.isLoading) return <PanelSkeleton />;
  if (readiness.isError || !readiness.data) {
    return (
      <section className="surface-panel p-5">
        <p className="text-sm text-destructive">Não foi possível calcular a prontidão contratual.</p>
      </section>
    );
  }

  const data = readiness.data;
  const blocked = data.checks.filter((check) => check.status === "blocked").length;

  return (
    <div className="space-y-5">
      <header>
        <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">Contrato · evidências</p>
        <h2 className="mt-2 text-2xl font-semibold">Prontidão Contratual</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Diagnóstico somente leitura dos bloqueadores técnicos e jurídicos antes da geração do contrato.
        </p>
      </header>

      <section className="grid gap-3 sm:grid-cols-3">
        <div className="surface-panel p-4">
          <p className="text-xs text-muted-foreground">Técnico</p>
          <p className="mt-1 font-semibold">{data.technical_ready ? "PRONTO" : "PENDENTE"}</p>
        </div>
        <div className="surface-panel p-4">
          <p className="text-xs text-muted-foreground">Jurídico</p>
          <p className="mt-1 font-semibold">{data.legal_ready ? "VALIDADO" : "BLOQUEADO"}</p>
        </div>
        <div className="surface-panel p-4">
          <p className="text-xs text-muted-foreground">Envio ao provedor</p>
          <p className="mt-1 font-semibold">BLOQUEADO</p>
        </div>
      </section>

      <section className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-4">
        <div className="flex items-start gap-3">
          <FileLock2 className="mt-0.5 size-5 text-amber-500" aria-hidden="true" />
          <div>
            <p className="font-semibold">{blocked} bloqueador(es) ainda aberto(s)</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Este painel não ativa template ou política, não contrata fornecedor, não gera contrato e não chama Clicksign.
            </p>
          </div>
        </div>
      </section>

      <section className="surface-panel divide-y divide-border/70">
        {data.checks.map((check) => {
          const Icon = check.status === "ready" ? CheckCircle2 : CircleAlert;
          return (
            <div key={check.key} className="flex items-start gap-3 p-4">
              <Icon className="mt-0.5 size-5 shrink-0" aria-hidden="true" />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="font-medium">{check.label}</p>
                  <span className="rounded-full border border-border px-2 py-0.5 text-[10px] font-semibold uppercase">
                    {check.kind === "legal" ? "Jurídico" : "Técnico"}
                  </span>
                </div>
                <p className="mt-1 text-xs text-muted-foreground">{check.detail}</p>
              </div>
              <span className="text-xs font-semibold uppercase">{check.status === "ready" ? "OK" : "Pendente"}</span>
            </div>
          );
        })}
      </section>

      <section className="surface-panel p-4">
        <div className="flex items-start gap-3">
          <Scale className="mt-0.5 size-5 text-muted-foreground" aria-hidden="true" />
          <div>
            <p className="font-medium">Ações relacionadas</p>
            <p className="mt-1 text-sm text-muted-foreground">Resolva somente evidências reais; nenhuma pendência deve ser preenchida automaticamente.</p>
            <div className="mt-3 flex flex-wrap gap-2">
              <Button asChild variant="outline" size="sm">
                <Link from="/operations/$operationId/contract-readiness" to="/operations/$operationId/procurement">
                  Fornecedores
                </Link>
              </Button>
              <Button asChild variant="outline" size="sm">
                <Link to="/settings/privacy">Política de privacidade</Link>
              </Button>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
