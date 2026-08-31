import * as React from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";

import { supabase } from "@/integrations/supabase/client";
import { humanizeError } from "@/lib/auth";
import { useI18n } from "@/lib/i18n";
import {
  PRESENCE_POPULATIONS,
  allowedPresenceRequirements,
  type JourneyStepRow,
  type PresencePopulation,
  type PresenceRequirement,
} from "@/lib/w04";
import { feedback } from "@/components/feedback/feedback";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

const SELECT_CLASS =
  "min-h-11 w-full rounded-lg border border-border bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring";

function toLocalInput(iso: string | null) {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function toIsoOrNull(value: string) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

export function EditJourneyStepDialog({
  step,
  operationId,
  onOpenChange,
}: {
  step: JourneyStepRow | null;
  operationId: string;
  onOpenChange: (open: boolean) => void;
}) {
  const { t, locale } = useI18n();
  const queryClient = useQueryClient();
  const [title, setTitle] = React.useState("");
  const [description, setDescription] = React.useState("");
  const [location, setLocation] = React.useState("");
  const [travelerLabel, setTravelerLabel] = React.useState("");
  const [travelerFacing, setTravelerFacing] = React.useState(false);
  const [plannedStart, setPlannedStart] = React.useState("");
  const [plannedEnd, setPlannedEnd] = React.useState("");
  const [requirement, setRequirement] = React.useState<PresenceRequirement>("none");
  const [population, setPopulation] = React.useState<PresencePopulation>("participants");

  React.useEffect(() => {
    if (!step) return;
    setTitle(step.title);
    setDescription(step.description ?? "");
    setLocation(step.location_label ?? "");
    setTravelerLabel(step.traveler_label ?? "");
    setTravelerFacing(step.traveler_facing);
    setPlannedStart(toLocalInput(step.planned_start));
    setPlannedEnd(toLocalInput(step.planned_end));
    setRequirement(step.presence_requirement);
    setPopulation(step.presence_population);
  }, [step]);

  const allowed = step ? allowedPresenceRequirements(step.step_kind) : [];

  React.useEffect(() => {
    if (step && !allowed.includes(requirement)) setRequirement(step.presence_requirement);
  }, [allowed, requirement, step]);

  const save = useMutation({
    mutationFn: async () => {
      if (!step) return;
      const { error } = await supabase.rpc("update_journey_step", {
        _journey_step_id: step.id,
        _title: title.trim(),
        _description: description,
        _location_label: location,
        _traveler_label: travelerLabel,
        _traveler_facing: travelerFacing,
        _planned_start: toIsoOrNull(plannedStart),
        _planned_end: toIsoOrNull(plannedEnd),
        _presence_requirement: requirement,
        _presence_population: population,
        _apply_planned: step.plan_origin === "planned",
      });
      if (error) throw error;
    },
    onSuccess: async () => {
      feedback.success(t("w04.journey.saved"));
      await queryClient.invalidateQueries({ queryKey: ["journey", operationId] });
      onOpenChange(false);
    },
    onError: (error) => feedback.error(humanizeError(error, locale)),
  });

  return (
    <Dialog open={Boolean(step)} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {t("w04.playbook.edit")} · {step?.title ?? t("w04.journey.title")}
          </DialogTitle>
        </DialogHeader>

        {step ? (
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="edit-step-title">{t("w04.field.title")}</Label>
              <Input
                id="edit-step-title"
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                className="min-h-11"
              />
            </div>

            <div className="space-y-1.5">
              <Label>{t("w04.field.kind")}</Label>
              <Input value={t(`w04.kind.${step.step_kind}`)} disabled className="min-h-11" />
            </div>

            {step.plan_origin === "planned" ? (
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="edit-step-start">{t("w04.field.plannedStart")}</Label>
                  <Input
                    id="edit-step-start"
                    type="datetime-local"
                    value={plannedStart}
                    onChange={(event) => setPlannedStart(event.target.value)}
                    className="min-h-11"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="edit-step-end">{t("w04.field.plannedEnd")}</Label>
                  <Input
                    id="edit-step-end"
                    type="datetime-local"
                    value={plannedEnd}
                    onChange={(event) => setPlannedEnd(event.target.value)}
                    className="min-h-11"
                  />
                </div>
              </div>
            ) : null}

            <div className="space-y-1.5">
              <Label htmlFor="edit-step-location">{t("w04.field.location")}</Label>
              <Input
                id="edit-step-location"
                value={location}
                onChange={(event) => setLocation(event.target.value)}
                className="min-h-11"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="edit-step-requirement">{t("w04.field.presenceRequirement")}</Label>
              <select
                id="edit-step-requirement"
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
            </div>

            {requirement !== "none" ? (
              <div className="space-y-1.5">
                <Label htmlFor="edit-step-population">{t("w04.field.presencePopulation")}</Label>
                <select
                  id="edit-step-population"
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
              </div>
            ) : null}

            <div className="space-y-1.5">
              <Label htmlFor="edit-step-traveler">{t("w04.field.travelerLabel")}</Label>
              <Input
                id="edit-step-traveler"
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
              <Label htmlFor="edit-step-description">{t("w04.field.description")}</Label>
              <Textarea
                id="edit-step-description"
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                rows={2}
              />
              <p className="text-xs text-muted-foreground">{t("w04.field.noteHint")}</p>
            </div>

            <Button
              className="min-h-11 w-full"
              disabled={!title.trim() || save.isPending}
              onClick={() => save.mutate()}
            >
              {t("w04.playbook.save")}
            </Button>
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
