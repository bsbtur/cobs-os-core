import * as React from "react";
import { createFileRoute, useParams } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronDown, ChevronUp, ListChecks, Plus, Route as RouteIcon } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { humanizeError } from "@/lib/auth";
import { useI18n } from "@/lib/i18n";
import { formatDateTime } from "@/lib/format";
import { useTenant } from "@/lib/tenant";
import { roleLabel, type RoleTypeRow } from "@/lib/w03";
import {
  PLAYBOOK_REQUIREMENTS,
  PRESENCE_POPULATIONS,
  PRESENCE_REQUIREMENTS,
  STEP_KINDS,
  defaultPresenceRequirement,
  newIdempotencyKey,
  type JourneyStepRow,
  type PlaybookItemRow,
  type PlaybookRequirement,
  type PresencePopulation,
  type PresenceRequirement,
  type StepKind,
} from "@/lib/w04";
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

  React.useEffect(() => {
    setRequirement(defaultPresenceRequirement(kind));
  }, [kind]);

  const save = useMutation({
    mutationFn: async () => {
      const startIso = toIsoOrNull(start);
      const endIso = toIsoOrNull(end);
      const shared = {
        _operation_id: operationId,
        _title: title.trim(),
        _step_kind: kind,
        _idempotency_key: idempotencyKey.current,
        _traveler_facing: travelerFacing,
        _presence_requirement: requirement,
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
          <DialogTitle>
            {adHoc ? t("w04.journey.addAdHoc") : t("w04.journey.addStep")}
          </DialogTitle>
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
              {PRESENCE_REQUIREMENTS.map((value) => (
                <option key={value} value={value}>
                  {t(`w04.requirement.${value}`)}
                </option>
              ))}
            </select>
            <p className="text-xs text-muted-foreground">{t(`w04.requirement.${requirement}Hint`)}</p>
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

          <Button
            className="min-h-11 w-full"
            disabled={disabled}
            onClick={() => save.mutate()}
          >
            {t("w04.journey.addStep")}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/* ------------------------------------------------------------------ */
/* Forecast + checklist editors                                        */
/* ------------------------------------------------------------------ */

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

function PlaybookEditor({
  step,
  items,
  roleTypes,
  operationId,
}: {
  step: JourneyStepRow;
  items: PlaybookItemRow[];
  roleTypes: RoleTypeRow[];
  operationId: string;
}) {
  const { t, locale } = useI18n();
  const queryClient = useQueryClient();
  const [title, setTitle] = React.useState("");
  const [requirement, setRequirement] = React.useState<PlaybookRequirement>("required");
  const [ownerRole, setOwnerRole] = React.useState("");

  const add = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.rpc("create_playbook_item", {
        _journey_step_id: step.id,
        _title: title.trim(),
        _idempotency_key: newIdempotencyKey(),
        _requirement: requirement,
        _owner_role_type_id: ownerRole || undefined,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      feedback.success(t("w04.playbook.added"));
      setTitle("");
      void queryClient.invalidateQueries({ queryKey: ["journey", operationId] });
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
              <span className="min-w-0 flex-1 truncate">{item.title}</span>
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
            </li>
          ))}
        </ul>
      )}

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
          disabled={!title.trim() || add.isPending}
          onClick={() => add.mutate()}
        >
          <Plus className="mr-1.5 size-4" aria-hidden="true" />
          {t("w04.playbook.add")}
        </Button>
      </div>
      <p className="mt-2 text-xs text-muted-foreground">{t("w04.playbook.ownerHint")}</p>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Page                                                                */
/* ------------------------------------------------------------------ */

function JourneyPlanPage() {
  const { operationId } = useParams({ from: "/_authenticated/operations/$operationId/journey" });
  const { t, locale } = useI18n();
  const { tenant } = useTenant();
  const queryClient = useQueryClient();
  const [dialog, setDialog] = React.useState<null | "planned" | "ad_hoc">(null);
  const [forecastStep, setForecastStep] = React.useState<JourneyStepRow | null>(null);

  const journey = useQuery({
    queryKey: ["journey", operationId],
    queryFn: async () => {
      const [operation, steps, items, roles] = await Promise.all([
        supabase.from("operations").select("*").eq("id", operationId).maybeSingle(),
        supabase
          .from("journey_steps")
          .select("*")
          .eq("operation_id", operationId)
          .order("sequence"),
        supabase
          .from("playbook_items")
          .select("*")
          .eq("operation_id", operationId)
          .eq("is_active", true)
          .order("sequence"),
        supabase
          .from("operation_role_types")
          .select("*")
          .eq("is_active", true)
          .order("sort_order"),
      ]);
      if (operation.error) throw operation.error;
      if (steps.error) throw steps.error;
      if (items.error) throw items.error;
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

  if (journey.isLoading) return <PanelSkeleton />;

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

  const steps = journey.data?.steps ?? [];
  const items = journey.data?.items ?? [];
  const roleTypes = journey.data?.roleTypes ?? [];
  const baselineOpen = operation.status === "draft" || operation.status === "planning";

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
        <Button
          className="min-h-11"
          onClick={() => setDialog(baselineOpen ? "planned" : "ad_hoc")}
          disabled={operation.status === "completed" || operation.status === "cancelled"}
        >
          <Plus className="mr-1.5 size-4" aria-hidden="true" />
          {baselineOpen ? t("w04.journey.addStep") : t("w04.journey.addAdHoc")}
        </Button>
      </header>

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

                <div className="flex items-center gap-1">
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
                  <Button
                    variant="outline"
                    size="sm"
                    className="min-h-9"
                    onClick={() => setForecastStep(step)}
                  >
                    {t("w04.expected.change")}
                  </Button>
                </div>
              </div>

              <PlaybookEditor
                step={step}
                items={items.filter((item) => item.journey_step_id === step.id)}
                roleTypes={roleTypes}
                operationId={operationId}
              />
            </li>
          ))}
        </ol>
      )}

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
    </section>
  );
}
