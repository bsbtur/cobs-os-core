import * as React from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, FileLock2, ShieldAlert } from "lucide-react";

import { AppShell } from "@/app/shell/app-shell";
import { RequireTenant } from "@/app/shell/require-tenant";
import { feedback } from "@/components/feedback/feedback";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { humanizeError } from "@/lib/auth";
import { useI18n } from "@/lib/i18n";
import { useTenant } from "@/lib/tenant";

const TEMPLATE_KEY = "CIOSP-2027";
const TEMPLATE_VERSION = "V3.1";
const RENDERER_VERSION = "pdf-lib-v1";

type SourceState = {
  template_id: string;
  template_key: string;
  template_version: string;
  name: string;
  status: string;
  legal_reviewed_at: string | null;
  document_source_registered: boolean;
  document_source_hash: string | null;
  document_renderer_version: string | null;
  provider_document_mode: string | null;
  can_register_source: boolean;
};

type RegisterResult = {
  template_id?: string;
  template_key?: string;
  template_version?: string;
  status?: string;
  document_source_hash?: string;
  renderer_version?: string;
  legal_reviewed_at?: string | null;
};

export const Route = createFileRoute("/_authenticated/settings_/contracts")({
  head: () => ({
    meta: [
      { title: "Fonte documental do contrato — COBS OS" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: ContractDocumentSourcePage,
});

function ContractDocumentSourceRegistry() {
  const { locale } = useI18n();
  const { canManage } = useTenant();
  const queryClient = useQueryClient();
  const [content, setContent] = React.useState("");
  const [lastResult, setLastResult] = React.useState<RegisterResult | null>(null);

  const sourceState = useQuery({
    queryKey: ["contract-document-source", TEMPLATE_KEY, TEMPLATE_VERSION],
    enabled: canManage,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_contract_document_source_for_admin", {
        _template_key: TEMPLATE_KEY,
        _version: TEMPLATE_VERSION,
      });
      if (error) throw error;
      return data as SourceState;
    },
  });

  const registerSource = useMutation({
    mutationFn: async () => {
      const state = sourceState.data;
      if (!state?.template_id) throw new Error("contract_template_not_found");
      if (!state.can_register_source || state.document_source_registered)
        throw new Error("contract_document_source_registration_closed");
      const { data, error } = await supabase.rpc("register_contract_document_source_draft", {
        _template_id: state.template_id,
        _document_source_snapshot: content.trim(),
        _renderer_version: RENDERER_VERSION,
      });
      if (error) throw error;
      return (data ?? {}) as RegisterResult;
    },
    onSuccess: (result) => {
      setLastResult(result);
      setContent("");
      feedback.success("Fonte documental congelada para revisão jurídica.");
      void queryClient.invalidateQueries({
        queryKey: ["contract-document-source", TEMPLATE_KEY, TEMPLATE_VERSION],
      });
    },
    onError: (error) => feedback.error(humanizeError(error, locale)),
  });

  if (!canManage) {
    return (
      <section className="surface-panel p-5">
        <p className="text-sm text-muted-foreground">
          Somente owner/admin pode registrar a fonte documental do contrato.
        </p>
      </section>
    );
  }

  if (sourceState.isLoading) {
    return <section className="surface-panel p-5 text-sm text-muted-foreground">Carregando...</section>;
  }
  if (sourceState.isError || !sourceState.data) {
    return (
      <section className="surface-panel p-5">
        <p className="text-sm text-destructive">Não foi possível carregar o template contratual.</p>
      </section>
    );
  }

  const state = sourceState.data;
  const canRegister =
    state.can_register_source && !state.document_source_registered && content.trim().length >= 200;

  return (
    <div className="space-y-6">
      <section className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-5">
        <div className="flex items-start gap-3">
          <ShieldAlert className="mt-0.5 size-5 text-amber-500" aria-hidden="true" />
          <div>
            <h3 className="font-semibold">FONTE DOCUMENTAL — NÃO É APROVAÇÃO JURÍDICA</h3>
            <p className="mt-1 text-sm text-muted-foreground">
              Cole somente o texto contratual real destinado à revisão formal. Esta tela não ativa o
              template, não registra revisão jurídica, não gera PDF e não chama Clicksign.
            </p>
          </div>
        </div>
      </section>

      <section className="surface-panel p-5">
        <div className="flex items-start gap-3">
          <FileLock2 className="mt-0.5 size-5 text-primary" aria-hidden="true" />
          <div className="min-w-0 flex-1">
            <h3 className="font-semibold">{state.name}</h3>
            <div className="mt-2 grid gap-2 text-xs text-muted-foreground sm:grid-cols-2">
              <p>
                Template: <span className="font-mono">{state.template_key} · {state.template_version}</span>
              </p>
              <p>
                Status: <span className="font-semibold uppercase">{state.status}</span>
              </p>
              <p>
                Modo: <span className="font-mono">{state.provider_document_mode ?? "não definido"}</span>
              </p>
              <p>
                Renderer exigido: <span className="font-mono">{RENDERER_VERSION}</span>
              </p>
            </div>
          </div>
        </div>
      </section>

      {state.document_source_registered ? (
        <section className="surface-panel p-5">
          <h3 className="text-sm font-semibold">Fonte já congelada</h3>
          <p className="mt-2 text-sm text-muted-foreground">
            O corpo contratual não é exibido nesta interface. O hash abaixo identifica exatamente o
            texto registrado para revisão.
          </p>
          <p className="mt-3 break-all font-mono text-xs">SHA-256 {state.document_source_hash}</p>
          <p className="mt-2 text-xs text-muted-foreground">
            Renderer registrado: {state.document_renderer_version ?? "pendente"}. Alterações devem
            seguir uma nova versão do template, não sobrescrever silenciosamente a fonte existente.
          </p>
        </section>
      ) : (
        <section className="surface-panel p-5">
          <h3 className="text-sm font-semibold">Registrar fonte da V3.1</h3>
          <p className="mt-1 text-xs text-muted-foreground">
            O texto será congelado e terá SHA-256 calculado pelo servidor. Mínimo técnico: 200 caracteres.
          </p>
          <form
            className="mt-4 space-y-4"
            onSubmit={(event) => {
              event.preventDefault();
              if (canRegister && !registerSource.isPending) registerSource.mutate();
            }}
          >
            <div className="space-y-2">
              <Label htmlFor="contract-document-source">Texto integral do contrato</Label>
              <Textarea
                id="contract-document-source"
                value={content}
                onChange={(event) => setContent(event.target.value)}
                rows={22}
                placeholder="Cole somente o texto real que será submetido à revisão jurídica. Use placeholders já definidos pelo contrato, como {{customer_full_name}}, sem criar dados fictícios."
                required
              />
            </div>
            <Button type="submit" disabled={!canRegister || registerSource.isPending} className="min-h-11">
              {registerSource.isPending ? "Congelando..." : "Registrar fonte documental"}
            </Button>
          </form>
        </section>
      )}

      {lastResult?.document_source_hash ? (
        <section className="rounded-xl border border-border p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Hash retornado pelo servidor
          </p>
          <p className="mt-2 break-all font-mono text-xs">{lastResult.document_source_hash}</p>
          <p className="mt-2 text-xs text-muted-foreground">
            Status permanece {lastResult.status ?? "review_required"}; revisão jurídica continua ausente.
          </p>
        </section>
      ) : null}
    </div>
  );
}

function ContractDocumentSourcePage() {
  return (
    <AppShell activeId="settings" title="Fonte documental do contrato">
      <div className="mx-auto w-full max-w-4xl space-y-6">
        <Button asChild variant="ghost" className="w-fit">
          <Link to="/settings">
            <ArrowLeft className="mr-2 size-4" aria-hidden="true" />
            Voltar para Configurações
          </Link>
        </Button>
        <section>
          <h2 className="text-2xl font-semibold lg:text-3xl">Fonte documental do contrato</h2>
          <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
            Registro técnico do texto exato que poderá ser renderizado somente depois da revisão jurídica formal.
          </p>
        </section>
        <RequireTenant>
          <ContractDocumentSourceRegistry />
        </RequireTenant>
      </div>
    </AppShell>
  );
}
