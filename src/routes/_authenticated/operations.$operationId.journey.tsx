import * as React from "react";
import { createFileRoute, useParams } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ChevronDown,
  ChevronUp,
  ListChecks,
  Pencil,
  Plus,
  Route as RouteIcon,
  Trash2,
} from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { humanizeError } from "@/lib/auth";
import { EditJourneyStepDialog } from "@/components/journey/edit-journey-step-dialog";
import { VisitPointsPanel } from "@/components/journey/visit-points-panel";
import { useI18n } from "@/lib/i18n";
import { formatDateTime } from "@/lib/format";
import { useTenant } from "@/lib/tenant";
import { roleLabel, type RoleTypeRow } from "@/lib/w03";
import {
  PLAYBOOK_REQUIREMENTS,
  PRESENCE_POPULATIONS,
  STEP_KINDS,
  allowedPresenceRequirements,
  defaultPresenceRequirement,
  isCanonicalPresence,
  isChecklistEditable,
  isDuplicateChecklistTitle,
  newIdempotencyKey,
  type JourneyStepRow,
  type PlaybookItemRow,
  type PlaybookRequirement,
  type PresencePopulation,
  type PresenceRequirement,
  type StepKind,
} from "@/lib/w04";
import {
  buildApplyPayload,
  buildJourneyOrigin,
  buildPreviewRows,
  canEditBlueprints,
  canSubmitApplication,
  formatOffset,
  humanizeBlueprintError,
  latestPublishedVersion,
  readStepCount,
  resolveEffectiveAnchor,
  stepOriginLabel,
  type BlueprintRow,
  type BlueprintStepRow,
  type BlueprintVersionRow,
  type PreviewState,
} from "@/lib/blueprints";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { EmptyState } from "@/components/feedback/empty-state";
import { PanelSkeleton } from "@/components/feedback/loading";
import { feedback } from "@/components/feedback/feedback";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

