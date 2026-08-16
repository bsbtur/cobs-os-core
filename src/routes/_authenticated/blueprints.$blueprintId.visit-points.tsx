import * as React from "react";
import { createFileRoute, Link, useParams } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft,
  ChevronDown,
  ChevronUp,
  Edit3,
  Lightbulb,
  ListTree,
  Lock,
  Plus,
  Trash2,
} from "lucide-react";

import { AppShell } from "@/app/shell/app-shell";
import { RequireTenant } from "@/app/shell/require-tenant";
import { EmptyState } from "@/components/feedback/empty-state";
import { feedback } from "@/components/feedback/feedback";
import { PanelSkeleton } from "@/components/feedback/loading";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";
import {
  canEditBlueprints,
  canViewBlueprints,
  draftVersion,
  latestPublishedVersion,
  newIdempotencyKey,
  type BlueprintStepRow,
  type BlueprintVersionRow,
} from "@/lib/blueprints";
import { useTenant } from "@/lib/tenant";

// @ts-expect-error TanStack regenerates routeTree.gen.ts after discovering this new route.
export const Route = createFileRoute("/_authenticated/blueprints/$blueprintId/visit-points")({
  head: () => ({
    meta: [
      { title: "Biblioteca interpretativa — COBS OS" },
      {
        name: "description",
        content: "Pontos interpretativos versionados dos blueprints COBS OS.",
      },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: BlueprintVisitPointLibraryPage,
});

type VisitPoint = Database["public"]["Tables"]["journey_blueprint_visit_points"]["Row"];

type PointForm = { title: string; interpretation: string; guideTip: string };
const EMPTY_POINT: PointForm = { title: "", interpretation: "", guideTip: "" };

function PointEditor({
  open,
  onOpenChange,
  stepId,
  point,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  stepId: string;
  point: VisitPoint | null;
  onSaved: () => void;
}) {
  const [form, setForm] = React.useState<PointForm>(EMPTY_POINT);
  const key = React.useRef(newIdempotencyKey());

  React.useEffect(() => {
    if (!open) return;
    setForm(
      point
        ? {
            title: point.title,
            interpretation: point.interpretation ?? "",
            guideTip: point.guide_tip ?? "",
          }
        : EMPTY_POINT,
    );
    key.current = newIdempotencyKey();
  }, [open, point]);

  const save = useMutation({
    mutationFn: async () => {
      if (!form.title.trim()) throw new Error("Informe o título do ponto.");
      const args: {
        _title: string;
        _idempotency_key: string;
        _interpretation?: string;
        _guide_tip?: string;
      } = {
        _title: form.title.trim(),
        _idempotency_key: key.current,
      };
      const interpretation = form.interpretation.trim();
      const guideTip = form.guideTip.trim();
      if (interpretation) args._interpretation = interpretation;
      if (guideTip) args._guide_tip = guideTip;

      if (point) {
        const { error } = await supabase.rpc("update_blueprint_visit_point", {
          ...args,
          _visit_point_id: point.id,
        });
        if (error) throw error;
        return;
      }

      const { error } = await supabase.rpc("add_blueprint_visit_point", {
        ...args,
        _blueprint_step_id: stepId,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      feedback.success(
        point ? "Ponto interpretativo atualizado." : "Ponto interpretativo adicionado.",
      );
      onOpenChange(false);
      onSaved();
    },
    onError: (error) =>
      feedback.error(error instanceof Error ? error.message : "Não foi possível salvar o ponto."),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>
            {point ? "Editar ponto interpretativo" : "Novo ponto interpretativo"}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="point-title">Título</Label>
            <Input
              id="point-title"
              value={form.title}
              onChange={(event) =>
                setForm((current) => ({ ...current, title: event.target.value }))
              }
              placeholder="Ex.: Vitrais de Marianne Peretti"
              autoFocus
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="point-interpretation">Conteúdo interpretativo</Label>
            <Textarea
              id="point-interpretation"
              rows={5}
              value={form.interpretation}
              onChange={(event) =>
                setForm((current) => ({ ...current, interpretation: event.target.value }))
              }
              placeholder="O que o guia deve apresentar ao grupo."
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="point-guide-tip">Dica ao guia</Label>
            <Textarea
              id="point-guide-tip"
              rows={3}
              value={form.guideTip}
              onChange={(event) =>
                setForm((current) => ({ ...current, guideTip: event.target.value }))
              }
              placeholder="Sugestão prática de condução ou observação."
            />
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={save.isPending}>
              Cancelar
            </Button>
            <Button onClick={() => save.mutate()} disabled={save.isPending || !form.title.trim()}>
              {save.isPending ? "Salvando…" : "Salvar ponto"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function StepPoints({
  versionId,
  step,
  editable,
}: {
  versionId: string;
  step: BlueprintStepRow;
  editable: boolean;
}) {
  const queryClient = useQueryClient();
  const [editorOpen, setEditorOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<VisitPoint | null>(null);
  const [removing, setRemoving] = React.useState<VisitPoint | null>(null);
  const queryKey = ["blueprint-visit-points", versionId, step.id] as const;

  const query = useQuery({
    queryKey,
    queryFn: async () => {
      const result = await supabase
        .from("journey_blueprint_visit_points")
        .select("*")
        .eq("version_id", versionId)
        .eq("blueprint_step_id", step.id)
        .order("sequence");
      if (result.error) throw result.error;
      return result.data ?? [];
    },
  });

  const invalidate = () => void queryClient.invalidateQueries({ queryKey });
  const points = query.data ?? [];

  const reorder = useMutation({
    mutationFn: async (ordered: VisitPoint[]) => {
      const { error } = await supabase.rpc("reorder_blueprint_visit_points", {
        _blueprint_step_id: step.id,
        _ordered_visit_point_ids: ordered.map((point) => point.id),
        _idempotency_key: newIdempotencyKey(),
      });
      if (error) throw error;
    },
    onSuccess: () => {
      feedback.success("Ordem dos pontos atualizada.");
      invalidate();
    },
    onError: (error) =>
      feedback.error(
        error instanceof Error ? error.message : "Não foi possível reordenar os pontos.",
      ),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.rpc("remove_blueprint_visit_point", {
        _visit_point_id: id,
        _idempotency_key: newIdempotencyKey(),
      });
      if (error) throw error;
    },
    onSuccess: () => {
      feedback.success("Ponto interpretativo removido.");
      setRemoving(null);
      invalidate();
    },
    onError: (error) =>
      feedback.error(error instanceof Error ? error.message : "Não foi possível remover o ponto."),
  });

  const move = (index: number, delta: -1 | 1) => {
    const targetIndex = index + delta;
    const current = points[index];
    const target = points[targetIndex];
    if (!current || !target) return;
    const ordered = [...points];
    ordered[index] = target;
    ordered[targetIndex] = current;
    reorder.mutate(ordered);
  };

  return (
    <div className="mt-4 border-t border-border pt-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
            Pontos interpretativos
          </p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {points.length} {points.length === 1 ? "ponto" : "pontos"} nesta etapa
          </p>
        </div>
        {editable ? (
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              setEditing(null);
              setEditorOpen(true);
            }}
          >
            <Plus className="mr-1.5 size-4" aria-hidden="true" />
            Adicionar ponto
          </Button>
        ) : null}
      </div>

      {query.isLoading ? (
        <p className="mt-3 text-sm text-muted-foreground">Carregando pontos…</p>
      ) : points.length === 0 ? (
        <p className="mt-3 rounded-xl border border-dashed border-border p-4 text-sm text-muted-foreground">
          Nenhum ponto interpretativo cadastrado nesta etapa.
        </p>
      ) : (
        <ol className="mt-3 space-y-2">
          {points.map((point, index) => (
            <li key={point.id} className="rounded-xl border border-border bg-background/45 p-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-primary-soft font-mono text-[11px] font-semibold text-primary">
                      {index + 1}
                    </span>
                    <p className="font-medium">{point.title}</p>
                  </div>
                  {point.interpretation ? (
                    <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-muted-foreground">
                      {point.interpretation}
                    </p>
                  ) : null}
                  {point.guide_tip ? (
                    <div className="mt-2 flex items-start gap-2 rounded-lg bg-primary-soft/50 px-3 py-2 text-xs">
                      <Lightbulb
                        className="mt-0.5 size-3.5 shrink-0 text-primary"
                        aria-hidden="true"
                      />
                      <span>{point.guide_tip}</span>
                    </div>
                  ) : null}
                </div>
                {editable ? (
                  <div className="flex shrink-0 items-center gap-1">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="size-9"
                      aria-label="Mover para cima"
                      disabled={index === 0 || reorder.isPending}
                      onClick={() => move(index, -1)}
                    >
                      <ChevronUp className="size-4" aria-hidden="true" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="size-9"
                      aria-label="Mover para baixo"
                      disabled={index === points.length - 1 || reorder.isPending}
                      onClick={() => move(index, 1)}
                    >
                      <ChevronDown className="size-4" aria-hidden="true" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="size-9"
                      aria-label="Editar ponto"
                      onClick={() => {
                        setEditing(point);
                        setEditorOpen(true);
                      }}
                    >
                      <Edit3 className="size-4" aria-hidden="true" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="size-9 text-destructive"
                      aria-label="Remover ponto"
                      onClick={() => setRemoving(point)}
                    >
                      <Trash2 className="size-4" aria-hidden="true" />
                    </Button>
                  </div>
                ) : null}
              </div>
            </li>
          ))}
        </ol>
      )}

      <PointEditor
        open={editorOpen}
        onOpenChange={setEditorOpen}
        stepId={step.id}
        point={editing}
        onSaved={invalidate}
      />

      <Dialog open={Boolean(removing)} onOpenChange={(open) => !open && setRemoving(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Remover ponto interpretativo?</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            {removing ? `“${removing.title}” será removido somente desta versão draft.` : ""}
          </p>
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setRemoving(null)} disabled={remove.isPending}>
              Cancelar
            </Button>
            <Button
              variant="destructive"
              disabled={!removing || remove.isPending}
              onClick={() => removing && remove.mutate(removing.id)}
            >
              {remove.isPending ? "Removendo…" : "Remover"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function LibraryWorkspace({ blueprintId }: { blueprintId: string }) {
  const { role } = useTenant();
  const [versionId, setVersionId] = React.useState<string | null>(null);

  const query = useQuery({
    queryKey: ["blueprint-visit-point-library", blueprintId],
    queryFn: async () => {
      const [blueprintResult, versionsResult] = await Promise.all([
        supabase.from("journey_blueprints").select("*").eq("id", blueprintId).maybeSingle(),
        supabase
          .from("journey_blueprint_versions")
          .select("*")
          .eq("blueprint_id", blueprintId)
          .order("version_number", { ascending: false }),
      ]);
      if (blueprintResult.error) throw blueprintResult.error;
      if (versionsResult.error) throw versionsResult.error;
      const versions = (versionsResult.data ?? []) as BlueprintVersionRow[];
      const stepsResult = versions.length
        ? await supabase
            .from("journey_blueprint_steps")
            .select("*")
            .in(
              "version_id",
              versions.map((version) => version.id),
            )
            .order("sequence")
        : { data: [], error: null };
      if (stepsResult.error) throw stepsResult.error;
      return {
        blueprint: blueprintResult.data,
        versions,
        steps: (stepsResult.data ?? []) as BlueprintStepRow[],
      };
    },
  });

  const versions = query.data?.versions ?? [];
  const draft = draftVersion(versions);
  const published = latestPublishedVersion(versions);
  const selectedId =
    versionId && versions.some((version) => version.id === versionId)
      ? versionId
      : (draft?.id ?? published?.id ?? versions[0]?.id ?? null);
  const selectedVersion = versions.find((version) => version.id === selectedId) ?? null;
  const steps = selectedVersion
    ? (query.data?.steps ?? []).filter((step) => step.version_id === selectedVersion.id)
    : [];
  const editable = Boolean(
    selectedVersion?.status === "draft" &&
    query.data?.blueprint?.status === "active" &&
    canEditBlueprints(role),
  );

  if (!canViewBlueprints(role)) {
    return (
      <EmptyState
        icon={Lock}
        title="Acesso restrito"
        body="Seu perfil não possui permissão para visualizar blueprints."
      />
    );
  }
  if (query.isLoading) return <PanelSkeleton rows={5} />;
  const blueprint = query.data?.blueprint;
  if (!blueprint) {
    return (
      <EmptyState
        icon={Lock}
        title="Blueprint não encontrado"
        body="Verifique o endereço e tente novamente."
      />
    );
  }

  return (
    <div className="space-y-6">
      <Link
        to="/blueprints/$blueprintId"
        params={{ blueprintId }}
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" aria-hidden="true" /> Voltar ao blueprint
      </Link>

      <header className="space-y-2">
        <div className="flex items-center gap-3">
          <span className="flex size-10 items-center justify-center rounded-xl bg-primary-soft text-primary">
            <ListTree className="size-5" aria-hidden="true" />
          </span>
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
              Biblioteca interpretativa
            </p>
            <h2 className="text-2xl font-semibold lg:text-3xl">{blueprint.name}</h2>
          </div>
        </div>
        <p className="max-w-3xl text-sm leading-6 text-muted-foreground">
          Cadastre os pontos uma vez. Eles passam a fazer parte da versão do blueprint e são levados
          automaticamente para novas operações.
        </p>
      </header>

      <section className="surface-panel flex flex-wrap items-end justify-between gap-3 p-4">
        <div>
          <Label htmlFor="library-version">Versão do blueprint</Label>
          <p className="mt-1 text-xs text-muted-foreground">
            Rascunhos podem ser editados; versões publicadas são somente leitura.
          </p>
        </div>
        <select
          id="library-version"
          className="min-h-11 rounded-lg border border-border bg-background px-3 text-sm"
          value={selectedId ?? ""}
          onChange={(event) => setVersionId(event.target.value)}
        >
          {versions.map((version) => (
            <option key={version.id} value={version.id}>
              Versão {version.version_number} ·{" "}
              {version.status === "draft" ? "Rascunho" : "Publicada"}
            </option>
          ))}
        </select>
      </section>

      {steps.length === 0 ? (
        <EmptyState
          icon={ListTree}
          title="Nenhuma etapa nesta versão"
          body="Adicione etapas no editor principal antes de cadastrar pontos interpretativos."
        />
      ) : (
        <ol className="space-y-4">
          {steps.map((step) => (
            <li
              key={step.id}
              id={`step-${step.id}`}
              className="surface-panel scroll-mt-24 p-4 transition-shadow target:ring-2 target:ring-primary/40 sm:p-5"
            >
              <div className="flex items-start gap-3">
                <span className="flex size-9 shrink-0 items-center justify-center rounded-full border border-border font-mono text-xs font-semibold">
                  {step.sequence}
                </span>
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                    {step.step_kind}
                  </p>
                  <h3 className="mt-0.5 text-lg font-semibold">{step.title}</h3>
                  {step.location_label ? (
                    <p className="mt-1 text-sm text-muted-foreground">{step.location_label}</p>
                  ) : null}
                </div>
              </div>
              {selectedVersion ? (
                <StepPoints versionId={selectedVersion.id} step={step} editable={editable} />
              ) : null}
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

function BlueprintVisitPointLibraryPage() {
  const params = useParams({ strict: false }) as { blueprintId?: string };
  const blueprintId = params.blueprintId ?? "";

  return (
    <AppShell activeId="blueprints" title="Biblioteca interpretativa">
      <div className="mx-auto w-full max-w-5xl">
        <RequireTenant>
          <LibraryWorkspace blueprintId={blueprintId} />
        </RequireTenant>
      </div>
    </AppShell>
  );
}
