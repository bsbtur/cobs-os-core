import * as React from "react";
import { createFileRoute, Link, useParams } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, ChevronDown, ChevronUp, Lightbulb, ListChecks, Lock, Plus } from "lucide-react";

import { AppShell } from "@/app/shell/app-shell";
import { RequireTenant } from "@/app/shell/require-tenant";
import { supabase } from "@/integrations/supabase/client";
import { useI18n } from "@/lib/i18n";
import { formatDateTime } from "@/lib/format";
import { useTenant } from "@/lib/tenant";
import {
  PRESENCE_POPULATIONS,
  STEP_KINDS,
  allowedPresenceRequirements,
  defaultPresenceRequirement,
  type PresencePopulation,
  type PresenceRequirement,
  type StepKind,
} from "@/lib/w04";
import {
  buildAddStepPayload,
  buildUpdateStepPayload,
  canCreateVersion,
  canEditBlueprints,
  canPublishBlueprints,
  canViewBlueprints,
  draftVersion,
  emptyStepDraft,
  formatOffset,
  humanizeBlueprintError,
  latestPublishedVersion,
  newIdempotencyKey,
  readValidation,
  stepRowToDraft,
  validateStepDraft,
  type BlueprintStepRow,
  type BlueprintVersionRow,
  type StepDraft,
  type ValidationResult,
} from "@/lib/blueprints";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { EmptyState } from "@/components/feedback/empty-state";
import { PanelSkeleton } from "@/components/feedback/loading";
import { feedback } from "@/components/feedback/feedback";