export const Route = createFileRoute("/_authenticated/operations/$operationId/journey")({
  head: () => ({
    meta: [
      { title: "Journey plan — COBS OS operation steps" },
      {
        name: "description",
        content:
          "Ordered journey steps for an operation: planned baseline, forecast, people checks and checklists.",
      },
      { property: "og:title", content: "Journey plan — COBS OS operation steps" },
      {
        property: "og:description",
        content: "Plan the operation as ordered steps. Reality never rewrites the plan.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: JourneyPlanPage,
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

/** ISO instant -> value accepted by <input type="datetime-local"> in local time. */
function toLocalInput(iso: string) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function toIsoOrNull(value: string) {
  if (!value) return undefined;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
}

/* ------------------------------------------------------------------ */
/* Step editor                                                         */
/* ------------------------------------------------------------------ */

function StepDialog({
  open,
  onOpenChange,
  operationId,
  adHoc,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  operationId: string;
  adHoc: boolean;
}) {
  const { t, locale } = useI18n();
  const queryClient = useQueryClient();
  const [title, setTitle] = React.useState("");
  const [kind, setKind] = React.useState<StepKind>("meeting");
  const [description, setDescription] = React.useState("");
  const [start, setStart] = React.useState("");
  const [end, setEnd] = React.useState("");
  const [location, setLocation] = React.useState("");
  const [travelerLabel, setTravelerLabel] = React.useState("");
  const [travelerFacing, setTravelerFacing] = React.useState(false);
  const [requirement, setRequirement] = React.useState<PresenceRequirement>("accounted");
  const [population, setPopulation] = React.useState<PresencePopulation>("participants");
  const [reason, setReason] = React.useState("");
  const idempotencyKey = React.useRef(newIdempotencyKey());

  React.useEffect(() => {
    if (open) idempotencyKey.current = newIdempotencyKey();
  }, [open]);

  const allowed = allowedPresenceRequirements(kind);
  const canonicalDefault = defaultPresenceRequirement(kind);

  React.useEffect(() => {
    setRequirement(defaultPresenceRequirement(kind));
  }, [kind]);

  React.useEffect(() => {
    if (!allowed.includes(requirement)) setRequirement(canonicalDefault);
  }, [allowed, requirement, canonicalDefault]);

  const save = useMutation({
    mutationFn: async () => {
      const startIso = toIsoOrNull(start);
      const endIso = toIsoOrNull(end);
      const explicitRequirement = requirement === canonicalDefault ? null : requirement;
      const shared = {
        _operation_id: operationId,
        _title: title.trim(),
        _step_kind: kind,
        _idempotency_key: idempotencyKey.current,
        _traveler_facing: travelerFacing,
        ...(explicitRequirement ? { _presence_requirement: explicitRequirement } : {}),
        _presence_population: population,
        ...(description.trim() ? { _description: description.trim() } : {}),
        ...(location.trim() ? { _location_label: location.trim() } : {}),
        ...(travelerLabel.trim() ? { _traveler_label: travelerLabel.trim() } : {}),
      };
      const { error } = adHoc
        ? await supabase.rpc("create_ad_hoc_journey_step", {
            ...shared,
            _reason: reason.trim(),
            ...(startIso ? { _expected_start: startIso } : {}),
            ...(endIso ? { _expected_end: endIso } : {}),
          })
        : await supabase.rpc("create_journey_step", {
            ...shared,
            ...(startIso ? { _planned_start: startIso } : {}),
            ...(endIso ? { _planned_end: endIso } : {}),
          });

      if (error) throw error;
    },
    onSuccess: () => {
      feedback.success(t("w04.journey.saved"));
      void queryClient.invalidateQueries({ queryKey: ["journey", operationId] });
      onOpenChange(false);
      setTitle("");
      setDescription("");
      setStart("");
      setEnd("");
      setLocation("");
      setTravelerLabel("");
      setReason("");
    },
    onError: (error) => feedback.error(humanizeError(error, locale)),
  });

  const disabled = !title.trim() || (adHoc && !reason.trim()) || save.isPending;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{adHoc ? t("w04.journey.addAdHoc") : t("w04.journey.addStep")}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="step-title">{t("w04.field.title")}</Label>
            <Input
              id="step-title"
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              className="min-h-11"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="step-kind">{t("w04.field.kind")}</Label>
            <select
              id="step-kind"
              className={SELECT_CLASS}
              value={kind}
              onChange={(event) => setKind(event.target.value as StepKind)}
            >
              {STEP_KINDS.map((value) => (
                <option key={value} value={value}>
                  {t(`w04.kind.${value}`)}
                </option>
              ))}
            </select>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="step-start">
                {adHoc ? t("w04.field.expectedStart") : t("w04.field.plannedStart")}
              </Label>
              <Input
                id="step-start"
                type="datetime-local"
                value={start}
                onChange={(event) => setStart(event.target.value)}
                className="min-h-11"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="step-end">
                {adHoc ? t("w04.field.expectedEnd") : t("w04.field.plannedEnd")}
              </Label>
              <Input
                id="step-end"
                type="datetime-local"
                value={end}
                onChange={(event) => setEnd(event.target.value)}
                className="min-h-11"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="step-location">{t("w04.field.location")}</Label>
            <Input
              id="step-location"
              value={location}
              onChange={(event) => setLocation(event.target.value)}
              className="min-h-11"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="step-requirement">{t("w04.field.presenceRequirement")}</Label>
            <select
              id="step-requirement"
              className={SELECT_CLASS}
              value={requirement}
              onChange={(event) => setRequirement(event.target.value as PresenceRequirement)}
            >
              {allowed.map((value) => (
                <option key={value} value={value}>
                  {t(`w04.requirement.${value}`)}
                </option>
              ))}
            </select>
            <p className="text-xs text-muted-foreground">
              {t(`w04.requirement.${requirement}Hint`)}
            </p>
            {allowed.length === 1 ? (
              <p className="text-xs text-muted-foreground">{t("w04.contract.fixedByKind")}</p>
            ) : null}
          </div>

          {requirement !== "none" ? (
            <div className="space-y-1.5">
              <Label htmlFor="step-population">{t("w04.field.presencePopulation")}</Label>
              <select
                id="step-population"
                className={SELECT_CLASS}
                value={population}
                onChange={(event) => setPopulation(event.target.value as PresencePopulation)}
              >
                {PRESENCE_POPULATIONS.map((value) => (
                  <option key={value} value={value}>
                    {t(`w04.population.${value}`)}
                  </option>
                ))}
              </select>
              {population === "participants" ? (
                <p className="text-xs text-muted-foreground">{t("w04.population.note")}</p>
              ) : null}
            </div>
          ) : null}

          <div className="space-y-1.5">
            <Label htmlFor="step-traveler">{t("w04.field.travelerLabel")}</Label>
            <Input
              id="step-traveler"
              value={travelerLabel}
              onChange={(event) => setTravelerLabel(event.target.value)}
              className="min-h-11"
            />
            <label className="mt-2 flex items-center gap-2 text-sm">
              <Checkbox
                checked={travelerFacing}
                onCheckedChange={(value) => setTravelerFacing(value === true)}
              />
              {t("w04.field.travelerFacing")}
            </label>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="step-description">{t("w04.field.description")}</Label>
            <Textarea
              id="step-description"
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              rows={2}
            />
            <p className="text-xs text-muted-foreground">{t("w04.field.noteHint")}</p>
          </div>

          {adHoc ? (
            <div className="space-y-1.5">
              <Label htmlFor="step-reason">{t("w04.origin.adHocReason")}</Label>
              <Textarea
                id="step-reason"
                value={reason}
                onChange={(event) => setReason(event.target.value)}
                rows={2}
              />
            </div>
          ) : null}

          <Button className="min-h-11 w-full" disabled={disabled} onClick={() => save.mutate()}>
            {t("w04.journey.addStep")}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function ForecastDialog({
  step,
  onOpenChange,
  operationId,
}: {
  step: JourneyStepRow | null;
  onOpenChange: (open: boolean) => void;
  operationId: string;
}) {
  const { t, locale } = useI18n();
  const queryClient = useQueryClient();
  const [start, setStart] = React.useState("");
  const [end, setEnd] = React.useState("");
  const [reason, setReason] = React.useState("");

  React.useEffect(() => {
    setStart("");
    setEnd("");
    setReason("");
  }, [step?.id]);

  const save = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.rpc("set_step_expected_window", {
        _journey_step_id: step!.id,
        _expected_start: toIsoOrNull(start) as unknown as string,
        _expected_end: toIsoOrNull(end) as unknown as string,
        _reason: reason.trim(),
      });
      if (error) throw error;
    },
    onSuccess: () => {
      feedback.success(t("w04.expected.changed"));
      void queryClient.invalidateQueries({ queryKey: ["journey", operationId] });
      onOpenChange(false);
    },
    onError: (error) => feedback.error(humanizeError(error, locale)),
  });

  return (
    <Dialog open={Boolean(step)} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t("w04.expected.change")}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="fc-start">{t("w04.field.expectedStart")}</Label>
              <Input
                id="fc-start"
                type="datetime-local"
                value={start}
                onChange={(event) => setStart(event.target.value)}
                className="min-h-11"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="fc-end">{t("w04.field.expectedEnd")}</Label>
              <Input
                id="fc-end"
                type="datetime-local"
                value={end}
                onChange={(event) => setEnd(event.target.value)}
                className="min-h-11"
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="fc-reason">{t("w04.field.reason")}</Label>
            <Textarea
              id="fc-reason"
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              rows={2}
            />
            <p className="text-xs text-muted-foreground">{t("w04.expected.reasonRequired")}</p>
          </div>
          <Button
            className="min-h-11 w-full"
            disabled={!reason.trim() || save.isPending}
            onClick={() => save.mutate()}
          >
            {t("w04.expected.change")}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function ChecklistItemDialog({
  item,
  items,
  roleTypes,
  operationId,
  onOpenChange,
}: {
  item: PlaybookItemRow | null;
  items: PlaybookItemRow[];
  roleTypes: RoleTypeRow[];
  operationId: string;
  onOpenChange: (open: boolean) => void;
}) {
  const { t, locale } = useI18n();
  const queryClient = useQueryClient();
  const [title, setTitle] = React.useState("");
  const [requirement, setRequirement] = React.useState<PlaybookRequirement>("required");
  const [ownerRole, setOwnerRole] = React.useState("");

  React.useEffect(() => {
    setTitle(item?.title ?? "");
    setRequirement((item?.requirement as PlaybookRequirement) ?? "required");
    setOwnerRole(item?.owner_role_type_id ?? "");
  }, [item?.id, item?.title, item?.requirement, item?.owner_role_type_id]);

  const duplicate = item
    ? isDuplicateChecklistTitle(items, {
        stepId: item.journey_step_id,
        title,
        excludeId: item.id,
      })
    : false;

  const save = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.rpc("update_playbook_item", {
        _playbook_item_id: item!.id,
        _title: title.trim(),
        _requirement: requirement,
        ...(ownerRole ? { _owner_role_type_id: ownerRole } : {}),
      });
      if (error) throw error;
      await queryClient.refetchQueries({ queryKey: ["journey", operationId] });
    },
    onSuccess: () => {
      feedback.success(t("w04.playbook.updated"));
      onOpenChange(false);
    },
    onError: (error) => feedback.error(humanizeError(error, locale)),
  });

  return (
    <Dialog open={Boolean(item)} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t("w04.playbook.editTitle")}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="pb-title">{t("w04.playbook.itemTitle")}</Label>
            <Input
              id="pb-title"
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              className="min-h-11"
            />
            {duplicate ? (
              <p className="text-xs text-destructive">{t("w04.playbook.duplicate")}</p>
            ) : null}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="pb-requirement">{t("w04.playbook")}</Label>
            <select
              id="pb-requirement"
              className={SELECT_CLASS}
              value={requirement}
              onChange={(event) => setRequirement(event.target.value as PlaybookRequirement)}
            >
              {PLAYBOOK_REQUIREMENTS.map((value) => (
                <option key={value} value={value}>
                  {t(`w04.requirementLabel.${value}`)}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="pb-owner">{t("w04.playbook.owner")}</Label>
            <select
              id="pb-owner"
              className={SELECT_CLASS}
              value={ownerRole}
              onChange={(event) => setOwnerRole(event.target.value)}
            >
              <option value="">{t("w04.playbook.owner")}</option>
              {roleTypes.map((role) => (
                <option key={role.id} value={role.id}>
                  {roleLabel(role, t)}
                </option>
              ))}
            </select>
            <p className="text-xs text-muted-foreground">{t("w04.playbook.ownerHint")}</p>
          </div>
          <Button
            className="min-h-11 w-full"
            disabled={!title.trim() || duplicate || save.isPending}
            onClick={() => save.mutate()}
          >
            {t("w04.playbook.save")}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function RemoveChecklistItemDialog({
  item,
  operationId,
  onOpenChange,
}: {
  item: PlaybookItemRow | null;
  operationId: string;
  onOpenChange: (open: boolean) => void;
}) {
  const { t, locale } = useI18n();
  const queryClient = useQueryClient();
  const [reason, setReason] = React.useState("");

  React.useEffect(() => {
    setReason("");
  }, [item?.id]);

  const remove = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.rpc("deactivate_playbook_item", {
        _playbook_item_id: item!.id,
        _reason: reason.trim(),
      });
      if (error) throw error;
      await queryClient.refetchQueries({ queryKey: ["journey", operationId] });
    },
    onSuccess: () => {
      feedback.success(t("w04.playbook.removed"));
      onOpenChange(false);
    },
    onError: (error) => feedback.error(humanizeError(error, locale)),
  });

  return (
    <Dialog open={Boolean(item)} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t("w04.playbook.removeTitle")}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">{t("w04.playbook.removeBody")}</p>
          <p className="text-sm font-medium">{item?.title}</p>
          <div className="space-y-1.5">
            <Label htmlFor="pb-remove-reason">{t("w04.playbook.removeReason")}</Label>
            <Textarea
              id="pb-remove-reason"
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              rows={2}
            />
            <p className="text-xs text-muted-foreground">
              {t("w04.playbook.removeReasonRequired")}
            </p>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row-reverse">
            <Button
              variant="destructive"
              className="min-h-11 sm:flex-1"
              disabled={!reason.trim() || remove.isPending}
              onClick={() => remove.mutate()}
            >
              {t("w04.playbook.removeConfirm")}
            </Button>
            <Button
              variant="outline"
              className="min-h-11 sm:flex-1"
              onClick={() => onOpenChange(false)}
            >
              {t("w04.playbook.cancel")}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function PlaybookEditor({
  step,
  items,
  roleTypes,
  operationId,
  editable,
}: {
  step: JourneyStepRow;
  items: PlaybookItemRow[];
  roleTypes: RoleTypeRow[];
  operationId: string;
  editable: boolean;
}) {
  const { t, locale } = useI18n();
  const queryClient = useQueryClient();
  const [title, setTitle] = React.useState("");
  const [requirement, setRequirement] = React.useState<PlaybookRequirement>("required");
  const [ownerRole, setOwnerRole] = React.useState("");
  const [editing, setEditing] = React.useState<PlaybookItemRow | null>(null);
  const [removing, setRemoving] = React.useState<PlaybookItemRow | null>(null);

  const duplicate = isDuplicateChecklistTitle(items, { stepId: step.id, title });

  const add = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.rpc("create_playbook_item", {
        _journey_step_id: step.id,
        _title: title.trim(),
        _idempotency_key: newIdempotencyKey(),
        _requirement: requirement,
        ...(ownerRole ? { _owner_role_type_id: ownerRole } : {}),
      });
      if (error) throw error;
      await queryClient.refetchQueries({ queryKey: ["journey", operationId] });
    },
    onSuccess: () => {
      feedback.success(t("w04.playbook.added"));
      setTitle("");
    },
    onError: (error) => feedback.error(humanizeError(error, locale)),
  });

  return (
    <div className="mt-3 rounded-xl border border-border/70 bg-background/40 p-3">
      <p className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
        <ListChecks className="size-3.5" aria-hidden="true" />
        {t("w04.playbook")}
      </p>

      {items.length === 0 ? (
        <p className="mt-2 text-sm text-muted-foreground">{t("w04.playbook.empty")}</p>
      ) : (
        <ul className="mt-2 space-y-1.5">
          {items.map((item) => (
            <li key={item.id} className="flex flex-wrap items-center gap-2 text-sm">
              <span className="min-w-0 flex-1 break-words">{item.title}</span>
              <Chip
                className={
                  item.requirement === "required"
                    ? "bg-primary-soft text-primary"
                    : "border border-border text-muted-foreground"
                }
              >
                {t(`w04.requirementLabel.${item.requirement}`)}
              </Chip>
              {item.owner_role_type_id ? (
                <Chip className="border border-border text-muted-foreground">
                  {roleLabel(
                    roleTypes.find((role) => role.id === item.owner_role_type_id) ?? null,
                    t,
                  )}
                </Chip>
              ) : null}
              {editable ? (
                <span className="flex items-center gap-1">
                  <Button
                    variant="outline"
                    size="sm"
                    className="min-h-9"
                    aria-label={`${t("w04.playbook.edit")} — ${item.title}`}
                    onClick={() => setEditing(item)}
                  >
                    {t("w04.playbook.edit")}
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="min-h-9"
                    aria-label={`${t("w04.playbook.remove")} — ${item.title}`}
                    onClick={() => setRemoving(item)}
                  >
                    {t("w04.playbook.remove")}
                  </Button>
                </span>
              ) : null}
            </li>
          ))}
        </ul>
      )}

      {editable ? (
        <>
          <div className="mt-3 flex flex-col gap-2 sm:flex-row">
            <Input
              aria-label={t("w04.playbook.add")}
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              placeholder={t("w04.playbook.add")}
              className="min-h-11 flex-1"
            />
            <select
              aria-label={t("w04.field.presenceRequirement")}
              className={`${SELECT_CLASS} sm:w-44`}
              value={requirement}
              onChange={(event) => setRequirement(event.target.value as PlaybookRequirement)}
            >
              {PLAYBOOK_REQUIREMENTS.map((value) => (
                <option key={value} value={value}>
                  {t(`w04.requirementLabel.${value}`)}
                </option>
              ))}
            </select>
            <select
              aria-label={t("w04.playbook.owner")}
              className={`${SELECT_CLASS} sm:w-48`}
              value={ownerRole}
              onChange={(event) => setOwnerRole(event.target.value)}
            >
              <option value="">{t("w04.playbook.owner")}</option>
              {roleTypes.map((role) => (
                <option key={role.id} value={role.id}>
                  {roleLabel(role, t)}
                </option>
              ))}
            </select>
            <Button
              className="min-h-11"
              disabled={!title.trim() || duplicate || add.isPending}
              onClick={() => add.mutate()}
            >
              <Plus className="mr-1.5 size-4" aria-hidden="true" />
              {t("w04.playbook.add")}
            </Button>
          </div>
          {duplicate ? (
            <p className="mt-2 text-xs text-destructive">{t("w04.playbook.duplicate")}</p>
          ) : null}
        </>
      ) : null}

      <p className="mt-2 text-xs text-muted-foreground">{t("w04.playbook.ownerHint")}</p>

      <ChecklistItemDialog
        item={editing}
        items={items}
        roleTypes={roleTypes}
        operationId={operationId}
        onOpenChange={(open) => setEditing(open ? editing : null)}
      />
      <RemoveChecklistItemDialog
        item={removing}
        operationId={operationId}
        onOpenChange={(open) => setRemoving(open ? removing : null)}
      />
    </div>
  );
}

function ApplyBlueprintDialog({
  open,
  onOpenChange,
  operationId,
  plannedStart,
  timezone,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  operationId: string;
  plannedStart: string | null;
  timezone: string | null;
}) {
  const { t, locale } = useI18n();
  const queryClient = useQueryClient();
  const [versionId, setVersionId] = React.useState("");
  const [anchorInput, setAnchorInput] = React.useState("");
  const idempotencyKey = React.useRef(newIdempotencyKey());

  const catalog = useQuery({
    queryKey: ["blueprint-catalog"],
    enabled: open,
    queryFn: async () => {
      const [blueprints, versions] = await Promise.all([
        supabase.from("journey_blueprints").select("*").eq("status", "active").order("name"),
        supabase
          .from("journey_blueprint_versions")
          .select("*")
          .eq("status", "published")
          .order("version_number", { ascending: false }),
      ]);
      if (blueprints.error) throw blueprints.error;
      if (versions.error) throw versions.error;
      const rows = (blueprints.data ?? []) as BlueprintRow[];
      const published = (versions.data ?? []) as BlueprintVersionRow[];
      return rows
        .map((blueprint) => ({
          blueprint,
          version: latestPublishedVersion(published.filter((v) => v.blueprint_id === blueprint.id)),
        }))
        .filter((entry) => entry.version !== null);
    },
  });

  const options = catalog.data ?? [];

  React.useEffect(() => {
    if (!open) return;
    idempotencyKey.current = newIdempotencyKey();
    setVersionId("");
    setAnchorInput("");
  }, [open]);

  const selected = options.find((entry) => entry.version?.id === versionId) ?? null;
  const anchor = resolveEffectiveAnchor(anchorInput, plannedStart);

  const preview = useQuery({
    queryKey: ["blueprint-version-steps", versionId],
    enabled: open && versionId !== "",
    queryFn: async () => {
      const { data, error } = await supabase
        .from("journey_blueprint_steps")
        .select("*")
        .eq("version_id", versionId)
        .order("sequence", { ascending: true });
      if (error) throw error;
      return (data ?? []) as BlueprintStepRow[];
    },
  });

  const previewState: PreviewState = !versionId
    ? "idle"
    : preview.isLoading
      ? "loading"
      : preview.isError
        ? "error"
        : (preview.data ?? []).length === 0
          ? "empty"
          : "ready";

  const rows = React.useMemo(
    () => buildPreviewRows(preview.data ?? [], anchor),
    [preview.data, anchor],
  );

  const apply = useMutation({
    mutationFn: async () => {
      const payload = buildApplyPayload(operationId, versionId, idempotencyKey.current, anchor);
      if (!payload) throw new Error("invalid_application_state");
      const { data, error } = await supabase.rpc("apply_journey_blueprint_to_operation", payload);
      if (error) throw error;
      return readStepCount(data);
    },
    onSuccess: (count) => {
      feedback.success(
        t("bp.apply.success"),
        count === null ? undefined : `${count} ${t("bp.apply.successCount")}`,
      );
      void queryClient.invalidateQueries({ queryKey: ["journey", operationId] });
      void queryClient.invalidateQueries({ queryKey: ["journey-provisioning", operationId] });
      onOpenChange(false);
    },
    onError: (error) => feedback.error(humanizeBlueprintError(error, t)),
  });

  const canSubmit = canSubmitApplication({
    versionId,
    anchor,
    previewState,
    pending: apply.isPending,
  });

  const dt = (iso: string | null) =>
    iso ? formatDateTime(iso, timezone ? { locale, timeZone: timezone } : { locale }) : "—";

  return (
    <Dialog open={open} onOpenChange={(next) => (apply.isPending ? null : onOpenChange(next))}>
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{t("bp.apply.title")}</DialogTitle>
        </DialogHeader>

        {catalog.isLoading ? (
          <PanelSkeleton rows={2} />
        ) : catalog.isError ? (
          <EmptyState
            icon={RouteIcon}
            title={t("op.loadError")}
            body={t("op.loadErrorBody")}
            action={
              <Button variant="outline" className="min-h-11" onClick={() => void catalog.refetch()}>
                {t("op.retry")}
              </Button>
            }
          />
        ) : options.length === 0 ? (
          <EmptyState
            icon={RouteIcon}
            title={t("bp.apply.noBlueprints")}
            body={t("bp.apply.noBlueprintsBody")}
          />
        ) : (
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="apply-version">{t("bp.apply.blueprint")}</Label>
              <select
                id="apply-version"
                className={SELECT_CLASS}
                value={versionId}
                onChange={(e) => setVersionId(e.target.value)}
              >
                <option value="">—</option>
                {options.map((entry) => (
                  <option key={entry.version!.id} value={entry.version!.id}>
                    {entry.blueprint.name} · {t("bp.versionShort")}
                    {entry.version!.version_number} · {entry.version!.step_count}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-1.5">
              {plannedStart ? (
                <p className="text-sm text-muted-foreground">
                  {t("bp.apply.plannedStart")}:{" "}
                  <span className="tabular-nums text-foreground">{dt(plannedStart)}</span>
                </p>
              ) : null}
              <Label htmlFor="apply-anchor">{t("bp.apply.anchor")}</Label>
              <Input
                id="apply-anchor"
                type="datetime-local"
                value={anchorInput}
                aria-invalid={!anchor.ok && anchor.reason === "invalid"}
                onChange={(e) => setAnchorInput(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">{t("bp.apply.anchorHint")}</p>
              {anchor.ok ? (
                <p className="text-sm">
                  {t("bp.apply.anchorEffective")}{" "}
                  <span className="font-medium tabular-nums">{dt(anchor.iso)}</span>{" "}
                  <span className="text-xs text-muted-foreground">
                    (
                    {anchor.source === "manual"
                      ? t("bp.apply.anchorFromManual")
                      : t("bp.apply.anchorFromPlanned")}
                    )
                  </span>
                </p>
              ) : (
                <p className="text-sm text-destructive">
                  {anchor.reason === "invalid"
                    ? t("bp.apply.anchorInvalid")
                    : t("bp.apply.anchorMissing")}
                </p>
              )}
            </div>

            {selected?.version ? (
              <div className="space-y-2">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <h3 className="text-sm font-semibold">{t("bp.apply.preview")}</h3>
                  <p className="text-xs text-muted-foreground">
                    {t("bp.apply.version")} {selected.version.version_number} ·{" "}
                    {selected.version.step_count} {t("bp.stepCount").toLowerCase()}
                    {selected.version.published_at
                      ? ` · ${formatDateTime(selected.version.published_at, { locale })}`
                      : ""}
                  </p>
                </div>

                {previewState === "loading" ? (
                  <PanelSkeleton rows={3} />
                ) : previewState === "error" ? (
                  <p className="surface-panel px-4 py-3 text-sm text-destructive">
                    {t("bp.apply.previewError")}
                  </p>
                ) : previewState === "empty" ? (
                  <p className="surface-panel px-4 py-3 text-sm text-muted-foreground">
                    {t("bp.apply.previewEmpty")}
                  </p>
                ) : (
                  <ol className="space-y-2">
                    {rows.map((row: (typeof rows)[number]) => (
                      <li key={row.sequence} className="surface-panel p-3">
                        <div className="flex flex-wrap items-center gap-2">
                          <Chip className="bg-primary-soft text-primary">
                            {t("bp.step.sequence")} {row.sequence}
                          </Chip>
                          <Chip className="border border-border text-muted-foreground">
                            {t(`w04.kind.${row.stepKind}`)}
                          </Chip>
                          <Chip className="border border-border text-muted-foreground">
                            {t(`w04.requirement.${row.requirement}`)} ·{" "}
                            {t(`w04.population.${row.population}`)}
                          </Chip>
                          {row.travelerFacing ? (
                            <Chip className="border border-border text-muted-foreground">
                              {t("bp.apply.travelerFacing")}
                            </Chip>
                          ) : null}
                        </div>
                        <p className="mt-1.5 text-sm font-medium">{row.title}</p>
                        <p className="text-xs text-muted-foreground">
                          {formatOffset(row.offsetMinutes, t)}
                          {" · "}
                          {row.durationMinutes === null
                            ? t("bp.apply.noDuration")
                            : `${row.durationMinutes} min`}
                        </p>
                        <p className="text-sm tabular-nums">
                          {t("bp.apply.colStart")}: {dt(row.startIso)}
                          {row.endIso ? ` · ${t("bp.apply.colEnd")}: ${dt(row.endIso)}` : ""}
                        </p>
                      </li>
                    ))}
                  </ol>
                )}
              </div>
            ) : null}

            <p className="text-xs text-muted-foreground">{t("bp.apply.atomic")}</p>
          </div>
        )}

        <div aria-live="polite" className="sr-only">
          {apply.isPending
            ? t("bp.apply.working")
            : previewState === "loading"
              ? t("bp.apply.previewLoading")
              : ""}
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <Button
            variant="ghost"
            className="min-h-11"
            disabled={apply.isPending}
            onClick={() => onOpenChange(false)}
          >
            {t("common.cancel")}
          </Button>
          <Button
            className="min-h-11"
            disabled={!canSubmit}
            onClick={() => {
              if (!canSubmit) return;
              apply.mutate();
            }}
          >
            {apply.isPending ? t("bp.apply.working") : t("bp.apply.confirm")}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function JourneyPlanPage() {
  const { operationId } = useParams({ from: "/_authenticated/operations/$operationId/journey" });
  const { t, locale } = useI18n();
  const { tenant, role } = useTenant();
  const queryClient = useQueryClient();
  const [dialog, setDialog] = React.useState<null | "planned" | "ad_hoc">(null);
  const [forecastStep, setForecastStep] = React.useState<JourneyStepRow | null>(null);
  const [editingStep, setEditingStep] = React.useState<JourneyStepRow | null>(null);
  const [archivingStep, setArchivingStep] = React.useState<JourneyStepRow | null>(null);
  const [archiveReason, setArchiveReason] = React.useState("");
  const [applyOpen, setApplyOpen] = React.useState(false);

  const visitPoints = useQuery({
    queryKey: ["visit-points", operationId],
    enabled: Boolean(tenant?.id),
    queryFn: async () => {
      const [points, events] = await Promise.all([
        supabase
          .from("journey_visit_points")
          .select("*")
          .eq("operation_id", operationId)
          .order("sequence"),
        supabase
          .from("journey_visit_point_events")
          .select("*")
          .eq("operation_id", operationId)
          .order("occurred_at"),
      ]);
      if (points.error) throw points.error;
      if (events.error) throw events.error;
      return { points: points.data ?? [], events: events.data ?? [] };
    },
  });

  const provisioning = useQuery({
    queryKey: ["journey-provisioning", operationId],
    enabled: Boolean(tenant?.id),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("operation_journey_provisionings")
        .select(
          "*, journey_blueprint_versions(id, version_number, checksum, step_count, journey_blueprints(name))",
        )
        .eq("operation_id", operationId)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const journey = useQuery({
    queryKey: ["journey", operationId],
    enabled: Boolean(tenant?.id),
    queryFn: async () => {
      const [operation, steps, items, roles] = await Promise.all([
        supabase.from("operations").select("*").eq("id", operationId).maybeSingle(),
        supabase
          .from("journey_steps")
          .select("*")
          .eq("operation_id", operationId)
          .is("archived_at", null)
          .order("sequence"),
        supabase
          .from("playbook_items")
          .select("*")
          .eq("operation_id", operationId)
          .eq("is_active", true)
          .order("sequence"),
        supabase.from("operation_role_types").select("*").eq("is_active", true).order("sort_order"),
      ]);
      if (operation.error) throw operation.error;
      if (steps.error) throw steps.error;
      if (items.error) throw items.error;
      if (roles.error) throw roles.error;
      return {
        operation: operation.data,
        steps: steps.data ?? [],
        items: items.data ?? [],
        roleTypes: (roles.data ?? []) as RoleTypeRow[],
      };
    },
  });

  const reorder = useMutation({
    mutationFn: async (ids: string[]) => {
      const { error } = await supabase.rpc("reorder_journey_steps", {
        _operation_id: operationId,
        _step_ids: ids,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      feedback.success(t("w04.journey.reordered"));
      void queryClient.invalidateQueries({ queryKey: ["journey", operationId] });
    },
    onError: (error) => feedback.error(humanizeError(error, locale)),
  });

  const archiveStep = useMutation({
    mutationFn: async () => {
      if (!archivingStep) return;
      const { error } = await supabase.rpc("archive_journey_step", {
        _journey_step_id: archivingStep.id,
        _reason: archiveReason.trim(),
      });
      if (error) throw error;
    },
    onSuccess: async () => {
      feedback.success("Etapa removida da jornada");
      setArchivingStep(null);
      setArchiveReason("");
      await queryClient.invalidateQueries({ queryKey: ["journey", operationId] });
    },
    onError: (error) => feedback.error(humanizeError(error, locale)),
  });

  if (journey.isLoading || provisioning.isLoading) return <PanelSkeleton />;

  if (journey.isError || provisioning.isError) {
    return (
      <EmptyState
        icon={RouteIcon}
        title={t("op.loadError")}
        body={t("op.loadErrorBody")}
        action={
          <Button
            variant="outline"
            className="min-h-11"
            onClick={() => {
              void journey.refetch();
              void provisioning.refetch();
            }}
          >
            {t("op.retry")}
          </Button>
        }
      />
    );
  }

  const operation = journey.data?.operation;
  if (!operation) {
    return (
      <EmptyState
        icon={RouteIcon}
        title={t("w04.journey.forbidden")}
        body={t("w04.journey.forbiddenBody")}
      />
    );
  }

  const provisioned = provisioning.data;
  const provisionedVersion = provisioned?.journey_blueprint_versions ?? null;
  const journeyOrigin = buildJourneyOrigin({
    appliedAt: provisioned?.applied_at,
    versionId: provisionedVersion?.id,
    versionNumber: provisionedVersion?.version_number,
    checksum: provisionedVersion?.checksum,
    stepCount: provisionedVersion?.step_count,
    blueprintName: provisionedVersion?.journey_blueprints?.name,
  });

  const steps = journey.data?.steps ?? [];
  const items = journey.data?.items ?? [];
  const roleTypes = journey.data?.roleTypes ?? [];
  const baselineOpen = operation.status === "draft" || operation.status === "planning";
  const terminal = operation.status === "completed" || operation.status === "cancelled";
  const canManageSteps = baselineOpen && canEditBlueprints(role);

  const move = (index: number, direction: -1 | 1) => {
    const next = [...steps];
    const target = index + direction;
    const a = next[index];
    const b = next[target];
    if (!a || !b) return;
    next[index] = b;
    next[target] = a;
    reorder.mutate(next.map((step) => step.id));
  };

  return (
    <section className="space-y-4">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold">{t("w04.journey.title")}</h2>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
            {t("w04.journey.subtitle")}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {canEditBlueprints(role) && baselineOpen && steps.length === 0 && !provisioning.data ? (
            <Button variant="outline" className="min-h-11" onClick={() => setApplyOpen(true)}>
              <RouteIcon className="mr-1.5 size-4" aria-hidden="true" />
              {t("bp.apply.action")}
            </Button>
          ) : null}
          <Button
            className="min-h-11"
            onClick={() => setDialog(baselineOpen ? "planned" : "ad_hoc")}
            disabled={terminal}
          >
            <Plus className="mr-1.5 size-4" aria-hidden="true" />
            {baselineOpen ? t("w04.journey.addStep") : t("w04.journey.addAdHoc")}
          </Button>
        </div>
      </header>

      {journeyOrigin ? (
        <div className="surface-panel px-4 py-3 text-sm">
          <p className="font-medium">{t("bp.origin.title")}</p>
          <p className="mt-1 text-muted-foreground">
            {t("bp.origin.provisioned")} <span className="text-foreground">{journeyOrigin.blueprintName}</span> ·{" "}
            {t("bp.version")} {t("bp.versionShort")}{journeyOrigin.versionNumber}
            {journeyOrigin.stepCount === null
              ? ""
              : ` · ${journeyOrigin.stepCount} ${t("bp.stepCount").toLowerCase()}`}
            {journeyOrigin.checksumShort ? ` · ${t("bp.checksum")}: ` : ""}
            {journeyOrigin.checksumShort ? (
              <span className="font-mono text-xs">{journeyOrigin.checksumShort}</span>
            ) : null}{" "}
            · {t("bp.journeyOrigin.appliedAt")} {formatDateTime(journeyOrigin.appliedAt, {
              locale,
              ...(operation.timezone ? { timeZone: operation.timezone } : {}),
            })}
          </p>
        </div>
      ) : steps.length > 0 ? (
        <p className="text-xs text-muted-foreground">{t("bp.origin.manual")}</p>
      ) : null}

      {!baselineOpen ? (
        <p className="surface-panel px-4 py-3 text-sm text-muted-foreground">
          {t("w04.journey.frozen")}
        </p>
      ) : null}

      {steps.length === 0 ? (
        <EmptyState
          icon={RouteIcon}
          title={t("w04.journey.empty")}
          body={t("w04.journey.emptyBody")}
        />
      ) : (
        <ol className="space-y-3">
          {steps.map((step, index) => (
            <li key={step.id} className="surface-panel p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <Chip
                      className={
                        step.plan_origin === "planned"
                          ? "bg-primary-soft text-primary"
                          : "border border-warning/50 text-warning"
                      }
                    >
                      {t(`w04.origin.${step.plan_origin}`)}
                    </Chip>
                    <Chip className="border border-border text-muted-foreground">
                      {t(`w04.kind.${step.step_kind}`)}
                    </Chip>
                    {step.presence_requirement !== "none" ? (
                      <Chip className="border border-border text-muted-foreground">
                        {t(`w04.requirement.${step.presence_requirement}`)} ·{" "}
                        {t(`w04.population.${step.presence_population}`)}
                      </Chip>
                    ) : null}
                    {!isCanonicalPresence(step.step_kind, step.presence_requirement) ? (
                      <Chip className="border border-warning/50 text-warning">
                        {t("w04.contract.historical")}
                      </Chip>
                    ) : null}
                    {(() => {
                      const label = stepOriginLabel(step, journeyOrigin, {
                        prefix: t("bp.origin.step"),
                        versionShort: t("bp.versionShort"),
                      });
                      return label ? (
                        <Chip className="border border-border text-muted-foreground">{label}</Chip>
                      ) : null;
                    })()}
                  </div>
                  <h3 className="mt-2 text-base font-semibold">{step.title}</h3>
                  {step.location_label ? (
                    <p className="text-sm text-muted-foreground">{step.location_label}</p>
                  ) : null}
                  <dl className="mt-2 grid gap-x-6 gap-y-1 text-sm sm:grid-cols-2">
                    {step.planned_start ? (
                      <div className="flex gap-2">
                        <dt className="text-muted-foreground">{t("w04.planned")}</dt>
                        <dd className="tabular-nums">
                          {formatDateTime(step.planned_start, {
                            locale,
                            timeZone: operation.timezone,
                          })}
                        </dd>
                      </div>
                    ) : null}
                    {step.expected_start ? (
                      <div className="flex gap-2">
                        <dt className="text-muted-foreground">{t("w04.expected")}</dt>
                        <dd className="tabular-nums">
                          {formatDateTime(step.expected_start, {
                            locale,
                            timeZone: operation.timezone,
                          })}
                        </dd>
                      </div>
                    ) : null}
                  </dl>
                  {step.ad_hoc_reason ? (
                    <p className="mt-2 text-sm text-muted-foreground">
                      <span className="font-medium">{t("w04.origin.adHocReason")}: </span>
                      {step.ad_hoc_reason}
                    </p>
                  ) : null}
                </div>

                <div className="flex flex-wrap items-center justify-end gap-1">
                  {baselineOpen ? (
                    <>
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label={t("w04.journey.moveUp")}
                        disabled={index === 0 || reorder.isPending}
                        onClick={() => move(index, -1)}
                      >
                        <ChevronUp className="size-4" aria-hidden="true" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label={t("w04.journey.moveDown")}
                        disabled={index === steps.length - 1 || reorder.isPending}
                        onClick={() => move(index, 1)}
                      >
                        <ChevronDown className="size-4" aria-hidden="true" />
                      </Button>
                    </>
                  ) : null}
                  {canManageSteps ? (
                    <>
                      <Button
                        variant="outline"
                        size="sm"
                        className="min-h-9"
                        onClick={() => setEditingStep(step)}
                      >
                        <Pencil className="mr-1.5 size-4" aria-hidden="true" />
                        Editar
                      </Button>
                      {step.source_blueprint_version_id === null &&
                      step.source_blueprint_step_id === null ? (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="min-h-9 text-destructive hover:text-destructive"
                          onClick={() => {
                            setArchiveReason("");
                            setArchivingStep(step);
                          }}
                        >
                          <Trash2 className="mr-1.5 size-4" aria-hidden="true" />
                          Excluir
                        </Button>
                      ) : null}
                    </>
                  ) : null}
                  {!terminal ? (
                    <Button
                      variant="outline"
                      size="sm"
                      className="min-h-9"
                      onClick={() => setForecastStep(step)}
                    >
                      {t("w04.expected.change")}
                    </Button>
                  ) : null}
                </div>
              </div>

              <PlaybookEditor
                step={step}
                items={items.filter((item) => item.journey_step_id === step.id)}
                roleTypes={roleTypes}
                operationId={operationId}
                editable={isChecklistEditable(operation.status, role)}
              />

              <VisitPointsPanel
                stepId={step.id}
                operationId={operationId}
                points={(visitPoints.data?.points ?? []).filter(
                  (point) => point.journey_step_id === step.id,
                )}
                events={(visitPoints.data?.events ?? []).filter(
                  (event) => event.journey_step_id === step.id,
                )}
                editable={canEditBlueprints(role) && !terminal}
                isError={visitPoints.isError}
                isLoading={visitPoints.isLoading}
                onRetry={() => void visitPoints.refetch()}
              />
            </li>
          ))}
        </ol>
      )}

      <ApplyBlueprintDialog
        open={applyOpen}
        onOpenChange={setApplyOpen}
        operationId={operationId}
        plannedStart={operation.planned_start ?? null}
        timezone={operation.timezone ?? null}
      />

      <StepDialog
        open={dialog !== null}
        onOpenChange={(open) => setDialog(open ? dialog : null)}
        operationId={operationId}
        adHoc={dialog === "ad_hoc"}
      />
      <ForecastDialog
        step={forecastStep}
        onOpenChange={(open) => setForecastStep(open ? forecastStep : null)}
        operationId={operationId}
      />
      <EditJourneyStepDialog
        step={editingStep}
        operationId={operationId}
        onOpenChange={(open) => setEditingStep(open ? editingStep : null)}
      />
      <Dialog
        open={Boolean(archivingStep)}
        onOpenChange={(open) => {
          if (!open && !archiveStep.isPending) {
            setArchivingStep(null);
            setArchiveReason("");
          }
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Excluir etapa da Jornada</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              A etapa será arquivada, preservando o registro e a trilha de auditoria no banco de dados.
            </p>
            <p className="text-sm font-medium">{archivingStep?.title}</p>
            <div className="space-y-1.5">
              <Label htmlFor="journey-archive-reason">Motivo da exclusão</Label>
              <Textarea
                id="journey-archive-reason"
                value={archiveReason}
                onChange={(event) => setArchiveReason(event.target.value)}
                rows={3}
                placeholder="Informe o motivo para manter o histórico operacional."
              />
            </div>
            <div className="flex flex-col gap-2 sm:flex-row-reverse">
              <Button
                variant="destructive"
                className="min-h-11 sm:flex-1"
                disabled={!archiveReason.trim() || archiveStep.isPending}
                onClick={() => archiveStep.mutate()}
              >
                {archiveStep.isPending ? "Excluindo..." : "Confirmar exclusão"}
              </Button>
              <Button
                variant="outline"
                className="min-h-11 sm:flex-1"
                disabled={archiveStep.isPending}
                onClick={() => {
                  setArchivingStep(null);
                  setArchiveReason("");
                }}
              >
                {t("common.cancel")}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </section>
  );
}
