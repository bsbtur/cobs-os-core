import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Activity, ArrowRight, BriefcaseBusiness, CalendarClock, CheckCircle2, Clock3 } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { useI18n } from "@/lib/i18n";
import { useTenant } from "@/lib/tenant";
import { formatDateTime } from "@/lib/format";
import { StatusPill } from "@/components/feedback/status-pill";

type QueueItem = {
  operationId: string;
  operationName: string;
  operationCode: string;
  status: string;
  start: string;
  end: string;
  timezone: string;
  roleLabels: string[];
  primaryRole: string | null;
  pendingWork: number;
  totalWork: number;
};

const copy = (locale: string, pt: string, en: string) =>
  locale.toLowerCase().startsWith("pt") ? pt : en;

/**
 * PX12.3 — personal operation queue / "Meu Dia".
 * Read-only projection from Person → operation participations → operation roles → role-owned playbooks.
 * This is not a formal shift/roster table and does not create scheduling truth.
 */
export function PersonalOperationQueue() {
  const { user } = useAuth();
  const { tenant } = useTenant();
  const { locale, timeZone } = useI18n();

  const query = useQuery({
    queryKey: ["px12.3-personal-operation-queue", tenant?.id, user?.id],
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
      const assignments = await supabase
        .from("operation_role_assignments")
        .select("participation_id,is_primary,operation_role_types(id,key,label,is_active,sort_order)")
        .eq("tenant_id", tenant!.id)
        .in("participation_id", participationIds);
      if (assignments.error) throw assignments.error;

      const rolesByParticipation = new Map<string, Array<{ id: string; label: string; isPrimary: boolean; sortOrder: number }>>();
      for (const assignment of assignments.data ?? []) {
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

      const operationIds = activeParticipations.map((row) => row.operation_id);
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

      const queue = activeParticipations.map((participation) => {
        const operation = one(participation.operations)!;
        const roles = rolesByParticipation.get(participation.id) ?? [];
        const roleIds = new Set(roles.map((role) => role.id));
        const ownedItems = (playbooks.data ?? []).filter(
          (item) => item.operation_id === participation.operation_id && item.owner_role_type_id && roleIds.has(item.owner_role_type_id),
        );
        const pendingWork = ownedItems.filter((item) => latestAction.get(item.id) !== "completed").length;
        return {
          operationId: operation.id,
          operationName: operation.name,
          operationCode: operation.code,
          status: operation.status,
          start: operation.expected_start ?? operation.planned_start,
          end: operation.expected_end ?? operation.planned_end,
          timezone: operation.timezone,
          roleLabels: roles.map((role) => role.label),
          primaryRole: roles[0]?.label ?? null,
          pendingWork,
          totalWork: ownedItems.length,
        } satisfies QueueItem;
      });

      return queue.sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime());
    },
  });

  if (query.isLoading || query.isError) return null;

  const now = new Date();
  const items = query.data ?? [];
  const active = items.filter((item) => item.status === "active" || (new Date(item.start) <= now && new Date(item.end) >= now));
  const today = items.filter((item) => !active.some((activeItem) => activeItem.operationId === item.operationId) && isSameLocalDay(new Date(item.start), now));
  const upcoming = items
    .filter((item) => !active.some((activeItem) => activeItem.operationId === item.operationId) && !today.some((todayItem) => todayItem.operationId === item.operationId) && new Date(item.end) >= now)
    .slice(0, 5);

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
          <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-primary">PX12.3 · {copy(locale, "Meu dia", "My day")}</p>
          <h3 className="mt-1 text-lg font-semibold">{copy(locale, "Sua fila operacional", "Your operational queue")}</h3>
          <p className="mt-1 text-sm text-muted-foreground">{copy(locale, "Operações, funções e responsabilidades organizadas pelo tempo.", "Operations, roles and responsibilities ordered by time.")}</p>
        </div>
        <span className="rounded-full border border-border bg-background px-3 py-1 text-xs text-muted-foreground">{items.length} {copy(locale, "operação(ões)", "operation(s)")}</span>
      </div>

      <div className="space-y-5 p-5">
        {active.length ? <QueueGroup title={copy(locale, "Agora", "Now")} icon={Activity} items={active} locale={locale} fallbackTimeZone={timeZone} emphasis /> : null}
        {today.length ? <QueueGroup title={copy(locale, "Hoje", "Today")} icon={Clock3} items={today} locale={locale} fallbackTimeZone={timeZone} /> : null}
        {upcoming.length ? <QueueGroup title={copy(locale, "Próximas", "Upcoming")} icon={CalendarClock} items={upcoming} locale={locale} fallbackTimeZone={timeZone} /> : null}
      </div>
    </section>
  );
}

function QueueGroup({ title, icon: Icon, items, locale, fallbackTimeZone, emphasis = false }: { title: string; icon: typeof Activity; items: QueueItem[]; locale: string; fallbackTimeZone: string; emphasis?: boolean }) {
  return (
    <div>
      <div className="mb-2 flex items-center gap-2">
        <Icon className={`size-4 ${emphasis ? "text-primary" : "text-muted-foreground"}`} aria-hidden="true" />
        <h4 className="font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">{title}</h4>
      </div>
      <div className="grid gap-2">
        {items.map((item) => (
          <Link key={item.operationId} to={`/operations/${item.operationId}`} className={`group rounded-xl border p-4 transition-colors ${emphasis ? "border-primary/30 bg-primary-soft/20 hover:bg-primary-soft/35" : "border-border bg-background/50 hover:border-border-strong"}`}>
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="truncate font-semibold">{item.operationName}</p>
                  <StatusPill status={item.status} />
                </div>
                <p className="mt-1 font-mono text-[10px] uppercase tracking-[0.1em] text-muted-foreground">{item.operationCode}{item.primaryRole ? ` · ${item.primaryRole}` : ""}</p>
              </div>
              <ArrowRight className="mt-1 size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-1 group-hover:text-primary" aria-hidden="true" />
            </div>
            <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
              <span>{formatDateTime(item.start, { locale, timeZone: item.timezone || fallbackTimeZone })}</span>
              <span>→ {formatDateTime(item.end, { locale, timeZone: item.timezone || fallbackTimeZone })}</span>
              {item.totalWork > 0 ? (
                <span className="inline-flex items-center gap-1"><CheckCircle2 className="size-3" aria-hidden="true" />{item.pendingWork} {copy(locale, "pendência(s)", "pending")}</span>
              ) : null}
            </div>
            {item.roleLabels.length > 1 ? <p className="mt-2 truncate text-[11px] text-muted-foreground">{copy(locale, "Funções", "Roles")}: {item.roleLabels.join(" · ")}</p> : null}
          </Link>
        ))}
      </div>
    </div>
  );
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
