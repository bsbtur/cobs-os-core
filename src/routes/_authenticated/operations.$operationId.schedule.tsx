import * as React from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, CalendarClock, Check, Clock3, UserCheck, Users, X } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { useI18n } from "@/lib/i18n";
import { useTenant } from "@/lib/tenant";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export const Route = createFileRoute("/_authenticated/operations/$operationId/schedule")({
  component: TeamSchedulePage,
});

type AssignmentStatus = "assigned" | "confirmed" | "declined" | "cancelled" | "completed";
type Candidate = {
  participationId: string;
  roleTypeId: string;
  personName: string;
  roleLabel: string;
};

type Assignment = {
  id: string;
  participation_id: string;
  role_type_id: string;
  report_at: string | null;
  starts_at: string;
  ends_at: string;
  status: AssignmentStatus;
  notes: string | null;
  operation_participations?: { people?: { id?: string | null; full_name?: string | null } | null } | null;
  operation_role_types?: { label?: string | null; key?: string | null } | null;
};

const copy = (locale: string, pt: string, en: string) =>
  locale.toLowerCase().startsWith("pt") ? pt : en;

function TeamSchedulePage() {
  const { operationId } = Route.useParams();
  const { locale } = useI18n();
  const { user } = useAuth();
  const { tenant, role } = useTenant();
  const qc = useQueryClient();
  const db = supabase as any;
  const canManage = role === "owner" || role === "admin" || role === "operations_agent";
  const [form, setForm] = React.useState({ candidate: "", reportAt: "", startsAt: "", endsAt: "", notes: "" });
  const [error, setError] = React.useState<string | null>(null);

  const query = useQuery({
    queryKey: ["px12-team-schedule", tenant?.id, operationId, user?.id],
    enabled: Boolean(tenant?.id),
    queryFn: async () => {
      const [operation, assignments, participations, conflicts, me] = await Promise.all([
        db.from("operations").select("id,name,code,timezone,planned_start,planned_end,status").eq("id", operationId).single(),
        db.from("operation_staff_assignments")
          .select("id,participation_id,role_type_id,report_at,starts_at,ends_at,status,notes,operation_participations(people(id,full_name)),operation_role_types(label,key)")
          .eq("operation_id", operationId)
          .order("starts_at"),
        db.from("operation_participations")
          .select("id,status,people(id,full_name),operation_role_assignments(role_type_id,operation_role_types(id,label,key,is_active))")
          .eq("operation_id", operationId)
          .neq("status", "cancelled"),
        db.rpc("get_operation_staff_assignment_conflicts", {
          _tenant_id: tenant!.id,
          _from: new Date(Date.now() - 86_400_000).toISOString(),
          _to: new Date(Date.now() + 90 * 86_400_000).toISOString(),
        }),
        user?.id ? db.from("people").select("id").eq("profile_id", user.id).maybeSingle() : Promise.resolve({ data: null, error: null }),
      ]);
      for (const result of [operation, assignments, participations, conflicts, me]) if (result.error) throw result.error;

      const candidates: Candidate[] = [];
      for (const participation of participations.data ?? []) {
        const person = one(participation.people);
        for (const assignment of participation.operation_role_assignments ?? []) {
          const roleType = one(assignment.operation_role_types);
          if (!roleType?.is_active) continue;
          candidates.push({
            participationId: participation.id,
            roleTypeId: assignment.role_type_id,
            personName: person?.full_name ?? copy(locale, "Pessoa", "Person"),
            roleLabel: roleType.label || humanize(roleType.key),
          });
        }
      }

      let myParticipationId: string | null = null;
      if (me.data?.id) {
        const mine = (participations.data ?? []).find((p: any) => one(p.people)?.id === me.data.id);
        myParticipationId = mine?.id ?? null;
      }

      return {
        operation: operation.data,
        assignments: (assignments.data ?? []) as Assignment[],
        candidates,
        conflicts: conflicts.data ?? [],
        myParticipationId,
      };
    },
  });

  const save = useMutation({
    mutationFn: async () => {
      setError(null);
      const candidate = query.data?.candidates.find((item) => `${item.participationId}:${item.roleTypeId}` === form.candidate);
      if (!candidate || !tenant?.id || !form.startsAt || !form.endsAt) {
        throw new Error(copy(locale, "Preencha profissional, função, início e fim.", "Fill professional, role, start and end."));
      }
      const start = new Date(form.startsAt);
      const end = new Date(form.endsAt);
      if (!Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime()) || end <= start) {
        throw new Error(copy(locale, "O fim da escala precisa ser posterior ao início.", "Schedule end must be after start."));
      }
      const { error: rpcError } = await db.rpc("save_operation_staff_assignment", {
        _tenant_id: tenant.id,
        _operation_id: operationId,
        _participation_id: candidate.participationId,
        _role_type_id: candidate.roleTypeId,
        _starts_at: start.toISOString(),
        _ends_at: end.toISOString(),
        _report_at: form.reportAt ? new Date(form.reportAt).toISOString() : null,
        _notes: form.notes || null,
        _assignment_id: null,
      });
      if (rpcError) throw rpcError;
    },
    onSuccess: async () => {
      setForm({ candidate: "", reportAt: "", startsAt: "", endsAt: "", notes: "" });
      await qc.invalidateQueries({ queryKey: ["px12-team-schedule", tenant?.id, operationId] });
    },
    onError: (err: any) => setError(err?.message ?? copy(locale, "Não foi possível salvar a escala.", "Could not save schedule.")),
  });

  const statusMutation = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: AssignmentStatus }) => {
      setError(null);
      const { error: rpcError } = await db.rpc("set_operation_staff_assignment_status", { _assignment_id: id, _status: status, _note: null });
      if (rpcError) throw rpcError;
    },
    onSuccess: async () => qc.invalidateQueries({ queryKey: ["px12-team-schedule", tenant?.id, operationId] }),
    onError: (err: any) => setError(err?.message ?? copy(locale, "Não foi possível alterar a escala.", "Could not update schedule.")),
  });

  const cancelAssignment = (id: string) => {
    if (query.data?.operation?.status === "completed" || query.data?.operation?.status === "cancelled") return;
    const confirmed = window.confirm(copy(
      locale,
      "Cancelar esta escala? O profissional deixará de aparecer como ativo nesta operação.",
      "Cancel this assignment? The professional will no longer appear as active in this operation.",
    ));
    if (!confirmed) return;
    statusMutation.mutate({ id, status: "cancelled" });
  };

  if (query.isLoading) return <div className="surface-panel p-5 text-sm text-muted-foreground">{copy(locale, "Carregando escala…", "Loading schedule…")}</div>;
  if (query.isError || !query.data) {
    return (
      <section className="surface-panel p-5">
        <div className="flex items-start gap-3 text-destructive">
          <AlertTriangle className="mt-0.5 size-5 shrink-0" aria-hidden="true" />
          <div>
            <p className="font-semibold">{copy(locale, "Não foi possível carregar a escala.", "Could not load schedule.")}</p>
            <p className="mt-1 text-sm text-muted-foreground">{copy(locale, "Os dados da equipe não foram confirmados. Tente atualizar antes de assumir que não há profissionais escalados.", "Team data could not be confirmed. Retry before assuming no professionals are scheduled.")}</p>
            <Button className="mt-3" variant="outline" size="sm" onClick={() => query.refetch()} disabled={query.isFetching}>
              {query.isFetching ? copy(locale, "Atualizando…", "Refreshing…") : copy(locale, "Tentar novamente", "Try again")}
            </Button>
          </div>
        </div>
      </section>
    );
  }

  const { operation, assignments, candidates, conflicts, myParticipationId } = query.data;
  const operationClosed = operation.status === "completed" || operation.status === "cancelled";
  const noCandidates = candidates.length === 0;
  const conflictIds = new Set(conflicts.flatMap((item: any) => [item.assignment_id, item.conflicting_assignment_id]));
  const actionsPending = save.isPending || statusMutation.isPending;

  return (
    <div className="space-y-5">
      <section className="surface-panel p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-primary">PX12.4 · Team Schedule</p>
            <h2 className="mt-1 text-xl font-semibold">{copy(locale, "Escala da equipe", "Team schedule")}</h2>
            <p className="mt-1 text-sm text-muted-foreground">{operation.name} · {operation.code}</p>
          </div>
          <div className="rounded-lg border border-border bg-background/60 px-3 py-2 text-xs text-muted-foreground">
            <CalendarClock className="mr-1 inline size-3.5" aria-hidden="true" />
            {copy(locale, "Operacional, não RH/ponto", "Operational, not HR/timekeeping")}
          </div>
        </div>
      </section>

      {operationClosed ? (
        <section className="surface-panel px-4 py-3 text-sm text-muted-foreground">
          <span className="font-medium text-foreground">{copy(locale, "Operação encerrada.", "Operation closed.")}</span>{" "}
          {copy(locale, "A escala está disponível somente para consulta histórica.", "The schedule is available for historical review only.")}
        </section>
      ) : null}

      {conflicts.length ? (
        <section className="rounded-xl border border-destructive/30 bg-destructive/10 p-4 text-destructive">
          <div className="flex items-center gap-2 font-semibold"><AlertTriangle className="size-4" />{copy(locale, "Conflito de escala detectado", "Schedule conflict detected")}</div>
          <p className="mt-1 text-sm opacity-85">{copy(locale, "Há sobreposição ativa. Revise os horários antes da operação.", "There is an active overlap. Review times before the operation.")}</p>
        </section>
      ) : null}

      {error ? <section className="rounded-xl border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive" role="alert">{error}</section> : null}

      {canManage && !operationClosed ? (
        <section className="surface-panel p-5">
          <h3 className="font-semibold">{copy(locale, "Adicionar à escala", "Add to schedule")}</h3>
          <p className="mt-1 text-xs text-muted-foreground">{copy(locale, "Somente pessoas e funções já vinculadas à operação aparecem aqui.", "Only people and roles already linked to the operation appear here.")}</p>
          {noCandidates ? (
            <div className="mt-4 rounded-lg border border-warning/30 bg-warning-soft p-3">
              <p className="text-sm font-semibold text-warning">{copy(locale, "Nenhum profissional elegível para escalar", "No eligible professional to schedule")}</p>
              <p className="mt-1 text-xs text-muted-foreground">{copy(locale, "Vincule primeiro uma pessoa e uma função ativa à operação; depois ela aparecerá aqui.", "First link a person and an active role to the operation; then it will appear here.")}</p>
            </div>
          ) : null}
          <div className="mt-4 grid gap-3 md:grid-cols-2">
            <label className="space-y-1 text-xs font-medium">
              <span>{copy(locale, "Profissional · função", "Professional · role")}</span>
              <select className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm" value={form.candidate} disabled={noCandidates || actionsPending} onChange={(e) => setForm((v) => ({ ...v, candidate: e.target.value }))}>
                <option value="">{copy(locale, "Selecione…", "Select…")}</option>
                {candidates.map((item) => <option key={`${item.participationId}:${item.roleTypeId}`} value={`${item.participationId}:${item.roleTypeId}`}>{item.personName} · {item.roleLabel}</option>)}
              </select>
            </label>
            <Field label={copy(locale, "Apresentação", "Report at")} value={form.reportAt} onChange={(value) => setForm((v) => ({ ...v, reportAt: value }))} />
            <Field label={copy(locale, "Início", "Start")} value={form.startsAt} onChange={(value) => setForm((v) => ({ ...v, startsAt: value }))} />
            <Field label={copy(locale, "Fim", "End")} value={form.endsAt} onChange={(value) => setForm((v) => ({ ...v, endsAt: value }))} />
            <label className="space-y-1 text-xs font-medium md:col-span-2"><span>{copy(locale, "Observações", "Notes")}</span><Input value={form.notes} onChange={(e) => setForm((v) => ({ ...v, notes: e.target.value }))} placeholder={copy(locale, "Ex.: chegar uniformizado na Torre de TV", "E.g. arrive in uniform at meeting point")} /></label>
          </div>
          <Button className="mt-4" onClick={() => save.mutate()} disabled={actionsPending || noCandidates}>{save.isPending ? copy(locale, "Salvando…", "Saving…") : copy(locale, "Adicionar escala", "Add schedule")}</Button>
        </section>
      ) : null}

      <section className="surface-panel overflow-hidden">
        <div className="border-b border-border px-5 py-4">
          <h3 className="font-semibold">{copy(locale, "Equipe escalada", "Scheduled team")}</h3>
          <p className="mt-1 text-xs text-muted-foreground">{assignments.length} {copy(locale, "atribuição(ões)", "assignment(s)")}</p>
        </div>
        {assignments.length ? (
          <div className="divide-y divide-border">
            {assignments.map((assignment) => {
              const person = one(assignment.operation_participations)?.people;
              const roleType = one(assignment.operation_role_types);
              const own = assignment.participation_id === myParticipationId;
              const conflicted = conflictIds.has(assignment.id);
              return (
                <article key={assignment.id} className="p-4 sm:p-5">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <Users className="size-4 text-primary" />
                        <p className="font-semibold">{person?.full_name ?? copy(locale, "Profissional", "Professional")}</p>
                        <Status status={assignment.status} locale={locale} />
                        {conflicted ? <span className="rounded-full bg-destructive/10 px-2 py-0.5 text-[10px] font-semibold text-destructive">{copy(locale, "CONFLITO", "CONFLICT")}</span> : null}
                      </div>
                      <p className="mt-1 text-sm text-muted-foreground">{roleType?.label || humanize(roleType?.key || "role")}</p>
                    </div>
                    <div className="text-right text-xs text-muted-foreground">
                      {assignment.report_at ? <p>{copy(locale, "Apresentação", "Report")}: <strong className="text-foreground">{formatDate(assignment.report_at)}</strong></p> : null}
                      <p>{copy(locale, "Trabalho", "Work")}: <strong className="text-foreground">{formatDate(assignment.starts_at)} → {formatDate(assignment.ends_at)}</strong></p>
                    </div>
                  </div>
                  {assignment.notes ? <p className="mt-2 text-xs text-muted-foreground">{assignment.notes}</p> : null}
                  <div className="mt-3 flex flex-wrap gap-2">
                    {own && assignment.status === "assigned" ? <><Button size="sm" disabled={actionsPending} onClick={() => statusMutation.mutate({ id: assignment.id, status: "confirmed" })}><Check className="mr-1 size-3.5" />{copy(locale, "Confirmar", "Confirm")}</Button><Button size="sm" variant="outline" disabled={actionsPending} onClick={() => statusMutation.mutate({ id: assignment.id, status: "declined" })}><X className="mr-1 size-3.5" />{copy(locale, "Recusar", "Decline")}</Button></> : null}
                    {canManage && ["assigned", "confirmed"].includes(assignment.status) ? <Button size="sm" variant="outline" disabled={actionsPending} onClick={() => cancelAssignment(assignment.id)}>{statusMutation.isPending ? copy(locale, "Atualizando…", "Updating…") : copy(locale, "Cancelar escala", "Cancel assignment")}</Button> : null}
                  </div>
                </article>
              );
            })}
          </div>
        ) : (
          <div className="p-8 text-center text-sm text-muted-foreground"><UserCheck className="mx-auto mb-2 size-5" />{copy(locale, "Nenhum profissional escalado ainda.", "No professionals scheduled yet.")}</div>
        )}
      </section>

      <p className="text-xs text-muted-foreground"><Clock3 className="mr-1 inline size-3" />{copy(locale, "Horários são gravados como timestamptz; a edição usa o fuso do dispositivo nesta V1.", "Times are stored as timestamptz; editing uses the device timezone in this V1.")}</p>
      <Button asChild variant="ghost"><Link to="/operations/$operationId" params={{ operationId }}>{copy(locale, "Voltar à visão geral", "Back to overview")}</Link></Button>
    </div>
  );
}

function Field({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return <label className="space-y-1 text-xs font-medium"><span>{label}</span><Input type="datetime-local" value={value} onChange={(e) => onChange(e.target.value)} /></label>;
}

function Status({ status, locale }: { status: AssignmentStatus; locale: string }) {
  const label: Record<AssignmentStatus, [string, string]> = {
    assigned: ["Aguardando", "Assigned"], confirmed: ["Confirmado", "Confirmed"], declined: ["Recusado", "Declined"], cancelled: ["Cancelado", "Cancelled"], completed: ["Concluído", "Completed"],
  };
  return <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">{copy(locale, label[status][0], label[status][1])}</span>;
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat(undefined, { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }).format(new Date(value));
}

function humanize(value: string) { return value.replaceAll("_", " ").replace(/\b\w/g, (c) => c.toUpperCase()); }
function one<T>(value: T | T[] | null | undefined): T | undefined { return Array.isArray(value) ? value[0] : value ?? undefined; }