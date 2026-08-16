import { Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Activity, AlertTriangle, ArrowRight, BriefcaseBusiness, CalendarClock, Check, CheckCircle2, Clock3, X } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { useI18n } from "@/lib/i18n";
import { useTenant } from "@/lib/tenant";
import { formatDateTime } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { StatusPill } from "@/components/feedback/status-pill";

type ScheduleStatus = "assigned" | "confirmed" | "declined" | "cancelled" | "completed";
type QueueItem = {
  key: string;
  operationId: string;
  operationName: string;
  operationCode: string;
  operationStatus: string;
  start: string;
  end: string;
  reportAt: string | null;
  timezone: string;
  roleLabels: string[];
  primaryRole: string | null;
  pendingWork: number;
  totalWork: number;
  assignmentId: string | null;
  scheduleStatus: ScheduleStatus | null;
  scheduleSource: "staff_assignment" | "operation_fallback";
};

const copy = (locale: string, pt: string, en: string) =>
  locale.toLowerCase().startsWith("pt") ? pt : en;

/**
 * PX12.4-D / PX12.6-A — Personal queue backed by canonical staff schedule,
 * with explicit loading, empty and recoverable error states.
 */
export function PersonalOperationQueue() {
  const { user } = useAuth();
  const { tenant } = useTenant();
  const { locale, timeZone } = useI18n();
  const qc = useQueryClient();
  const db = supabase as any;

  const queryKey = ["px12.4d-personal-operation-queue", tenant?.id, user?.id];
  const query = useQuery({
    queryKey,
    enabled: Boolean(tenant?.id && user?.id),
    refetchInterval: 60_000,
    queryFn: async (): Promise<QueueItem[]> => {
      const person = await supabase
        .from("people")
        .select("id")
        .eq("tenant_id", tenant!.id)
        .eq("profile_id", user!.id)
        .maybeSingle();
      if (person.error) throw person.error;
      if (!person.data?.id) return [];

      const participations = await supabase
        .from("operation_participations")
        .select("id,operation_id,status,operations(id,name,code,status,planned_start,planned_end,expected_start,expected_end,timezone,archived_at)")
        .eq("tenant_id", tenant!.id)
        .eq("person_id", person.data.id)
        .neq("status", "cancelled");
      if (participations.error) throw participations.error;

      const activeParticipations = (participations.data ?? []).filter((row) => {
        const operation = one(row.operations);
        return operation && !operation.archived_at && operation.status !== "cancelled";
      });
      if (!activeParticipations.length) return [];

      const participationIds = activeParticipations.map((row) => row.id);
      const operationIds = activeParticipations.map((row) => row.operation_id);

      const [roleAssignments, staffAssignments] = await Promise.all([
        supabase
          .from("operation_role_assignments")
          .select("participation_id,is_primary,operation_role_types(id,key,label,is_active,sort_order)")
          .eq("tenant_id", tenant!.id)
          .in("participation_id", participationIds),
        db
          .from("operation_staff_assignments")
          .select("id,participation_id,role_type_id,report_at,starts_at,ends_at,status,operation_role_types(id,key,label)")
          .eq("tenant_id", tenant!.id)
          .in("participation_id", participationIds)
          .neq("status", "cancelled")
          .order("starts_at"),
      ]);
      if (roleAssignments.error) throw roleAssignments.error;
      if (staffAssignments.error) throw staffAssignments.error;

      const rolesByParticipation = new Map<string, Array<{ id: string; label: string; isPrimary: boolean; sortOrder: number }>>();
      for (const assignment of roleAssignments.data ?? []) {
        const role = one(assignment.operation_role_types);
        if (!role?.is_active) continue;
        const current = rolesByParticipation.get(assignment.participation_id) ?? [];
        current.push({
          id: role.id,
          label: role.label?.trim() || humanizeRoleKey(role.key),
          isPrimary: assignment.is_primary,
          sortOrder: role.sort_order,
        });
        rolesByParticipation.set(assignment.participation_id, current);
      }
      for (const [participationId, roles] of rolesByParticipation) {
        roles.sort((a, b) => Number(b.isPrimary) - Number(a.isPrimary) || a.sortOrder - b.sortOrder);
        rolesByParticipation.set(participationId, roles);
      }

      const allRoleIds = [...new Set([...rolesByParticipation.values()].flat().map((role) => role.id))];
      const playbooks = allRoleIds.length
        ? await supabase
            .from("playbook_items")
            .select("id,operation_id,owner_role_type_id")
            .eq("tenant_id", tenant!.id)
            .eq("is_active", true)
            .in("operation_id", operationIds)
            .in("owner_role_type_id", allRoleIds)
        : { data: [], error: null };
      if (playbooks.error) throw playbooks.error;

      const playbookIds = (playbooks.data ?? []).map((item) => item.id);
      const executions = playbookIds.length
        ? await supabase
            .from("playbook_executions")
            .select("playbook_item_id,execution_action,occurred_at")
            .eq("tenant_id", tenant!.id)
            .in("operation_id", operationIds)
            .in("playbook_item_id", playbookIds)
            .order("occurred_at", { ascending: false })
        : { data: [], error: null };
      if (executions.error) throw executions.error;

      const latestAction = new Map<string, string>();
      for (const event of executions.data ?? []) {
        if (!latestAction.has(event.playbook_item_id)) latestAction.set(event.playbook_item_id, event.execution_action);
      }

      const staffByParticipation = new Map<string, any[]>();
      for (const row of staffAssignments.data ?? []) {
        const current = staffByParticipation.get(row.participation_id) ?? [];
        current.push(row);
        staffByParticipation.set(row.participation_id, current);
      }

      const queue: QueueItem[] = [];
      for (const participation of activeParticipations) {
        const operation = one(participation.operations)!;
        const roles = rolesByParticipation.get(participation.id) ?? [];
        const schedules = staffByParticipation.get(participation.id) ?? [];

        if (schedules.length) {
          for (const schedule of schedules) {
            const scheduleRole = one(schedule.operation_role_types);
            const roleLabel = scheduleRole?.label?.trim() || humanizeRoleKey(scheduleRole?.key || "role");
            const ownedItems = (playbooks.data ?? []).filter(
              (item) => item.operation_id === participation.operation_id && item.owner_role_type_id === schedule.role_type_id,
            );
            queue.push({
              key: `schedule-${schedule.id}`,
              operationId: operation.id,
              operationName: operation.name,
              operationCode: operation.code,
              operationStatus: operation.status,
              start: schedule.starts_at,
              end: schedule.ends_at,
              reportAt: schedule.report_at,
              timezone: operation.timezone,
              roleLabels: [roleLabel],
              primaryRole: roleLabel,
              pendingWork: ownedItems.filter((item) => latestAction.get(item.id) !== "completed").length,
              totalWork: ownedItems.length,
              assignmentId: schedule.id,
              scheduleStatus: schedule.status as ScheduleStatus,
              scheduleSource: "staff_assignment",
            });
          }
          continue;
        }

        const roleIds = new Set(roles.map((role) => role.id));
        const ownedItems = (playbooks.data ?? []).filter(
          (item) => item.operation_id === participation.operation_id && item.owner_role_type_id && roleIds.has(item.owner_role_type_id),
        );
        queue.push({
          key: `fallback-${participation.id}`,
          operationId: operation.id,
          operationName: operation.name,
          operationCode: operation.code,
          operationStatus: operation.status,
          start: operation.expected_start ?? operation.planned_start,
          end: operation.expected_end ?? operation.planned_end,
          reportAt: null,
          timezone: operation.timezone,
          roleLabels: roles.map((role) => role.label),
          primaryRole: roles[0]?.label ?? null,
          pendingWork: ownedItems.filter((item) => latestAction.get(item.id) !== "completed").length,
          totalWork: ownedItems.length,
          assignmentId: null,
          scheduleStatus: null,
          scheduleSource: "operation_fallback",
        });
      }

      return queue.sort((a, b) => new Date(a.reportAt ?? a.start).getTime() - new Date(b.reportAt ?? b.start).getTime());
    },
  });

  const statusMutation = useMutation({
    mutationFn: async ({ assignmentId, status }: { assignmentId: string; status: "confirmed" | "declined" }) => {
      const result = await db.rpc("set_operation_staff_assignment_status", {
        _assignment_id: assignmentId,
        _status: status,
        _note: null,
      });
      if (result.error) throw result.error;
    },
    onSuccess: async () => qc.invalidateQueries({ queryKey }),
  });

  if (query.isLoading) {
    return (
      <section className="surface-panel p-5" aria-label={copy(locale, "Meu dia", "My day")} aria-busy="true">
        <div className="flex items-center gap-3">
          <span className="grid size-10 place-items-center rounded-lg bg-primary-soft text-primary"><BriefcaseBusiness className="size-4" aria-hidden="true" /></span>
          <div className="min-w-0 flex-1">
            <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-primary">COBS · {copy(locale, "Meu dia", "My day")}</p>
            <h3 className="mt-1 text-base font-semibold">{copy(locale, "Carregando sua jornada operacional…", "Loading your operational workday…")}</h3>
            <div className="mt-3 h-2 w-full max-w-sm animate-pulse rounded-full bg-muted" />
          </div>
        </div>
      </section>
    );
  }

  if (query.isError) {
    return (
      <section className="surface-panel p-5" aria-label={copy(locale, "Meu dia", "My day")} role="alert">
        <div className="flex items-start gap-3">
          <span className="grid size-10 place-items-center rounded-lg bg-destructive/10 text-destructive"><AlertTriangle className="size-4" aria-hidden="true" /></span>
          <div className="min-w-0 flex-1">
            <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-destructive">COBS · {copy(locale, "Meu dia", "My day")}</p>
            <h3 className="mt-1 text-base font-semibold">{copy(locale, "Não foi possível carregar sua escala", "We couldn't load your schedule")}</h3>
            <p className="mt-1 text-sm text-muted-foreground">{copy(locale, "Sua jornada não foi confirmada. Tente atualizar antes de assumir que não há compromissos.", "Your workday could not be confirmed. Refresh before assuming there are no assignments.")}</p>
            <Button className="mt-3" size="sm" variant="outline" onClick={() => query.refetch()} disabled={query.isFetching}>
              {query.isFetching ? copy(locale, "Atualizando…", "Refreshing…") : copy(locale, "Tentar novamente", "Try again")}
            </Button>
          </div>
        </div>
      </section>
    );
  }

  const now = new Date();
  const items = query.data ?? [];
  const active = items.filter((item) =>
    item.scheduleStatus !== "declined" && item.scheduleStatus !== "completed" &&
    (item.operationStatus === "active" || (new Date(item.start) <= now && new Date(item.end) >= now)),
  );
  const today = items.filter((item) => !active.some((activeItem) => activeItem.key === item.key) && isSameLocalDay(new Date(item.reportAt ?? item.start), now));
  const upcoming = items
    .filter((item) => !active.some((activeItem) => activeItem.key === item.key) && !today.some((todayItem) => todayItem.key === item.key) && new Date(item.end) >= now)
    .slice(0, 6);

  if (!items.length) {
    return (
      <section className="surface-panel p-5" aria-label={copy(locale, "Meu dia", "My day")}>
        <div className="flex items-center gap-3">
          <span className="grid size-10 place-items-center rounded-lg bg-primary-soft text-primary"><BriefcaseBusiness className="size-4" aria-hidden="true" /></span>
          <div>
            <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-primary">COBS · {copy(locale, "Meu dia", "My day")}</p>
            <h3 className="mt-1 text-base font-semibold">{copy(locale, "Nenhuma operação atribuída", "No assigned operations")}</h3>
            <p className="mt-1 text-sm text-muted-foreground">{copy(locale, "Quando você estiver vinculado a uma operação, sua jornada aparecerá aqui.", "When you are linked to an operation, your workday will appear here.")}</p>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="surface-panel overflow-hidden" aria-label={copy(locale, "Meu dia", "My day")}>
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-border bg-primary-soft/25 px-5 py-4">
        <div>
          <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-primary">PX12.4-D · {copy(locale, "Meu dia", "My day")}</p>
          <h3 className="mt-1 text-lg font-semibold">{copy(locale, "Sua jornada operacional", "Your operational workday")}</h3>
          <p className="mt-1 text-sm text-muted-foreground">{copy(locale, "Sua escala individual tem prioridade; operações antigas continuam funcionando por fallback.", "Your individual schedule has priority; legacy operations continue through fallback.")}</p>
        </div>
        <span className="rounded-full border border-border bg-background px-3 py-1 text-xs text-muted-foreground">{items.length} {copy(locale, "compromisso(s)", "commitment(s)")}</span>
      </div>

      {statusMutation.isError ? (
        <div className="border-b border-destructive/25 bg-destructive/10 px-5 py-3 text-sm text-destructive" role="alert">
          {copy(locale, "Não foi possível atualizar sua confirmação. Nenhuma mudança foi assumida; tente novamente.", "We couldn't update your confirmation. No change was assumed; try again.")}
        </div>
      ) : null}

      <div className="space-y-5 p-5">
        {active.length ? <QueueGroup title={copy(locale, "Agora", "Now")} icon={Activity} items={active} locale={locale} fallbackTimeZone={timeZone} emphasis mutation={statusMutation} /> : null}
        {today.length ? <QueueGroup title={copy(locale, "Hoje", "Today")} icon={Clock3} items={today} locale={locale} fallbackTimeZone={timeZone} mutation={statusMutation} /> : null}
        {upcoming.length ? <QueueGroup title={copy(locale, "Próximas", "Upcoming")} icon={CalendarClock} items={upcoming} locale={locale} fallbackTimeZone={timeZone} mutation={statusMutation} /> : null}
      </div>
    </section>
  );
}

function QueueGroup({ title, icon: Icon, items, locale, fallbackTimeZone, emphasis = false, mutation }: { title: string; icon: typeof Activity; items: QueueItem[]; locale: string; fallbackTimeZone: string; emphasis?: boolean; mutation: ReturnType<typeof useMutation<any, Error, { assignmentId: string; status: "confirmed" | "declined" }>> }) {
  return (
    <div>
      <div className="mb-2 flex items-center gap-2">
        <Icon className={`size-4 ${emphasis ? "text-primary" : "text-muted-foreground"}`} aria-hidden="true" />
        <h4 className="font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">{title}</h4>
      </div>
      <div className="grid gap-2">
        {items.map((item) => (
          <article key={item.key} className={`rounded-xl border p-4 transition-colors ${emphasis ? "border-primary/30 bg-primary-soft/20" : "border-border bg-background/50"}`}>
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <Link to="/operations/$operationId" params={{ operationId: item.operationId }} className="truncate font-semibold hover:text-primary hover:underline">{item.operationName}</Link>
                  <StatusPill status={item.operationStatus} />
                  {item.scheduleStatus ? <SchedulePill status={item.scheduleStatus} locale={locale} /> : null}
                </div>
                <p className="mt-1 font-mono text-[10px] uppercase tracking-[0.1em] text-muted-foreground">{item.operationCode}{item.primaryRole ? ` · ${item.primaryRole}` : ""}</p>
              </div>
              <Link to="/operations/$operationId" params={{ operationId: item.operationId }} aria-label={copy(locale, "Abrir operação", "Open operation")}><ArrowRight className="mt-1 size-4 shrink-0 text-muted-foreground hover:text-primary" aria-hidden="true" /></Link>
            </div>

            <div className="mt-3 grid gap-2 text-xs text-muted-foreground sm:grid-cols-2">
              {item.reportAt ? <span><strong className="text-foreground">{copy(locale, "Apresentação", "Report")}</strong> · {formatDateTime(item.reportAt, { locale, timeZone: item.timezone || fallbackTimeZone })}</span> : null}
              <span><strong className="text-foreground">{copy(locale, "Trabalho", "Work")}</strong> · {formatDateTime(item.start, { locale, timeZone: item.timezone || fallbackTimeZone })} → {formatDateTime(item.end, { locale, timeZone: item.timezone || fallbackTimeZone })}</span>
              {item.totalWork > 0 ? <span className="inline-flex items-center gap-1"><CheckCircle2 className="size-3" aria-hidden="true" />{item.pendingWork} {copy(locale, "pendência(s)", "pending")}</span> : null}
              {item.scheduleSource === "operation_fallback" ? <span className="text-[10px] uppercase tracking-[0.08em]">{copy(locale, "Horário da operação · sem escala individual", "Operation window · no individual schedule")}</span> : null}
            </div>

            {item.roleLabels.length > 1 ? <p className="mt-2 truncate text-[11px] text-muted-foreground">{copy(locale, "Funções", "Roles")}: {item.roleLabels.join(" · ")}</p> : null}

            {item.assignmentId && item.scheduleStatus === "assigned" ? (
              <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-border/70 pt-3">
                <span className="mr-1 text-xs font-medium text-warning">{copy(locale, "Confirme sua participação nesta escala", "Confirm your participation in this schedule")}</span>
                <Button size="sm" onClick={() => mutation.mutate({ assignmentId: item.assignmentId!, status: "confirmed" })} disabled={mutation.isPending}><Check className="mr-1 size-3.5" />{mutation.isPending ? copy(locale, "Salvando…", "Saving…") : copy(locale, "Confirmar", "Confirm")}</Button>
                <Button size="sm" variant="outline" onClick={() => mutation.mutate({ assignmentId: item.assignmentId!, status: "declined" })} disabled={mutation.isPending}><X className="mr-1 size-3.5" />{copy(locale, "Recusar", "Decline")}</Button>
              </div>
            ) : null}
          </article>
        ))}
      </div>
    </div>
  );
}

function SchedulePill({ status, locale }: { status: ScheduleStatus; locale: string }) {
  const labels: Record<ScheduleStatus, [string, string]> = {
    assigned: ["Aguardando confirmação", "Awaiting confirmation"],
    confirmed: ["Confirmado", "Confirmed"],
    declined: ["Recusado", "Declined"],
    cancelled: ["Cancelado", "Cancelled"],
    completed: ["Concluído", "Completed"],
  };
  const classes: Record<ScheduleStatus, string> = {
    assigned: "border-warning/30 bg-warning/10 text-warning",
    confirmed: "border-success/30 bg-success/10 text-success",
    declined: "border-destructive/30 bg-destructive/10 text-destructive",
    cancelled: "border-border bg-muted text-muted-foreground",
    completed: "border-border bg-muted text-muted-foreground",
  };
  return <span className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold ${classes[status]}`}>{copy(locale, labels[status][0], labels[status][1])}</span>;
}

function isSameLocalDay(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

function humanizeRoleKey(value: string) {
  return value.replaceAll("_", " ").replace(/\b\w/g, (char) => char.toUpperCase());
}

function one<T>(value: T | T[] | null | undefined): T | undefined {
  return Array.isArray(value) ? value[0] : value ?? undefined;
}
