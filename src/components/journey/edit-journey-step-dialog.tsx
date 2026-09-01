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

type DynamicAlertType = "time_changed" | "location_changed" | "delay";

function toLocalInput(iso: string | null) {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function toIsoOrUndefined(value: string) {
  if (!value) return undefined;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
}

function defaultAlertCopy(type: DynamicAlertType, stepTitle: string, location: string, plannedStart: string) {
  if (type === "location_changed") {
    return {
      title: `Ponto atualizado · ${stepTitle}`,
      body: location.trim()
        ? `O ponto/local de ${stepTitle} foi atualizado para ${location.trim()}.`
        : `O ponto/local de ${stepTitle} foi atualizado. Consulte o roteiro para os detalhes.`,
    };
  }
  if (type === "delay") {
    return {
      title: `Atraso operacional · ${stepTitle}`,
      body: `Há um atraso em ${stepTitle}. Consulte o roteiro para a previsão operacional mais recente.`,
    };
  }
  const date = plannedStart ? new Date(plannedStart) : null;
  const time = date && !Number.isNaN(date.getTime()) ? date.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }) : null;
  return {
    title: `Horário atualizado · ${stepTitle}`,
    body: time
      ? `O horário de ${stepTitle} foi atualizado para ${time}.`
      : `O horário de ${stepTitle} foi atualizado. Consulte o roteiro para os detalhes.`,
  };
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
  const [communicate, setCommunicate] = React.useState(false);
  const [alertType, setAlertType] = React.useState<DynamicAlertType>("time_changed");
  const [alertTitle, setAlertTitle] = React.useState("");
  const [alertBody, setAlertBody] = React.useState("");

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
    setCommunicate(false);
    setAlertType("time_changed");
    setAlertTitle("");
    setAlertBody("");
  }, [step]);

  const allowed = step ? allowedPresenceRequirements(step.step_kind) : [];

  React.useEffect(() => {
    if (step && !allowed.includes(requirement)) setRequirement(step.presence_requirement);
  }, [allowed, requirement, step]);

  React.useEffect(() => {
    if (!step || !communicate) return;
    const copy = defaultAlertCopy(alertType, title.trim() || step.title, location, plannedStart);
    setAlertTitle(copy.title);
    setAlertBody(copy.body);
  }, [alertType, communicate, location, plannedStart, step, title]);

  const save = useMutation({
    mutationFn: async () => {
      if (!step) return;
      const startIso = toIsoOrUndefined(plannedStart);
      const endIso = toIsoOrUndefined(plannedEnd);
      const { error } = await supabase.rpc("update_journey_step", {
        _journey_step_id: step.id,
        _title: title.trim(),
        _description: description,
        _location_label: location,
        _traveler_label: travelerLabel,
        _traveler_facing: travelerFacing,
        _presence_requirement: requirement,
        _presence_population: population,
        _apply_planned: step.plan_origin === "planned",
        ...(startIso ? { _planned_start: startIso } : {}),
        ...(endIso ? { _planned_end: endIso } : {}),
      });
      if (error) throw error;

      if (communicate) {
        const idempotencyKey = `journey-step:${step.id}:${alertType}:${crypto.randomUUID()}`;
        const { error: alertError } = await supabase.rpc("publish_dynamic_operational_alert", {
          _operation_id: operationId,
          _alert_type: alertType,
          _title: alertTitle.trim(),
          _body: alertBody.trim(),
          _source_kind: "journey_step",
          _source_id: step.id,
          _idempotency_key: idempotencyKey,
          _priority: alertType === "delay" ? "urgent" : "important",
        });
        if (alertError) throw alertError;
      }
    },
    onSuccess: async () => {
      feedback.success(communicate ? "Alteração salva e comunicada aos viajantes." : t("w04.journey.saved"));
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["journey", operationId] }),
        queryClient.invalidateQueries({ queryKey: ["messages", operationId] }),
      ]);
      onOpenChange(false);
    },
    onError: (error) => feedback.error(humanizeError(error, locale)),
  });

  const alertReady = !communicate || (alertTitle.trim().length > 0 && alertBody.trim().length > 0);

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
              <Input id="edit-step-title" value={title} onChange={(event) => setTitle(event.target.value)} className="min-h-11" />
            </div>

            <div className="space-y-1.5">
              <Label>{t("w04.field.kind")}</Label>
              <Input value={t(`w04.kind.${step.step_kind}`)} disabled className="min-h-11" />
            </div>

            {step.plan_origin === "planned" ? (
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="edit-step-start">{t("w04.field.plannedStart")}</Label>
                  <Input id="edit-step-start" type="datetime-local" value={plannedStart} onChange={(event) => setPlannedStart(event.target.value)} className="min-h-11" />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="edit-step-end">{t("w04.field.plannedEnd")}</Label>
                  <Input id="edit-step-end" type="datetime-local" value={plannedEnd} onChange={(event) => setPlannedEnd(event.target.value)} className="min-h-11" />
                </div>
              </div>
            ) : null}

            <div className="space-y-1.5">
              <Label htmlFor="edit-step-location">{t("w04.field.location")}</Label>
              <Input id="edit-step-location" value={location} onChange={(event) => setLocation(event.target.value)} className="min-h-11" />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="edit-step-requirement">{t("w04.field.presenceRequirement")}</Label>
              <select id="edit-step-requirement" className={SELECT_CLASS} value={requirement} onChange={(event) => setRequirement(event.target.value as PresenceRequirement)}>
                {allowed.map((value) => <option key={value} value={value}>{t(`w04.requirement.${value}`)}</option>)}
              </select>
            </div>

            {requirement !== "none" ? (
              <div className="space-y-1.5">
                <Label htmlFor="edit-step-population">{t("w04.field.presencePopulation")}</Label>
                <select id="edit-step-population" className={SELECT_CLASS} value={population} onChange={(event) => setPopulation(event.target.value as PresencePopulation)}>
                  {PRESENCE_POPULATIONS.map((value) => <option key={value} value={value}>{t(`w04.population.${value}`)}</option>)}
                </select>
              </div>
            ) : null}

            <div className="space-y-1.5">
              <Label htmlFor="edit-step-traveler">{t("w04.field.travelerLabel")}</Label>
              <Input id="edit-step-traveler" value={travelerLabel} onChange={(event) => setTravelerLabel(event.target.value)} className="min-h-11" />
              <label className="mt-2 flex items-center gap-2 text-sm">
                <Checkbox checked={travelerFacing} onCheckedChange={(value) => setTravelerFacing(value === true)} />
                {t("w04.field.travelerFacing")}
              </label>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="edit-step-description">{t("w04.field.description")}</Label>
              <Textarea id="edit-step-description" value={description} onChange={(event) => setDescription(event.target.value)} rows={2} />
              <p className="text-xs text-muted-foreground">{t("w04.field.noteHint")}</p>
            </div>

            <div className="rounded-lg border border-border bg-muted/30 p-4 space-y-3">
              <label className="flex items-start gap-3 text-sm font-medium">
                <Checkbox checked={communicate} onCheckedChange={(value) => setCommunicate(value === true)} />
                <span>
                  Comunicar aos viajantes
                  <span className="mt-1 block text-xs font-normal text-muted-foreground">A alteração só vira mensagem quando esta opção for marcada.</span>
                </span>
              </label>

              {communicate ? (
                <div className="space-y-3 border-t border-border pt-3">
                  <div className="space-y-1.5">
                    <Label htmlFor="dynamic-alert-type">Tipo da comunicação</Label>
                    <select id="dynamic-alert-type" className={SELECT_CLASS} value={alertType} onChange={(event) => setAlertType(event.target.value as DynamicAlertType)}>
                      <option value="time_changed">Mudança de horário</option>
                      <option value="location_changed">Mudança de ponto/local</option>
                      <option value="delay">Atraso</option>
                    </select>
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="dynamic-alert-title">Título para o viajante</Label>
                    <Input id="dynamic-alert-title" value={alertTitle} onChange={(event) => setAlertTitle(event.target.value)} className="min-h-11" />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="dynamic-alert-body">Mensagem</Label>
                    <Textarea id="dynamic-alert-body" value={alertBody} onChange={(event) => setAlertBody(event.target.value)} rows={3} />
                  </div>
                </div>
              ) : null}
            </div>

            <Button className="min-h-11 w-full" disabled={!title.trim() || !alertReady || save.isPending} onClick={() => save.mutate()}>
              {communicate ? "Salvar e comunicar" : t("w04.playbook.save")}
            </Button>
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
