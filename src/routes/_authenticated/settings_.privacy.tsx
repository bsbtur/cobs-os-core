import * as React from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, FileLock2, ShieldAlert } from "lucide-react";

import { AppShell } from "@/app/shell/app-shell";
import { RequireTenant } from "@/app/shell/require-tenant";
import { feedback } from "@/components/feedback/feedback";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { humanizeError } from "@/lib/auth";
import { useI18n } from "@/lib/i18n";
import { useTenant } from "@/lib/tenant";

const CIOSP_TRAVELER_POLICY_KEY = "ciosp-2027-traveler-contract";

type DraftResult = {
  privacy_policy_version_id?: string;
  status?: string;
  content_hash?: string;
  idempotent?: boolean;
};

type PolicyRow = {
  id: string;
  policy_key: string;
  version: string;
  title: string;
  effective_at: string;
  content_hash: string;
  status: string;
  legal_reviewed_at: string | null;
  legal_review_reference: string | null;
  created_at: string;
};

export const Route = createFileRoute("/_authenticated/settings_/privacy")({
  head: () => ({
    meta: [
      { title: "Privacidade contratual — COBS OS" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: PrivacySettingsPage,
});

function PrivacyRegistry() {
  const { locale } = useI18n();
  const { tenant, canManage } = useTenant();
  const queryClient = useQueryClient();
  const [version, setVersion] = React.useState("");
  const [title, setTitle] = React.useState("Política de Privacidade do Viajante — CIOSP 2027");
  const [effectiveAt, setEffectiveAt] = React.useState("");
  const [content, setContent] = React.useState("");
  const [lastResult, setLastResult] = React.useState<DraftResult | null>(null);

  const policies = useQuery({
    queryKey: ["privacy-policy-versions", tenant?.id, CIOSP_TRAVELER_POLICY_KEY],
    enabled: Boolean(tenant?.id) && canManage,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("privacy_policy_versions")
        .select(
          "id,policy_key,version,title,effective_at,content_hash,status,legal_reviewed_at,legal_review_reference,created_at",
        )
        .eq("tenant_id", tenant!.id)
        .eq("policy_key", CIOSP_TRAVELER_POLICY_KEY)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as PolicyRow[];
    },
  });

  const registerDraft = useMutation({
    mutationFn: async () => {
      if (!tenant?.id) throw new Error("tenant_required");
      const { data, error } = await supabase.rpc("register_privacy_policy_draft", {
        _tenant_id: tenant.id,
        _policy_key: CIOSP_TRAVELER_POLICY_KEY,
        _version: version.trim(),
        _title: title.trim(),
        _effective_at: new Date(effectiveAt).toISOString(),
        _content_snapshot: content.trim(),
        _public_url: null,
        _scope: "traveler_contract",
      });
      if (error) throw error;
      return (data ?? {}) as DraftResult;
    },
    onSuccess: (result) => {
      setLastResult(result);
      feedback.success(
        result.idempotent ? "Rascunho já estava registrado com o mesmo conteúdo." : "Rascunho registrado e congelado.",
      );
      void queryClient.invalidateQueries({ queryKey: ["privacy-policy-versions", tenant?.id] });
    },
    onError: (error) => feedback.error(humanizeError(error, locale)),
  });

  if (!canManage) {
    return (
      <section className="surface-panel p-5">
        <p className="text-sm text-muted-foreground">Somente owner/admin pode registrar versões de política contratual.</p>
      </section>
    );
  }

  const ready =
    version.trim().length > 0 &&
    title.trim().length > 0 &&
    effectiveAt.length > 0 &&
    content.trim().length >= 80;

  return (
    <div className="space-y-6">
      <section className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-5">
        <div className="flex items-start gap-3">
          <ShieldAlert className="mt-0.5 size-5 text-amber-500" aria-hidden="true" />
          <div>
            <h3 className="font-semibold">RASCUNHO — NÃO LIBERADO PARA CONTRATO</h3>
            <p className="mt-1 text-sm text-muted-foreground">
              Esta tela apenas registra e congela uma versão. Ela não ativa política, não registra revisão jurídica e não libera Clicksign.
            </p>
          </div>
        </div>
      </section>

      <section className="surface-panel p-5">
        <h3 className="flex items-center gap-2 text-sm font-semibold">
          <FileLock2 className="size-4 text-primary" aria-hidden="true" />
          Nova versão em rascunho
        </h3>
        <p className="mt-1 text-xs text-muted-foreground">
          Chave contratual fixa: <span className="font-mono">{CIOSP_TRAVELER_POLICY_KEY}</span>
        </p>

        <form
          className="mt-5 space-y-4"
          onSubmit={(event) => {
            event.preventDefault();
            if (ready && !registerDraft.isPending) registerDraft.mutate();
          }}
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="privacy-version">Versão</Label>
              <Input
                id="privacy-version"
                value={version}
                onChange={(event) => setVersion(event.target.value)}
                placeholder="Ex.: V1"
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="privacy-effective-at">Vigência prevista</Label>
              <Input
                id="privacy-effective-at"
                type="datetime-local"
                value={effectiveAt}
                onChange={(event) => setEffectiveAt(event.target.value)}
                required
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="privacy-title">Título</Label>
            <Input id="privacy-title" value={title} onChange={(event) => setTitle(event.target.value)} required />
          </div>

          <div className="space-y-2">
            <Label htmlFor="privacy-content">Texto integral da política</Label>
            <Textarea
              id="privacy-content"
              value={content}
              onChange={(event) => setContent(event.target.value)}
              rows={16}
              placeholder="Cole aqui somente o texto contratual que será submetido à revisão jurídica."
              required
            />
            <p className="text-xs text-muted-foreground">O banco calcula SHA-256 sobre o texto congelado. Alterações exigem nova versão.</p>
          </div>

          <Button type="submit" disabled={!ready || registerDraft.isPending} className="min-h-11">
            {registerDraft.isPending ? "Registrando..." : "Registrar rascunho imutável"}
          </Button>
        </form>

        {lastResult?.content_hash ? (
          <div className="mt-5 rounded-lg border border-border/70 p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Hash SHA-256 retornado pelo servidor</p>
            <p className="mt-2 break-all font-mono text-xs">{lastResult.content_hash}</p>
            <p className="mt-2 text-xs text-muted-foreground">Status: {lastResult.status ?? "draft"}</p>
          </div>
        ) : null}
      </section>

      <section className="surface-panel p-5">
        <h3 className="text-sm font-semibold">Versões registradas</h3>
        {policies.isLoading ? <p className="mt-3 text-sm text-muted-foreground">Carregando...</p> : null}
        {policies.isError ? <p className="mt-3 text-sm text-destructive">Não foi possível carregar as versões.</p> : null}
        {!policies.isLoading && !policies.isError && (policies.data?.length ?? 0) === 0 ? (
          <p className="mt-3 text-sm text-muted-foreground">Nenhuma versão registrada.</p>
        ) : null}
        <div className="mt-3 space-y-3">
          {(policies.data ?? []).map((policy) => (
            <div key={policy.id} className="rounded-lg border border-border/70 p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="font-medium">{policy.title}</p>
                  <p className="mt-1 font-mono text-xs text-muted-foreground">{policy.version}</p>
                </div>
                <span className="rounded-full border border-border px-2.5 py-1 text-xs font-semibold uppercase">{policy.status}</span>
              </div>
              <p className="mt-3 break-all font-mono text-[11px] text-muted-foreground">SHA-256 {policy.content_hash}</p>
              <p className="mt-2 text-xs text-muted-foreground">
                Revisão jurídica: {policy.legal_reviewed_at ? "registrada" : "pendente"}
                {policy.legal_review_reference ? ` · ${policy.legal_review_reference}` : ""}
              </p>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

function PrivacySettingsPage() {
  return (
    <AppShell activeId="settings" title="Privacidade contratual">
      <div className="mx-auto w-full max-w-4xl space-y-6">
        <Button asChild variant="ghost" className="w-fit">
          <Link to="/settings">
            <ArrowLeft className="mr-2 size-4" aria-hidden="true" />
            Voltar para Configurações
          </Link>
        </Button>
        <section>
          <h2 className="text-2xl font-semibold lg:text-3xl">Política de Privacidade Contratual</h2>
          <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
            Registro técnico de versões congeladas para revisão jurídica. Nenhuma ação desta tela ativa a política.
          </p>
        </section>
        <RequireTenant>
          <PrivacyRegistry />
        </RequireTenant>
      </div>
    </AppShell>
  );
}
