import { createFileRoute, Link, useParams } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CircleAlert, FileCheck2, FileText, ShieldCheck } from "lucide-react";

import { EmptyState } from "@/components/feedback/empty-state";
import { feedback } from "@/components/feedback/feedback";
import { PanelSkeleton } from "@/components/feedback/loading";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { humanizeError } from "@/lib/auth";
import { useI18n } from "@/lib/i18n";
import { useTenant } from "@/lib/tenant";

const TEMPLATE_KEY = "CIOSP-2027";

type WorkflowRow = {
  order_id: string;
  buyer_person_id: string;
  buyer_name: string;
  order_status: string;
  reservation_status: string;
  party_profile_complete: boolean;
  contract_id: string | null;
  contract_status: string | null;
  template_version: string | null;
  ready_for_render: boolean;
  document_rendered: boolean;
  document_hash: string | null;
  provider_envelope_present: boolean;
  provider_send_exposed: boolean;
};

type Readiness = {
  technical_ready: boolean;
  legal_ready: boolean;
};

type Pipeline = {
  ready: boolean;
  detail: string;
  renderer_version?: string | null;
};

export const Route = createFileRoute("/_authenticated/operations/$operationId/contracts")({
  component: OperationContractsPage,
});

function OperationContractsPage() {
  const { locale } = useI18n();
  const { role } = useTenant();
  const queryClient = useQueryClient();
  const { operationId } = useParams({
    from: "/_authenticated/operations/$operationId/contracts",
  });
  const canOperate = role === "owner" || role === "admin" || role === "operations_agent";

  const state = useQuery({
    queryKey: ["operation-contract-workflow", operationId],
    queryFn: async () => {
      const [workflow, readiness, pipeline] = await Promise.all([
        supabase.rpc("get_operation_contract_workflow", {
          _operation_id: operationId,
          _template_key: TEMPLATE_KEY,
        }),
        supabase.rpc("get_operation_contract_readiness", {
          _operation_id: operationId,
          _template_key: TEMPLATE_KEY,
        }),
        supabase.rpc("get_contract_document_pipeline_readiness", {
          _operation_id: operationId,
          _template_key: TEMPLATE_KEY,
        }),
      ]);
      if (workflow.error) throw workflow.error;
      if (readiness.error) throw readiness.error;
      if (pipeline.error) throw pipeline.error;
      return {
        rows: (workflow.data ?? []) as WorkflowRow[],
        readiness: readiness.data as Readiness,
        pipeline: pipeline.data as Pipeline,
      };
    },
  });

  const refresh = () =>
    queryClient.invalidateQueries({ queryKey: ["operation-contract-workflow", operationId] });

  const generate = useMutation({
    mutationFn: async (orderId: string) => {
      const { data, error } = await supabase.functions.invoke("contracts-generate", {
        body: { order_id: orderId, template_key: TEMPLATE_KEY },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      return data;
    },
    onSuccess: () => {
      feedback.success("Draft contratual gerado a partir das evidências congeladas.");
      void refresh();
    },
    onError: (error) => feedback.error(humanizeError(error, locale)),
  });

  const renderPdf = useMutation({
    mutationFn: async (contractId: string) => {
      const { data, error } = await supabase.functions.invoke("contracts-render-pdf", {
        body: { contract_id: contractId },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      return data;
    },
    onSuccess: () => {
      feedback.success("PDF congelado e hash registrado. Envio ao provedor continua bloqueado.");
      void refresh();
    },
    onError: (error) => feedback.error(humanizeError(error, locale)),
  });

  if (state.isLoading) return <PanelSkeleton />;
  if (state.isError || !state.data) {
    return (
      <EmptyState
        icon={CircleAlert}
        title="Não foi possível carregar os contratos"
        body={state.error ? humanizeError(state.error, locale) : "Falha de leitura."}
      />
    );
  }

  const { rows, readiness, pipeline } = state.data;
  const generationReady = readiness.technical_ready && readiness.legal_ready && pipeline.ready;

  return (
    <div className="space-y-5">
      <header>
        <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
          Contratos · operação
        </p>
        <h2 className="mt-2 text-2xl font-semibold">Contratos dos viajantes</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Somente pedidos de produção com reserva ativa aparecem aqui. QA é excluído no servidor.
        </p>
      </header>

      <section className="grid gap-3 sm:grid-cols-3">
        <div className="surface-panel p-4">
          <p className="text-xs text-muted-foreground">Evidências técnicas</p>
          <p className="mt-1 font-semibold">{readiness.technical_ready ? "PRONTO" : "PENDENTE"}</p>
        </div>
        <div className="surface-panel p-4">
          <p className="text-xs text-muted-foreground">Revisão jurídica</p>
          <p className="mt-1 font-semibold">{readiness.legal_ready ? "VALIDADA" : "BLOQUEADA"}</p>
        </div>
        <div className="surface-panel p-4">
          <p className="text-xs text-muted-foreground">Pipeline PDF</p>
          <p className="mt-1 font-semibold">{pipeline.ready ? "PRONTO" : "BLOQUEADO"}</p>
          {!pipeline.ready ? <p className="mt-1 text-xs text-muted-foreground">{pipeline.detail}</p> : null}
        </div>
      </section>

      <section className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-4">
        <div className="flex items-start gap-3">
          <ShieldCheck className="mt-0.5 size-5 text-amber-500" aria-hidden="true" />
          <div>
            <p className="font-semibold">Envio ao Clicksign não está disponível nesta tela.</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Gerar draft e renderizar PDF são etapas separadas. Nenhuma delas libera ou envia o contrato ao provedor.
            </p>
          </div>
        </div>
      </section>

      {rows.length === 0 ? (
        <EmptyState
          icon={FileText}
          title="Nenhum pedido contratável de produção"
          body="Pedidos QA, sem reserva ativa ou fora dos estados contratáveis não aparecem aqui."
        />
      ) : (
        <section className="space-y-3">
          {rows.map((row) => {
            const canGenerate = canOperate && generationReady && row.party_profile_complete && !row.contract_id;
            const canRender =
              canOperate &&
              generationReady &&
              row.contract_status === "draft" &&
              row.ready_for_render &&
              !row.document_rendered &&
              Boolean(row.contract_id);
            return (
              <article key={row.order_id} className="surface-panel p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <h3 className="font-semibold">{row.buyer_name}</h3>
                    <p className="mt-1 font-mono text-[11px] text-muted-foreground">Pedido {row.order_id}</p>
                    <p className="mt-2 text-xs text-muted-foreground">
                      Pedido {row.order_status} · reserva {row.reservation_status} · dados contratuais {row.party_profile_complete ? "completos" : "pendentes"}
                    </p>
                  </div>
                  <span className="rounded-full border border-border px-2.5 py-1 text-xs font-semibold uppercase">
                    {row.contract_status ?? "sem draft"}
                  </span>
                </div>

                {row.document_rendered ? (
                  <div className="mt-3 rounded-lg border border-border p-3">
                    <p className="flex items-center gap-2 text-sm font-medium">
                      <FileCheck2 className="size-4" aria-hidden="true" /> PDF congelado
                    </p>
                    {row.document_hash ? (
                      <p className="mt-1 break-all font-mono text-[10px] text-muted-foreground">
                        SHA-256 {row.document_hash}
                      </p>
                    ) : null}
                  </div>
                ) : null}

                <div className="mt-4 flex flex-wrap gap-2">
                  {!row.contract_id ? (
                    <Button
                      type="button"
                      disabled={!canGenerate || generate.isPending}
                      onClick={() => generate.mutate(row.order_id)}
                    >
                      Gerar draft
                    </Button>
                  ) : null}
                  {row.contract_status === "draft" && !row.document_rendered ? (
                    <Button
                      type="button"
                      variant="outline"
                      disabled={!canRender || renderPdf.isPending}
                      onClick={() => row.contract_id && renderPdf.mutate(row.contract_id)}
                    >
                      Renderizar PDF
                    </Button>
                  ) : null}
                  {!row.party_profile_complete ? (
                    <Button asChild variant="outline">
                      <Link
                        from="/operations/$operationId/contracts"
                        to="/operations/$operationId/contract-parties"
                      >
                        Completar dados do viajante
                      </Link>
                    </Button>
                  ) : null}
                </div>
                {!generationReady ? (
                  <p className="mt-3 text-xs text-muted-foreground">
                    Geração bloqueada até Prontidão Contratual e Pipeline PDF ficarem verdes.
                  </p>
                ) : null}
              </article>
            );
          })}
        </section>
      )}
    </div>
  );
}
