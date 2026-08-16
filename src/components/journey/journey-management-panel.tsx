import * as React from "react";
import { useLocation } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, Archive, ListChecks, LockKeyhole, Pencil, Trash2 } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { humanizeError } from "@/lib/auth";
import { useI18n } from "@/lib/i18n";
import { roleLabel, type RoleTypeRow } from "@/lib/w03";
import {
  PLAYBOOK_REQUIREMENTS,
  PRESENCE_POPULATIONS,
  allowedPresenceRequirements,
  defaultPresenceRequirement,
  type JourneyStepRow,
  type PlaybookItemRow,
  type PlaybookRequirement,
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
  "min-h-11 w-full rounded-lg border border-border bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50";

const copy = (locale: string, pt: string, en: string) =>
  locale.toLowerCase().startsWith("pt") ? pt : en;

function toLocalInput(iso: string | null) {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function toIsoOrNull(value: string) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

type ManagedStep = JourneyStepRow & {
  archived_at?: string | null;
  archived_by?: string | null;
  archive_reason?: string | null;
};

type ManagementData = {
  status: string;
  steps: ManagedStep[];
  items: PlaybookItemRow[];
  roleTypes: RoleTypeRow[];
};

export function JourneyManagementPanel({ operationId }: { operationId: string }) {
  const location = useLocation();
  const { t, locale } = useI18n();
  const queryClient = useQueryClient();
  const [editStep, setEditStep] = React.useState<ManagedStep | null>(null);
  const [archiveStep, setArchiveStep] = React.useState<ManagedStep | null>(null);
  const [editItem, setEditItem] = React.useState<PlaybookItemRow | null>(null);
  const [deactivateItem, setDeactivateItem] = React.useState<PlaybookItemRow | null>(null);

  const isJourney = location.pathname.endsWith(`/operations/${operationId}/journey`);

  const management = useQuery({
    queryKey: ["journey-management", operationId],
    enabled: isJourney,
    queryFn: async (): Promise<ManagementData> => {
      const [operation, steps, items, roles] = await Promise.all([
        supabase.from("operations").select("status").eq("id", operationId).single(),
        supabase.from("journey_steps").select("*").eq("operation_id", operationId).order("sequence"),
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
      if (roles.error) throw roles.error;
      return {
        status: operation.data.status,
        steps: ((steps.data ?? []) as ManagedStep[]).filter((step) => !step.archived_at),
        items: (items.data ?? []) as PlaybookItemRow[],
        roleTypes: (roles.data ?? []) as RoleTypeRow[],
      };
    },
  });

  const refresh = React.useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: ["journey", operationId] });
    void queryClient.invalidateQueries({ queryKey: ["journey-management", operationId] });
  }, [operationId, queryClient]);

  if (!isJourney) return null;

  if (management.isLoading) {
    return (
      <section className="surface-panel p-4" aria-label={copy(locale, "Gerenciamento da jornada", "Journey management")}>
        <p className="text-sm text-muted-foreground">{copy(locale, "Carregando controles de correção da jornada…", "Loading journey correction controls…")}</p>
      </section>
    );
  }

  if (management.isError || !management.data) {
    return (
      <section className="surface-panel p-4" role="alert">
        <div className="flex items-start gap-3">
          <AlertTriangle className="mt-0.5 size-5 shrink-0 text-destructive" aria-hidden="true" />
          <div>
            <p className="font-medium text-destructive">{copy(locale, "Não foi possível carregar os controles de edição.", "Could not load editing controls.")}</p>
            <p className="mt-1 text-sm text-muted-foreground">
              {copy(locale, "A jornada continua visível, mas o estado de edição não foi confirmado. Não assuma que editar ou excluir está indisponível.", "The journey remains visible, but its editing state could not be confirmed. Do not assume editing or removal is unavailable.")}
            </p>
            <Button className="mt-3" size="sm" variant="outline" onClick={() => management.refetch()} disabled={management.isFetching}>
              {management.isFetching ? copy(locale, "Atualizando…", "Refreshing…") : copy(locale, "Tentar novamente", "Try again")}
            </Button>
          </div>
        </div>
      </section>
    );
  }

  const editable = management.data.status === "draft" || management.data.status === "planning";

  if (!editable) {
    return (
      <section className="surface-panel p-4" aria-label={copy(locale, "Gerenciamento da jornada", "Journey management")}>
        <div className="flex items-start gap-3">
          <LockKeyhole className="mt-0.5 size-5 shrink-0 text-muted-foreground" aria-hidden="true" />
          <div>
            <p className="font-medium">{copy(locale, "Planejamento da jornada congelado", "Journey planning is frozen")}</p>
            <p className="mt-1 text-sm text-muted-foreground">
              {copy(
                locale,
                `A operação está em “${management.data.status}”. Editar ou excluir etapas e itens é permitido somente em Rascunho ou Planejamento. A partir de Ready, o COBS preserva o baseline e o histórico operacional.`,
                `The operation is “${management.data.status}”. Editing or removing steps and checklist items is allowed only in Draft or Planning. From Ready onward, COBS preserves the baseline and operational history.`,
              )}
            </p>
          </div>
        </div>
      </section>
    );
  }

  return (
    <>
      <section className="surface-panel p-4" aria-label={copy(locale, "Gerenciamento da jornada", "Journey management")}>
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <p className="font-medium">{copy(locale, "Gerenciar jornada", "Manage journey")}</p>
            <p className="mt-1 text-sm text-muted-foreground">
              {copy(locale, "Corrija etapas e itens de checklist antes da operação. Exclusões são arquivadas ou desativadas para preservar histórico.", "Correct steps and checklist items before the operation. Removals are archived or deactivated to preserve history.")}
            </p>
          </div>
          <span className="rounded-full border border-border px-2 py-1 font-mono text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
            {management.data.steps.length} {copy(locale, "etapas ativas", "active steps")}
          </span>
        </div>

        {management.data.steps.length === 0 ? (
          <div className="mt-3 rounded-xl border border-dashed border-border p-4 text-sm text-muted-foreground">
            {copy(locale, "Nenhuma etapa ativa para editar. Crie uma etapa ou aplique um roteiro antes de usar estes controles.", "No active steps to edit. Create a step or apply a journey template before using these controls.")}
          </div>
        ) : (
          <div className="mt-3 space-y-2">
            {management.data.steps.map((step) => {
              const stepItems = management.data.items.filter((item) => item.journey_step_id === step.id);
              const blueprintLocked = Boolean(step.source_blueprint_version_id || step.source_blueprint_step_id);
              return (
                <div key={step.id} className="rounded-xl border border-border/70 bg-background/40 p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">{step.sequence}. {step.title}</p>
                      <p className="text-xs text-muted-foreground">
                        {t(`w04.kind.${step.step_kind}`)} · {stepItems.length} {copy(locale, "item(ns) de checklist", "checklist item(s)")}
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <Button variant="outline" size="sm" className="min-h-9" onClick={() => setEditStep(step)}>
                        <Pencil className="mr-1.5 size-3.5" aria-hidden="true" />
                        {copy(locale, "Editar", "Edit")}
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        className="min-h-9"
                        disabled={blueprintLocked || stepItems.length > 0}
                        title={
                          blueprintLocked
                            ? copy(locale, "Etapas de blueprint não podem ser arquivadas individualmente.", "Blueprint steps cannot be archived individually.")
                            : stepItems.length > 0
                              ? copy(locale, "Desative os itens de checklist antes de arquivar a etapa.", "Deactivate checklist items before archiving the step.")
                              : undefined
                        }
                        onClick={() => setArchiveStep(step)}
                      >
                        <Archive className="mr-1.5 size-3.5" aria-hidden="true" />
                        {copy(locale, "Arquivar", "Archive")}
                      </Button>
                    </div>
                  </div>

                  {stepItems.length > 0 ? (
                    <div className="mt-3 border-t border-border/70 pt-2">
                      <p className="mb-2 flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
                        <ListChecks className="size-3.5" aria-hidden="true" /> Checklist
                      </p>
                      <ul className="space-y-1.5">
                        {stepItems.map((item) => (
                          <li key={item.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-elevated/40 px-2.5 py-2">
                            <span className="min-w-0 flex-1 truncate text-sm">{item.title}</span>
                            <div className="flex gap-1.5">
                              <Button variant="ghost" size="sm" className="min-h-8" onClick={() => setEditItem(item)}>
                                <Pencil className="mr-1 size-3.5" aria-hidden="true" /> {copy(locale, "Editar", "Edit")}
                              </Button>
                              <Button variant="ghost" size="sm" className="min-h-8 text-destructive" onClick={() => setDeactivateItem(item)}>
                                <Trash2 className="mr-1 size-3.5" aria-hidden="true" /> {copy(locale, "Excluir", "Remove")}
                              </Button>
                            </div>
                          </li>
                        ))}
                      </ul>
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>
        )}
      </section>

      <EditStepDialog step={editStep} operationId={operationId} onClose={() => setEditStep(null)} onSaved={refresh} />
      <ArchiveStepDialog step={archiveStep} onClose={() => setArchiveStep(null)} onSaved={refresh} />
      <EditItemDialog item={editItem} roleTypes={management.data.roleTypes} onClose={() => setEditItem(null)} onSaved={refresh} />
      <DeactivateItemDialog item={deactivateItem} onClose={() => setDeactivateItem(null)} onSaved={refresh} />
    </>
  );
}

function EditStepDialog({ step, operationId: _operationId, onClose, onSaved }: { step: ManagedStep | null; operationId: string; onClose: () => void; onSaved: () => void }) {
  const { t, locale } = useI18n();
  const [title, setTitle] = React.useState("");
  const [description, setDescription] = React.useState("");
  const [location, setLocation] = React.useState("");
  const [travelerLabel, setTravelerLabel] = React.useState("");
  const [travelerFacing, setTravelerFacing] = React.useState(false);
  const [start, setStart] = React.useState("");
  const [end, setEnd] = React.useState("");
  const [requirement, setRequirement] = React.useState<PresenceRequirement>("none");
  const [population, setPopulation] = React.useState<PresencePopulation>("participants");

  React.useEffect(() => {
    if (!step) return;
    setTitle(step.title);
    setDescription(step.description ?? "");
    setLocation(step.location_label ?? "");
    setTravelerLabel(step.traveler_label ?? "");
    setTravelerFacing(step.traveler_facing);
    setStart(toLocalInput(step.planned_start));
    setEnd(toLocalInput(step.planned_end));
    setRequirement(step.presence_requirement);
    setPopulation(step.presence_population);
  }, [step]);

  const allowed = step ? allowedPresenceRequirements(step.step_kind) : ["none" as PresenceRequirement];
  React.useEffect(() => {
    if (step && !allowed.includes(requirement)) setRequirement(defaultPresenceRequirement(step.step_kind));
  }, [allowed, requirement, step]);

  const save = useMutation({
    mutationFn: async () => {
      if (!step) return;
      const startIso = toIsoOrNull(start);
      const endIso = toIsoOrNull(end);
      if (start && !startIso) throw new Error(copy(locale, "Horário inicial inválido.", "Invalid start time."));
      if (end && !endIso) throw new Error(copy(locale, "Horário final inválido.", "Invalid end time."));
      if (startIso && endIso && new Date(endIso).getTime() <= new Date(startIso).getTime()) {
        throw new Error(copy(locale, "O fim planejado precisa ser posterior ao início.", "Planned end must be after start."));
      }
      const { error } = await supabase.rpc("update_journey_step", {
        _journey_step_id: step.id,
        _title: title.trim(),
        _description: description,
        _location_label: location,
        _traveler_label: travelerLabel,
        _traveler_facing: travelerFacing,
        _planned_start: startIso ?? undefined,
        _planned_end: endIso ?? undefined,
        _presence_requirement: requirement,
        _presence_population: population,
        _apply_planned: step.plan_origin === "planned",
      });
      if (error) throw error;
    },
    onSuccess: () => {
      feedback.success(copy(locale, "Etapa atualizada.", "Step updated."));
      onSaved();
      onClose();
    },
    onError: (error) => feedback.error(humanizeError(error, locale)),
  });

  return (
    <Dialog open={Boolean(step)} onOpenChange={(open) => (!open && !save.isPending ? onClose() : null)}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader><DialogTitle>{copy(locale, "Editar etapa", "Edit step")}</DialogTitle></DialogHeader>
        {step ? <div className="space-y-4">
          <div className="space-y-1.5"><Label>{copy(locale, "Título", "Title")}</Label><Input value={title} disabled={save.isPending} onChange={(e) => setTitle(e.target.value)} /></div>
          <div className="space-y-1.5"><Label>{copy(locale, "Descrição", "Description")}</Label><Textarea value={description} disabled={save.isPending} onChange={(e) => setDescription(e.target.value)} rows={2} /></div>
          <div className="space-y-1.5"><Label>{copy(locale, "Local", "Location")}</Label><Input value={location} disabled={save.isPending} onChange={(e) => setLocation(e.target.value)} /></div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5"><Label>{copy(locale, "Início planejado", "Planned start")}</Label><Input type="datetime-local" value={start} disabled={step.plan_origin !== "planned" || save.isPending} onChange={(e) => setStart(e.target.value)} /></div>
            <div className="space-y-1.5"><Label>{copy(locale, "Fim planejado", "Planned end")}</Label><Input type="datetime-local" value={end} disabled={step.plan_origin !== "planned" || save.isPending} onChange={(e) => setEnd(e.target.value)} /></div>
          </div>
          <div className="space-y-1.5"><Label>{t("w04.field.presenceRequirement")}</Label><select className={SELECT_CLASS} value={requirement} disabled={save.isPending} onChange={(e) => setRequirement(e.target.value as PresenceRequirement)}>{allowed.map((value) => <option key={value} value={value}>{t(`w04.requirement.${value}`)}</option>)}</select></div>
          {requirement !== "none" ? <div className="space-y-1.5"><Label>{t("w04.field.presencePopulation")}</Label><select className={SELECT_CLASS} value={population} disabled={save.isPending} onChange={(e) => setPopulation(e.target.value as PresencePopulation)}>{PRESENCE_POPULATIONS.map((value) => <option key={value} value={value}>{t(`w04.population.${value}`)}</option>)}</select></div> : null}
          <div className="space-y-1.5"><Label>{copy(locale, "Nome para o viajante", "Traveler label")}</Label><Input value={travelerLabel} disabled={save.isPending} onChange={(e) => setTravelerLabel(e.target.value)} /><label className="flex items-center gap-2 text-sm"><Checkbox checked={travelerFacing} disabled={save.isPending} onCheckedChange={(value) => setTravelerFacing(value === true)} /> {copy(locale, "Visível para o viajante", "Visible to traveler")}</label></div>
          <Button className="w-full" disabled={!title.trim() || save.isPending} onClick={() => save.mutate()}>{save.isPending ? copy(locale, "Salvando…", "Saving…") : copy(locale, "Salvar alterações", "Save changes")}</Button>
        </div> : null}
      </DialogContent>
    </Dialog>
  );
}

function ArchiveStepDialog({ step, onClose, onSaved }: { step: ManagedStep | null; onClose: () => void; onSaved: () => void }) {
  const { locale } = useI18n();
  const [reason, setReason] = React.useState("");
  React.useEffect(() => setReason(""), [step?.id]);
  const archive = useMutation({
    mutationFn: async () => {
      if (!step) return;
      const { error } = await (supabase.rpc as unknown as (fn: string, args: Record<string, unknown>) => Promise<{ error: unknown }>)("archive_journey_step", {
        _journey_step_id: step.id,
        _reason: reason.trim(),
      });
      if (error) throw error;
    },
    onSuccess: () => { feedback.success(copy(locale, "Etapa arquivada. O histórico foi preservado.", "Step archived. History was preserved.")); onSaved(); onClose(); },
    onError: (error) => feedback.error(humanizeError(error, locale)),
  });
  return <Dialog open={Boolean(step)} onOpenChange={(open) => (!open && !archive.isPending ? onClose() : null)}><DialogContent className="sm:max-w-md"><DialogHeader><DialogTitle>{copy(locale, "Arquivar etapa", "Archive step")}</DialogTitle></DialogHeader><p className="text-sm text-muted-foreground">{copy(locale, "A etapa sairá da jornada ativa, mas não será apagada fisicamente.", "The step will leave the active journey but will not be physically deleted.")}</p><div className="space-y-1.5"><Label>{copy(locale, "Motivo do arquivamento", "Archive reason")}</Label><Textarea value={reason} disabled={archive.isPending} onChange={(e) => setReason(e.target.value)} rows={3} /></div><Button variant="destructive" disabled={!reason.trim() || archive.isPending} onClick={() => archive.mutate()}>{archive.isPending ? copy(locale, "Arquivando…", "Archiving…") : copy(locale, "Confirmar arquivamento", "Confirm archive")}</Button></DialogContent></Dialog>;
}

function EditItemDialog({ item, roleTypes, onClose, onSaved }: { item: PlaybookItemRow | null; roleTypes: RoleTypeRow[]; onClose: () => void; onSaved: () => void }) {
  const { t, locale } = useI18n();
  const [title, setTitle] = React.useState("");
  const [requirement, setRequirement] = React.useState<PlaybookRequirement>("required");
  const [ownerRole, setOwnerRole] = React.useState("");
  React.useEffect(() => { if (item) { setTitle(item.title); setRequirement(item.requirement); setOwnerRole(item.owner_role_type_id ?? ""); } }, [item]);
  const save = useMutation({
    mutationFn: async () => {
      if (!item) return;
      const { error } = await supabase.rpc("update_playbook_item", {
        _playbook_item_id: item.id,
        _title: title.trim(),
        _requirement: requirement,
        ...(ownerRole ? { _owner_role_type_id: ownerRole } : {}),
      });
      if (error) throw error;
    },
    onSuccess: () => { feedback.success(copy(locale, "Item do checklist atualizado.", "Checklist item updated.")); onSaved(); onClose(); },
    onError: (error) => feedback.error(humanizeError(error, locale)),
  });
  return <Dialog open={Boolean(item)} onOpenChange={(open) => (!open && !save.isPending ? onClose() : null)}><DialogContent className="sm:max-w-md"><DialogHeader><DialogTitle>{copy(locale, "Editar item do checklist", "Edit checklist item")}</DialogTitle></DialogHeader><div className="space-y-3"><div className="space-y-1.5"><Label>{copy(locale, "Título", "Title")}</Label><Input value={title} disabled={save.isPending} onChange={(e) => setTitle(e.target.value)} /></div><div className="space-y-1.5"><Label>{copy(locale, "Obrigatoriedade", "Requirement")}</Label><select className={SELECT_CLASS} value={requirement} disabled={save.isPending} onChange={(e) => setRequirement(e.target.value as PlaybookRequirement)}>{PLAYBOOK_REQUIREMENTS.map((value) => <option key={value} value={value}>{t(`w04.requirementLabel.${value}`)}</option>)}</select></div><div className="space-y-1.5"><Label>{copy(locale, "Responsabilidade", "Responsibility")}</Label><select className={SELECT_CLASS} value={ownerRole} disabled={save.isPending} onChange={(e) => setOwnerRole(e.target.value)}><option value="">{copy(locale, "Sem alteração", "No change")}</option>{roleTypes.map((role) => <option key={role.id} value={role.id}>{roleLabel(role, t)}</option>)}</select></div><Button className="w-full" disabled={!title.trim() || save.isPending} onClick={() => save.mutate()}>{save.isPending ? copy(locale, "Salvando…", "Saving…") : copy(locale, "Salvar item", "Save item")}</Button></div></DialogContent></Dialog>;
}

function DeactivateItemDialog({ item, onClose, onSaved }: { item: PlaybookItemRow | null; onClose: () => void; onSaved: () => void }) {
  const { locale } = useI18n();
  const [reason, setReason] = React.useState("");
  React.useEffect(() => setReason(""), [item?.id]);
  const deactivate = useMutation({
    mutationFn: async () => {
      if (!item) return;
      const { error } = await supabase.rpc("deactivate_playbook_item", { _playbook_item_id: item.id, _reason: reason.trim() });
      if (error) throw error;
    },
    onSuccess: () => { feedback.success(copy(locale, "Item removido do checklist ativo.", "Item removed from the active checklist.")); onSaved(); onClose(); },
    onError: (error) => feedback.error(humanizeError(error, locale)),
  });
  return <Dialog open={Boolean(item)} onOpenChange={(open) => (!open && !deactivate.isPending ? onClose() : null)}><DialogContent className="sm:max-w-md"><DialogHeader><DialogTitle>{copy(locale, "Excluir item do checklist", "Remove checklist item")}</DialogTitle></DialogHeader><p className="text-sm text-muted-foreground">{copy(locale, "O item será desativado, preservando o registro para auditoria.", "The item will be deactivated, preserving its audit record.")}</p><div className="space-y-1.5"><Label>{copy(locale, "Motivo", "Reason")}</Label><Textarea value={reason} disabled={deactivate.isPending} onChange={(e) => setReason(e.target.value)} rows={3} /></div><Button variant="destructive" disabled={!reason.trim() || deactivate.isPending} onClick={() => deactivate.mutate()}>{deactivate.isPending ? copy(locale, "Excluindo…", "Removing…") : copy(locale, "Confirmar exclusão", "Confirm removal")}</Button></DialogContent></Dialog>;
}