export const Route = createFileRoute("/_authenticated/blueprints/$blueprintId")({
  head: () => ({
    meta: [
      { title: "Blueprint editor — COBS OS journey versions" },
      {
        name: "description",
        content:
          "Edit a draft journey blueprint version, validate it, publish an immutable version and branch new versions in COBS OS.",
      },
      { property: "og:title", content: "Blueprint editor — COBS OS journey versions" },
      {
        property: "og:description",
        content: "Draft, validate and publish immutable journey blueprint versions.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: BlueprintDetailPage,
});

const SELECT_CLASS =
  "min-h-11 w-full rounded-lg border border-border bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring";

function Chip({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <span
      className={`inline-flex shrink-0 items-center rounded-full px-2 py-0.5 font-mono text-[10px] uppercase tracking-[0.12em] ${className}`}
    >
      {children}
    </span>
  );
}

type InterpretiveCoverage = "empty" | "partial" | "complete";

function interpretiveCoverage(pointCount: number): InterpretiveCoverage {
  if (pointCount === 0) return "empty";
  if (pointCount < 4) return "partial";
  return "complete";
}

function interpretiveCoverageLabel(pointCount: number) {
  const coverage = interpretiveCoverage(pointCount);
  if (coverage === "empty") return "Sem conteúdo";
  if (coverage === "partial") return "Parcial";
  return "Completa";
}

function interpretiveCoverageClass(pointCount: number) {
  const coverage = interpretiveCoverage(pointCount);
  if (coverage === "complete") return "bg-primary-soft text-primary";
  if (coverage === "partial") return "bg-warning-soft text-warning";
  return "border border-border text-muted-foreground";
}

/* ------------------------------------------------------------------ */
/* Step dialog                                                         */
/* ------------------------------------------------------------------ */

function StepDialog({
  open,
  onOpenChange,
  versionId,
  step,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  versionId: string;
  step: BlueprintStepRow | null;
  onSaved: () => void;
}) {
  const { t } = useI18n();
  const [draft, setDraft] = React.useState<StepDraft>(emptyStepDraft());
  const [showErrors, setShowErrors] = React.useState(false);
  const idempotencyKey = React.useRef(newIdempotencyKey());

  React.useEffect(() => {
    if (!open) return;
    idempotencyKey.current = newIdempotencyKey();
    setShowErrors(false);
    setDraft(step ? stepRowToDraft(step) : emptyStepDraft());
  }, [open, step]);

  const allowed = allowedPresenceRequirements(draft.step_kind);
  const canonical = defaultPresenceRequirement(draft.step_kind);
  const errors = validateStepDraft(draft);
  const errorFor = (field: keyof StepDraft) =>
    showErrors ? errors.find((e) => e.field === field) : undefined;

  const set = <K extends keyof StepDraft>(key: K, value: StepDraft[K]) =>
    setDraft((d) => ({ ...d, [key]: value }));

  const changeKind = (kind: StepKind) => {
    // The requirement always follows the canonical contract when the kind changes.
    setDraft((d) => ({
      ...d,
      step_kind: kind,
      presence_requirement: defaultPresenceRequirement(kind),
    }));
  };

  const save = useMutation({
    mutationFn: async () => {
      if (step) {
        const { error } = await supabase.rpc(
          "update_blueprint_step",
          buildUpdateStepPayload(step.id, draft, idempotencyKey.current),
        );
        if (error) throw error;
        return;
      }
      const { error } = await supabase.rpc(
        "add_blueprint_step",
        buildAddStepPayload(versionId, draft, idempotencyKey.current),
      );
      if (error) throw error;
    },
    onSuccess: () => {
      feedback.success(step ? t("bp.step.updated") : t("bp.step.added"));
      onSaved();
      onOpenChange(false);
    },
    onError: (error) => feedback.error(humanizeBlueprintError(error, t)),
  });

  const submit = () => {
    if (errors.length > 0) {
      setShowErrors(true);
      return;
    }
    save.mutate();
  };

  return (
    <Dialog open={open} onOpenChange={(next) => (save.isPending ? null : onOpenChange(next))}>
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{step ? t("bp.step.edit") : t("bp.step.add")}</DialogTitle>
        </DialogHeader>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="bps-title">{t("bp.step.title")}</Label>
            <Input
              id="bps-title"
              value={draft.title}
              aria-invalid={Boolean(errorFor("title"))}
              onChange={(e) => set("title", e.target.value)}
            />
            {errorFor("title") ? (
              <p className="text-xs text-destructive">{t("bp.error.required")}</p>
            ) : null}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="bps-kind">{t("bp.step.kind")}</Label>
            <select
              id="bps-kind"
              className={SELECT_CLASS}
              value={draft.step_kind}
              onChange={(e) => changeKind(e.target.value as StepKind)}
            >
              {STEP_KINDS.map((kind) => (
                <option key={kind} value={kind}>
                  {t(`w04.kind.${kind}`)}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="bps-offset">{t("bp.step.offset")}</Label>
            <Input
              id="bps-offset"
              inputMode="numeric"
              value={draft.start_offset_minutes}
              aria-invalid={Boolean(errorFor("start_offset_minutes"))}
              onChange={(e) => set("start_offset_minutes", e.target.value)}
            />
            {errorFor("start_offset_minutes") ? (
              <p className="text-xs text-destructive">{t("bp.error.invalid_offset")}</p>
            ) : (
              <p className="text-xs text-muted-foreground">
                {formatOffset(Number(draft.start_offset_minutes) || 0, t)}
              </p>
            )}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="bps-duration">{t("bp.step.duration")}</Label>
            <Input
              id="bps-duration"
              inputMode="numeric"
              value={draft.duration_minutes}
              aria-invalid={Boolean(errorFor("duration_minutes"))}
              onChange={(e) => set("duration_minutes", e.target.value)}
            />
            {errorFor("duration_minutes") ? (
              <p className="text-xs text-destructive">{t("bp.error.invalid_duration")}</p>
            ) : (
              <p className="text-xs text-muted-foreground">{t("bp.step.durationHint")}</p>
            )}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="bps-location">{t("bp.step.location")}</Label>
            <Input
              id="bps-location"
              value={draft.location_label}
              onChange={(e) => set("location_label", e.target.value)}
            />
          </div>

          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="bps-description">{t("bp.step.description")}</Label>
            <Textarea
              id="bps-description"
              rows={3}
              value={draft.description}
              onChange={(e) => set("description", e.target.value)}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="bps-traveler-label">{t("bp.step.travelerLabel")}</Label>
            <Input
              id="bps-traveler-label"
              value={draft.traveler_label}
              onChange={(e) => set("traveler_label", e.target.value)}
            />
          </div>

          <div className="flex items-center gap-2 pt-6">
            <Checkbox
              id="bps-traveler-facing"
              checked={draft.traveler_facing}
              onCheckedChange={(value) => set("traveler_facing", value === true)}
            />
            <Label htmlFor="bps-traveler-facing">{t("bp.step.travelerFacing")}</Label>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="bps-presence">{t("bp.step.presence")}</Label>
            <select
              id="bps-presence"
              className={SELECT_CLASS}
              value={draft.presence_requirement}
              onChange={(e) => set("presence_requirement", e.target.value as PresenceRequirement)}
            >
              {allowed.map((requirement) => (
                <option key={requirement} value={requirement}>
                  {t(`w04.requirement.${requirement}`)}
                  {requirement === canonical ? ` · ${t("bp.step.presenceDefault")}` : ""}
                </option>
              ))}
            </select>
            <p className="text-xs text-muted-foreground">{t("bp.step.presenceHint")}</p>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="bps-population">{t("bp.step.population")}</Label>
            <select
              id="bps-population"
              className={SELECT_CLASS}
              value={draft.presence_population}
              onChange={(e) => set("presence_population", e.target.value as PresencePopulation)}
            >
              {PRESENCE_POPULATIONS.map((population) => (
                <option key={population} value={population}>
                  {t(`w04.population.${population}`)}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div aria-live="polite" className="sr-only">
          {save.isPending ? t("bp.busy") : ""}
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <Button
            variant="ghost"
            className="min-h-11"
            disabled={save.isPending}
            onClick={() => onOpenChange(false)}
          >
            {t("common.cancel")}
          </Button>
          <Button className="min-h-11" disabled={save.isPending} onClick={submit}>
            {save.isPending ? t("bp.busy") : t("common.save")}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/* ------------------------------------------------------------------ */
/* Confirmation dialog                                                 */
/* ------------------------------------------------------------------ */

function ConfirmDialog({
  open,
  onOpenChange,
  title,
  body,
  confirmLabel,
  pending,
  disabled,
  onConfirm,
  children,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  body: string;
  confirmLabel: string;
  pending: boolean;
  disabled?: boolean;
  onConfirm: () => void;
  children?: React.ReactNode;
}) {
  const { t } = useI18n();
  return (
    <Dialog open={open} onOpenChange={(next) => (pending ? null : onOpenChange(next))}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">{body}</p>
        {children}
        <div aria-live="polite" className="sr-only">
          {pending ? t("bp.busy") : ""}
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <Button
            variant="ghost"
            className="min-h-11"
            disabled={pending}
            onClick={() => onOpenChange(false)}
          >
            {t("common.cancel")}
          </Button>
          <Button className="min-h-11" disabled={pending || disabled} onClick={onConfirm}>
            {pending ? t("bp.busy") : confirmLabel}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/* ------------------------------------------------------------------ */
/* Draft editor                                                        */
/* ------------------------------------------------------------------ */

function DraftEditor({
  version,
  steps,
  visitPointCounts,
  mayEdit,
  mayPublish,
  onChanged,
}: {
  version: BlueprintVersionRow;
  steps: BlueprintStepRow[];
  visitPointCounts: ReadonlyMap<string, number>;
  mayEdit: boolean;
  mayPublish: boolean;
  onChanged: () => void;
}) {
  const { t } = useI18n();
  const [dialogStep, setDialogStep] = React.useState<BlueprintStepRow | null>(null);
  const [dialogOpen, setDialogOpen] = React.useState(false);
  const [removeTarget, setRemoveTarget] = React.useState<BlueprintStepRow | null>(null);
  const [publishOpen, setPublishOpen] = React.useState(false);
  const [validation, setValidation] = React.useState<ValidationResult | null>(null);
  const [order, setOrder] = React.useState<BlueprintStepRow[]>(steps);

  React.useEffect(() => setOrder(steps), [steps]);

  const invalidate = () => {
    setValidation(null);
    onChanged();
  };

  const remove = useMutation({
    mutationFn: async (stepId: string) => {
      const { error } = await supabase.rpc("remove_blueprint_step", {
        _step_id: stepId,
        _idempotency_key: newIdempotencyKey(),
      });
      if (error) throw error;
    },
    onSuccess: () => {
      feedback.success(t("bp.step.removed"));
      setRemoveTarget(null);
      invalidate();
    },
    onError: (error) => feedback.error(humanizeBlueprintError(error, t)),
  });

  const reorder = useMutation({
    mutationFn: async (ids: string[]) => {
      const { error } = await supabase.rpc("reorder_blueprint_steps", {
        _version_id: version.id,
        _ordered_step_ids: ids,
        _idempotency_key: newIdempotencyKey(),
      });
      if (error) throw error;
    },
    onSuccess: () => {
      feedback.success(t("bp.step.reordered"));
      invalidate();
    },
    onError: (error, _ids, context) => {
      // Restore the previous order — the backend rejected the move.
      setOrder((context as BlueprintStepRow[] | undefined) ?? steps);
      feedback.error(humanizeBlueprintError(error, t));
    },
  });

  const validate = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.rpc("validate_blueprint_version", {
        _version_id: version.id,
      });
      if (error) throw error;
      return readValidation(data);
    },
    onSuccess: (result) => {
      setValidation(result);
      if (result.valid) feedback.success(t("bp.validate.valid"));
      else feedback.warning(t("bp.validate.invalid"));
    },
    onError: (error) => feedback.error(humanizeBlueprintError(error, t)),
  });

  const publishKey = React.useRef(newIdempotencyKey());
  React.useEffect(() => {
    if (publishOpen) publishKey.current = newIdempotencyKey();
  }, [publishOpen]);

  const publish = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.rpc("publish_blueprint_version", {
        _version_id: version.id,
        _idempotency_key: publishKey.current,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      feedback.success(t("bp.publish.success"));
      setPublishOpen(false);
      invalidate();
    },
    onError: (error) => feedback.error(humanizeBlueprintError(error, t)),
  });

  const move = (index: number, direction: -1 | 1) => {
    if (reorder.isPending) return;
    const target = index + direction;
    const next = [...order];
    const a = next[index];
    const b = next[target];
    if (!a || !b) return;
    next[index] = b;
    next[target] = a;
    const previous = order;
    setOrder(next);
    reorder.mutate(
      next.map((step) => step.id),
      { onError: () => setOrder(previous) },
    );
  };

  const canPublishNow = mayPublish && validation?.valid === true && order.length > 0;
  const visitPointTotal = order.reduce(
    (total, step) => total + (visitPointCounts.get(step.id) ?? 0),
    0,
  );
  const coveredStepCount = order.filter((step) => (visitPointCounts.get(step.id) ?? 0) > 0).length;
  const completeStepCount = order.filter(
    (step) => (visitPointCounts.get(step.id) ?? 0) >= 4,
  ).length;
  const partialStepCount = order.filter((step) => {
    const count = visitPointCounts.get(step.id) ?? 0;
    return count > 0 && count < 4;
  }).length;
  const emptyStepCount = order.length - completeStepCount - partialStepCount;
  const nextInterpretiveGap =
    order.find((step) => (visitPointCounts.get(step.id) ?? 0) < 4) ?? null;

  return (
    <section className="space-y-4">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <h3 className="text-lg font-semibold">
            {t("bp.version")} {version.version_number}
          </h3>
          <Chip className="bg-warning-soft text-warning">{t("bp.version.status.draft")}</Chip>
          <Chip className="border border-border text-muted-foreground">
            <Lightbulb className="mr-1 size-3.5" aria-hidden="true" />
            {visitPointTotal}{" "}
            {visitPointTotal === 1 ? "ponto interpretativo" : "pontos interpretativos"}
          </Chip>
          <Chip className="border border-border text-muted-foreground">
            {coveredStepCount}/{order.length} etapas com conteúdo
          </Chip>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            className="min-h-11"
            disabled={validate.isPending}
            onClick={() => validate.mutate()}
          >
            <ListChecks className="mr-1.5 size-4" aria-hidden="true" />
            {t("bp.validate.action")}
          </Button>
          {mayPublish ? (
            <Button
              className="min-h-11"
              disabled={!canPublishNow}
              onClick={() => setPublishOpen(true)}
            >
              {t("bp.publish.action")}
            </Button>
          ) : null}
          {mayEdit ? (
            <Button
              className="min-h-11"
              onClick={() => {
                setDialogStep(null);
                setDialogOpen(true);
              }}
            >
              <Plus className="mr-1.5 size-4" aria-hidden="true" />
              {t("bp.step.add")}
            </Button>
          ) : null}
        </div>
      </header>

      <section
        className="surface-panel p-4 sm:p-5"
        aria-label="Qualidade interpretativa da experiência"
      >
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
              Qualidade interpretativa
            </p>
            <p className="mt-1 text-sm text-muted-foreground">
              Acompanhe a cobertura editorial das etapas antes de publicar a experiência.
            </p>
          </div>
          {nextInterpretiveGap ? (
            <Button asChild variant="outline" className="min-h-10">
              <a
                href={`/blueprints/${version.blueprint_id}/visit-points#step-${nextInterpretiveGap.id}`}
              >
                Continuar enriquecimento
              </a>
            </Button>
          ) : order.length > 0 ? (
            <Chip className="bg-primary-soft text-primary">Experiência enriquecida</Chip>
          ) : null}
        </div>

        <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
          <div className="rounded-xl border border-border bg-background/50 p-3">
            <p className="text-2xl font-semibold tabular-nums">{order.length}</p>
            <p className="text-xs text-muted-foreground">Etapas totais</p>
          </div>
          <div className="rounded-xl border border-border bg-primary-soft/40 p-3">
            <p className="text-2xl font-semibold tabular-nums text-primary">{completeStepCount}</p>
            <p className="text-xs text-muted-foreground">Completas</p>
          </div>
          <div className="rounded-xl border border-border bg-warning-soft/40 p-3">
            <p className="text-2xl font-semibold tabular-nums text-warning">{partialStepCount}</p>
            <p className="text-xs text-muted-foreground">Parciais</p>
          </div>
          <div className="rounded-xl border border-border bg-background/50 p-3">
            <p className="text-2xl font-semibold tabular-nums">{emptyStepCount}</p>
            <p className="text-xs text-muted-foreground">Sem conteúdo</p>
          </div>
        </div>

        <p className="mt-3 text-xs text-muted-foreground">
          {coveredStepCount}/{order.length} etapas possuem ao menos um ponto interpretativo.
        </p>
      </section>

      {mayPublish && !canPublishNow ? (
        <p className="text-xs text-muted-foreground">{t("bp.validate.pending")}</p>
      ) : null}
      {!mayPublish ? (
        <p className="text-xs text-muted-foreground">{t("bp.publish.roleHint")}</p>
      ) : null}

      <div aria-live="polite">
        {validation && validation.violations.length > 0 ? (
          <div className="surface-panel space-y-2 p-4">
            <h4 className="text-sm font-semibold">{t("bp.validate.violations")}</h4>
            <ul className="space-y-1.5">
              {validation.violations.map((violation, index) => (
                <li
                  key={`${violation.code}-${violation.sequence}-${index}`}
                  className="rounded-lg border border-destructive/40 px-3 py-2 text-sm"
                >
                  <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
                    {violation.sequence === null
                      ? t("bp.validate.noStep")
                      : `${t("bp.validate.step")} ${violation.sequence}`}{" "}
                    · {violation.code}
                  </span>
                  <p className="mt-0.5">{violation.message}</p>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
        {validation && validation.valid ? (
          <p className="surface-panel px-4 py-3 text-sm text-success">{t("bp.validate.valid")}</p>
        ) : null}
      </div>

      {order.length === 0 ? (
        <EmptyState icon={Plus} title={t("bp.step.empty")} body={t("bp.step.emptyBody")} />
      ) : (
        <ol className="space-y-3">
          {order.map((step, index) => (
            <li key={step.id} className="surface-panel p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <Chip className="border border-border text-muted-foreground">
                      {t("bp.step.sequence")} {step.sequence}
                    </Chip>
                    <Chip className="border border-border text-muted-foreground">
                      {t(`w04.kind.${step.step_kind}`)}
                    </Chip>
                    <Chip className={interpretiveCoverageClass(visitPointCounts.get(step.id) ?? 0)}>
                      <Lightbulb className="mr-1 size-3.5" aria-hidden="true" />
                      {visitPointCounts.get(step.id) ?? 0} pontos ·{" "}
                      {interpretiveCoverageLabel(visitPointCounts.get(step.id) ?? 0)}
                    </Chip>
                    {(visitPointCounts.get(step.id) ?? 0) < 4 ? (
                      <Button asChild variant="ghost" size="sm" className="min-h-9 px-2 text-xs">
                        <a
                          href={`/blueprints/${version.blueprint_id}/visit-points#step-${step.id}`}
                        >
                          {(visitPointCounts.get(step.id) ?? 0) === 0
                            ? "Adicionar conteúdo"
                            : "Completar biblioteca"}
                        </a>
                      </Button>
                    ) : null}
                    {step.presence_requirement ? (
                      <Chip className="bg-primary-soft text-primary">
                        {t(`w04.requirement.${step.presence_requirement}`)}
                      </Chip>
                    ) : (
                      <Chip className="border border-border text-muted-foreground">
                        {t("bp.step.presenceDefault")}
                      </Chip>
                    )}
                  </div>
                  <h4 className="mt-2 text-base font-semibold">{step.title}</h4>
                  <p className="text-sm text-muted-foreground">
                    {formatOffset(step.start_offset_minutes, t)}
                    {step.duration_minutes ? ` · ${step.duration_minutes} min` : ""}
                    {step.location_label ? ` · ${step.location_label}` : ""}
                  </p>
                </div>
                {mayEdit ? (
                  <div className="flex items-center gap-1">
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label={t("bp.step.moveUp")}
                      disabled={index === 0 || reorder.isPending}
                      onClick={() => move(index, -1)}
                    >
                      <ChevronUp className="size-4" aria-hidden="true" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label={t("bp.step.moveDown")}
                      disabled={index === order.length - 1 || reorder.isPending}
                      onClick={() => move(index, 1)}
                    >
                      <ChevronDown className="size-4" aria-hidden="true" />
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      className="min-h-9"
                      onClick={() => {
                        setDialogStep(step);
                        setDialogOpen(true);
                      }}
                    >
                      {t("bp.step.edit")}
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="min-h-9"
                      onClick={() => setRemoveTarget(step)}
                    >
                      {t("bp.step.remove")}
                    </Button>
                  </div>
                ) : null}
              </div>
            </li>
          ))}
        </ol>
      )}

      <StepDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        versionId={version.id}
        step={dialogStep}
        onSaved={invalidate}
      />

      <ConfirmDialog
        open={removeTarget !== null}
        onOpenChange={(open) => setRemoveTarget(open ? removeTarget : null)}
        title={t("bp.step.removeConfirm")}
        body={t("bp.step.removeConfirmBody")}
        confirmLabel={t("bp.step.remove")}
        pending={remove.isPending}
        onConfirm={() => removeTarget && remove.mutate(removeTarget.id)}
      />

      <ConfirmDialog
        open={publishOpen}
        onOpenChange={setPublishOpen}
        title={t("bp.publish.confirmTitle")}
        body={t("bp.publish.confirmBody")}
        confirmLabel={t("bp.publish.action")}
        pending={publish.isPending}
        disabled={!canPublishNow}
        onConfirm={() => publish.mutate()}
      />
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* Published version card                                              */
/* ------------------------------------------------------------------ */

function PublishedVersionCard({
  version,
  steps,
  visitPointCounts,
}: {
  version: BlueprintVersionRow;
  steps: BlueprintStepRow[];
  visitPointCounts: ReadonlyMap<string, number>;
}) {
  const { t, locale } = useI18n();
  const [open, setOpen] = React.useState(false);
  const visitPointTotal = steps.reduce(
    (total, step) => total + (visitPointCounts.get(step.id) ?? 0),
    0,
  );
  const coveredStepCount = steps.filter((step) => (visitPointCounts.get(step.id) ?? 0) > 0).length;
  return (
    <article className="surface-panel space-y-2 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <h4 className="text-base font-semibold">
            {t("bp.version")} {version.version_number}
          </h4>
          <Chip
            className={
              version.status === "published"
                ? "bg-primary-soft text-primary"
                : "border border-border text-muted-foreground"
            }
          >
            {t(`bp.version.status.${version.status}`)}
          </Chip>
          <Lock className="size-3.5 text-muted-foreground" aria-hidden="true" />
          <Chip className="border border-border text-muted-foreground">
            <Lightbulb className="mr-1 size-3.5" aria-hidden="true" />
            {visitPointTotal} pontos
          </Chip>
          <Chip className="border border-border text-muted-foreground">
            {coveredStepCount}/{steps.length} etapas com conteúdo
          </Chip>
        </div>
        <Button variant="ghost" size="sm" className="min-h-9" onClick={() => setOpen(!open)}>
          {open ? t("bp.step.hide") : t("bp.apply.preview")}
        </Button>
      </div>
      <dl className="grid gap-x-6 gap-y-1 text-xs sm:grid-cols-3">
        <div className="flex gap-1.5">
          <dt className="text-muted-foreground">{t("bp.stepCount")}</dt>
          <dd className="tabular-nums">{version.step_count}</dd>
        </div>
        <div className="flex gap-1.5">
          <dt className="text-muted-foreground">{t("bp.publishedAt")}</dt>
          <dd className="tabular-nums">
            {version.published_at ? formatDateTime(version.published_at, { locale }) : "—"}
          </dd>
        </div>
        <div className="flex min-w-0 gap-1.5">
          <dt className="text-muted-foreground">{t("bp.checksum")}</dt>
          <dd className="truncate font-mono text-[11px]">{version.checksum ?? "—"}</dd>
        </div>
      </dl>
      {open ? (
        <ol className="space-y-1.5 pt-1">
          {steps.map((step) => (
            <li key={step.id} className="rounded-lg border border-border px-3 py-2 text-sm">
              <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
                {step.sequence} · {t(`w04.kind.${step.step_kind}`)}
              </span>
              <p className="mt-0.5 font-medium">{step.title}</p>
              <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                <span>{formatOffset(step.start_offset_minutes, t)}</span>
                <span className="inline-flex items-center gap-1">
                  <Lightbulb className="size-3.5" aria-hidden="true" />
                  {visitPointCounts.get(step.id) ?? 0} pontos ·{" "}
                  {interpretiveCoverageLabel(visitPointCounts.get(step.id) ?? 0)}
                </span>
              </div>
            </li>
          ))}
        </ol>
      ) : null}
    </article>
  );
}

/* ------------------------------------------------------------------ */
/* Page                                                                */
/* ------------------------------------------------------------------ */

function BlueprintWorkspace({ blueprintId }: { blueprintId: string }) {
  const { t, locale } = useI18n();
  const { role } = useTenant();
  const queryClient = useQueryClient();
  const [newVersionOpen, setNewVersionOpen] = React.useState(false);
  const [archiveOpen, setArchiveOpen] = React.useState(false);
  const [archiveReason, setArchiveReason] = React.useState("");

  const mayEdit = canEditBlueprints(role);
  const mayPublish = canPublishBlueprints(role);

  const query = useQuery({
    queryKey: ["blueprint", blueprintId],
    queryFn: async () => {
      const [blueprint, versions] = await Promise.all([
        supabase.from("journey_blueprints").select("*").eq("id", blueprintId).maybeSingle(),
        supabase
          .from("journey_blueprint_versions")
          .select("*")
          .eq("blueprint_id", blueprintId)
          .order("version_number", { ascending: false }),
      ]);
      if (blueprint.error) throw blueprint.error;
      if (versions.error) throw versions.error;
      const versionRows = (versions.data ?? []) as BlueprintVersionRow[];
      const versionIds = versionRows.map((version) => version.id);
      const [steps, visitPoints] = versionRows.length
        ? await Promise.all([
            supabase
              .from("journey_blueprint_steps")
              .select("*")
              .in("version_id", versionIds)
              .order("sequence"),
            supabase
              .from("journey_blueprint_visit_points")
              .select("id, version_id, blueprint_step_id")
              .in("version_id", versionIds),
          ])
        : [
            { data: [], error: null },
            { data: [], error: null },
          ];
      if (steps.error) throw steps.error;
      if (visitPoints.error) throw visitPoints.error;
      return {
        blueprint: blueprint.data,
        versions: versionRows,
        steps: (steps.data ?? []) as BlueprintStepRow[],
        visitPoints: visitPoints.data ?? [],
      };
    },
  });

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ["blueprint", blueprintId] });
    void queryClient.invalidateQueries({ queryKey: ["blueprints"] });
  };

  const versionKey = React.useRef(newIdempotencyKey());
  React.useEffect(() => {
    if (newVersionOpen) versionKey.current = newIdempotencyKey();
  }, [newVersionOpen]);

  const archiveKey = React.useRef(newIdempotencyKey());
  React.useEffect(() => {
    if (archiveOpen) {
      archiveKey.current = newIdempotencyKey();
      setArchiveReason("");
    }
  }, [archiveOpen]);

  const published = latestPublishedVersion(query.data?.versions ?? []);

  const createVersion = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.rpc("create_blueprint_version", {
        _blueprint_id: blueprintId,
        _from_version_id: published!.id,
        _idempotency_key: versionKey.current,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      feedback.success(t("bp.newVersion.success"));
      setNewVersionOpen(false);
      invalidate();
    },
    onError: (error) => feedback.error(humanizeBlueprintError(error, t)),
  });

  const archive = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.rpc("archive_journey_blueprint", {
        _blueprint_id: blueprintId,
        _reason: archiveReason.trim(),
        _idempotency_key: archiveKey.current,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      feedback.success(t("bp.archive.success"));
      setArchiveOpen(false);
      invalidate();
    },
    onError: (error) => feedback.error(humanizeBlueprintError(error, t)),
  });

  if (!canViewBlueprints(role)) {
    return <EmptyState icon={Lock} title={t("bp.forbidden")} body={t("bp.forbiddenBody")} />;
  }
  if (query.isLoading) return <PanelSkeleton rows={4} />;

  const blueprint = query.data?.blueprint;
  if (!blueprint) {
    return <EmptyState icon={Lock} title={t("bp.detail.notFound")} body={t("bp.forbiddenBody")} />;
  }

  const versions = query.data?.versions ?? [];
  const allSteps = query.data?.steps ?? [];
  const visitPointCounts = new Map<string, number>();
  for (const point of query.data?.visitPoints ?? []) {
    visitPointCounts.set(
      point.blueprint_step_id,
      (visitPointCounts.get(point.blueprint_step_id) ?? 0) + 1,
    );
  }
  const draft = draftVersion(versions);
  const archived = blueprint.status === "archived";
  const mayCreateVersion = mayEdit && !archived && canCreateVersion(blueprint, versions);

  return (
    <div className="space-y-6">
      <Link
        to="/blueprints"
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" aria-hidden="true" />
        {t("bp.detail.back")}
      </Link>

      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-2xl font-semibold lg:text-3xl">{blueprint.name}</h2>
            <Chip
              className={
                archived
                  ? "border border-border text-muted-foreground"
                  : "bg-primary-soft text-primary"
              }
            >
              {t(`bp.status.${blueprint.status}`)}
            </Chip>
          </div>
          <p className="mt-1 font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
            {blueprint.slug} · {t("bp.updatedAt")}{" "}
            {formatDateTime(blueprint.updated_at, { locale })}
          </p>
          {blueprint.description ? (
            <p className="mt-2 max-w-2xl text-sm text-muted-foreground">{blueprint.description}</p>
          ) : null}
        </div>
        <div className="flex flex-wrap gap-2">
          <Button asChild variant="outline" className="min-h-11">
            <a href={`/blueprints/${blueprintId}/visit-points`}>
              <Lightbulb className="mr-1.5 size-4" aria-hidden="true" />
              Biblioteca interpretativa
            </a>
          </Button>
          {mayCreateVersion ? (
            <Button variant="outline" className="min-h-11" onClick={() => setNewVersionOpen(true)}>
              {t("bp.newVersion.action")}
            </Button>
          ) : null}
          {mayPublish && !archived ? (
            <Button variant="ghost" className="min-h-11" onClick={() => setArchiveOpen(true)}>
              {t("bp.archive.action")}
            </Button>
          ) : null}
        </div>
      </header>

      <p className="surface-panel px-4 py-3 text-sm text-muted-foreground">
        {t("bp.detail.immutable")}
      </p>
      {archived ? (
        <p className="surface-panel px-4 py-3 text-sm text-warning">
          {t("bp.detail.archivedNotice")}
        </p>
      ) : null}

      {draft ? (
        <DraftEditor
          version={draft}
          steps={allSteps.filter((step) => step.version_id === draft.id)}
          visitPointCounts={visitPointCounts}
          mayEdit={mayEdit && !archived}
          mayPublish={mayPublish && !archived}
          onChanged={invalidate}
        />
      ) : null}

      <section className="space-y-3">
        <h3 className="text-lg font-semibold">{t("bp.versions")}</h3>
        {versions.filter((v) => v.status !== "draft").length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("bp.noPublished")}</p>
        ) : (
          versions
            .filter((v) => v.status !== "draft")
            .map((version) => (
              <PublishedVersionCard
                key={version.id}
                version={version}
                steps={allSteps.filter((step) => step.version_id === version.id)}
                visitPointCounts={visitPointCounts}
              />
            ))
        )}
      </section>

      <ConfirmDialog
        open={newVersionOpen}
        onOpenChange={setNewVersionOpen}
        title={t("bp.newVersion.confirmTitle")}
        body={t("bp.newVersion.confirmBody")}
        confirmLabel={t("bp.newVersion.action")}
        pending={createVersion.isPending}
        disabled={!published}
        onConfirm={() => createVersion.mutate()}
      />

      <ConfirmDialog
        open={archiveOpen}
        onOpenChange={setArchiveOpen}
        title={t("bp.archive.confirmTitle")}
        body={t("bp.archive.confirmBody")}
        confirmLabel={t("bp.archive.action")}
        pending={archive.isPending}
        disabled={archiveReason.trim().length === 0}
        onConfirm={() => archive.mutate()}
      >
        <div className="space-y-1.5 pt-2">
          <Label htmlFor="bp-archive-reason">{t("bp.field.reason")}</Label>
          <Input
            id="bp-archive-reason"
            value={archiveReason}
            onChange={(e) => setArchiveReason(e.target.value)}
          />
          {archiveReason.trim().length === 0 ? (
            <p className="text-xs text-muted-foreground">{t("bp.archive.reasonRequired")}</p>
          ) : null}
        </div>
      </ConfirmDialog>
    </div>
  );
}

function BlueprintDetailPage() {
  const { blueprintId } = useParams({ from: "/_authenticated/blueprints/$blueprintId" });
  const { t } = useI18n();
  return (
    <AppShell activeId="blueprints" title={t("bp.title")}>
      <div className="mx-auto w-full max-w-5xl">
        <RequireTenant>
          <BlueprintWorkspace blueprintId={blueprintId} />
        </RequireTenant>
      </div>
    </AppShell>
  );
}
