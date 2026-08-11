import * as React from "react";
import { createFileRoute, useParams } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, Plus, ShieldCheck, UserPlus, Users, X } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { humanizeError } from "@/lib/auth";
import { useI18n } from "@/lib/i18n";
import { formatDateTime } from "@/lib/format";
import { useTenant } from "@/lib/tenant";
import {
  PARTICIPATION_KINDS,
  PARTICIPATION_STATUSES,
  PARTICIPATION_TRANSITIONS,
  newIdempotencyKey,
  roleLabel,
  type ParticipationKind,
  type ParticipationStatus,
  type RoleTypeRow,
} from "@/lib/w03";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { EmptyState } from "@/components/feedback/empty-state";
import { PanelSkeleton } from "@/components/feedback/loading";
import { feedback } from "@/components/feedback/feedback";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

export const Route = createFileRoute("/_authenticated/operations/$operationId/people")({
  head: () => ({
    meta: [
      { title: "Operation roster — COBS OS people" },
      {
        name: "description",
        content:
          "Who is on this operation and what each person is responsible for. Roster membership is never physical presence.",
      },
      { property: "og:title", content: "Operation roster — COBS OS people" },
      {
        property: "og:description",
        content: "Participants, crew, support and observers with contextual responsibilities.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: OperationPeoplePage,
});

type RosterRow = {
  id: string;
  tenant_id: string;
  operation_id: string;
  person_id: string;
  participation_kind: ParticipationKind;
  status: ParticipationStatus;
  notes: string | null;
  created_at: string;
  confirmed_at: string | null;
  cancelled_at: string | null;
  cancellation_reason: string | null;
  cancellation_count: number;
  reactivated_at: string | null;
  people: { id: string; full_name: string; email: string | null; profile_id: string | null } | null;
  operation_role_assignments: Array<{
    role_type_id: string;
    is_primary: boolean;
    operation_role_types: { key: string; label: string | null } | null;
  }>;
};

const STATUS_CLASS: Record<ParticipationStatus, string> = {
  expected: "border border-border text-muted-foreground",
  confirmed: "bg-primary-soft text-primary",
  cancelled: "border border-destructive/40 text-destructive",
};

function Chip({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <span
      className={`inline-flex shrink-0 items-center rounded-full px-2 py-0.5 font-mono text-[10px] uppercase tracking-[0.12em] ${className}`}
    >
      {children}
    </span>
  );
}

function Counter({ label, value }: { label: string; value: number }) {
  return (
    <div className="surface-panel px-4 py-3">
      <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
        {label}
      </p>
      <p className="mt-1 text-2xl font-semibold tabular-nums">{value}</p>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Add person flow                                                     */
/* ------------------------------------------------------------------ */

function AddPersonDialog({
  open,
  onOpenChange,
  operationId,
  roleTypes,
  rosterPersonIds,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  operationId: string;
  roleTypes: RoleTypeRow[];
  rosterPersonIds: string[];
}) {
  const { t, locale } = useI18n();
  const { tenant, canManage } = useTenant();
  const queryClient = useQueryClient();

  const [step, setStep] = React.useState(0);
  const [term, setTerm] = React.useState("");
  const [personId, setPersonId] = React.useState<string | null>(null);
  const [creating, setCreating] = React.useState(false);
  const [kind, setKind] = React.useState<ParticipationKind>("participant");
  const [roles, setRoles] = React.useState<string[]>([]);
  const [primaryRole, setPrimaryRole] = React.useState<string | null>(null);
  const [notes, setNotes] = React.useState("");
  const idempotencyKey = React.useRef(newIdempotencyKey());

  const reset = () => {
    setStep(0);
    setTerm("");
    setPersonId(null);
    setCreating(false);
    setKind("participant");
    setRoles([]);
    setPrimaryRole(null);
    setNotes("");
    idempotencyKey.current = newIdempotencyKey();
  };

  const people = useQuery({
    queryKey: ["people", tenant?.id],
    enabled: Boolean(tenant?.id) && open,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("people")
        .select("id, full_name, email, profile_id")
        .eq("tenant_id", tenant!.id)
        .order("full_name");
      if (error) throw error;
      return data;
    },
  });

  const createPerson = useMutation({
    mutationFn: async (input: { full_name: string; email: string }) => {
      const { data, error } = await supabase
        .from("people")
        .insert({
          tenant_id: tenant!.id,
          full_name: input.full_name,
          email: input.email || null,
        })
        .select("id")
        .single();
      if (error) throw error;
      return data.id;
    },
    onSuccess: (id) => {
      feedback.success(t("people.created"));
      void queryClient.invalidateQueries({ queryKey: ["people", tenant?.id] });
      setPersonId(id);
      setCreating(false);
      setStep(1);
    },
    onError: (error) => feedback.error(humanizeError(error, locale)),
  });

  const add = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.rpc("add_operation_participation", {
        _operation_id: operationId,
        _person_id: personId!,
        _participation_kind: kind,
        _idempotency_key: idempotencyKey.current,
        _role_type_ids: roles,
        ...(primaryRole ? { _primary_role_type_id: primaryRole } : {}),
        ...(notes.trim() ? { _notes: notes.trim() } : {}),
      });
      if (error) throw error;
    },
    onSuccess: () => {
      feedback.success(t("roster.added"));
      void queryClient.invalidateQueries({ queryKey: ["roster", operationId] });
      onOpenChange(false);
      reset();
    },
    onError: (error) => feedback.error(humanizeError(error, locale)),
  });

  const candidates = (people.data ?? []).filter(
    (p) =>
      !rosterPersonIds.includes(p.id) &&
      (term.trim() === "" ||
        p.full_name.toLowerCase().includes(term.trim().toLowerCase()) ||
        (p.email ?? "").toLowerCase().includes(term.trim().toLowerCase())),
  );
  const person = (people.data ?? []).find((p) => p.id === personId) ?? null;
  const steps = [
    t("roster.step.person"),
    t("roster.step.participation"),
    t("roster.step.roles"),
    t("roster.step.review"),
  ];

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        onOpenChange(next);
        if (!next) reset();
      }}
    >
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{t("roster.add")}</DialogTitle>
        </DialogHeader>

        <ol className="flex flex-wrap gap-1.5" aria-label={t("roster.add")}>
          {steps.map((label, index) => (
            <li key={label}>
              <Chip
                className={
                  index === step
                    ? "bg-primary-soft text-primary"
                    : "border border-border text-muted-foreground"
                }
              >
                {index + 1}. {label}
              </Chip>
            </li>
          ))}
        </ol>

        {step === 0 ? (
          <div className="space-y-3">
            <p className="text-xs text-muted-foreground">{t("roster.person.searchHint")}</p>
            <div className="space-y-1.5">
              <Label htmlFor="rp-search">{t("roster.person.search")}</Label>
              <Input
                id="rp-search"
                value={term}
                onChange={(e) => setTerm(e.target.value)}
                autoComplete="off"
              />
            </div>

            {creating ? (
              <form
                className="space-y-3 rounded-lg border border-border p-3"
                onSubmit={(e) => {
                  e.preventDefault();
                  const form = new FormData(e.currentTarget);
                  createPerson.mutate({
                    full_name: String(form.get("full_name") ?? "").trim(),
                    email: String(form.get("email") ?? "").trim(),
                  });
                }}
              >
                <p className="text-xs text-muted-foreground">{t("roster.person.newHint")}</p>
                <div className="space-y-1.5">
                  <Label htmlFor="rp-name">{t("people.fullName")}</Label>
                  <Input id="rp-name" name="full_name" required />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="rp-email">{t("people.email")}</Label>
                  <Input id="rp-email" name="email" type="email" />
                </div>
                <div className="flex gap-2">
                  <Button type="submit" className="min-h-11" disabled={createPerson.isPending}>
                    {createPerson.isPending ? t("common.saving") : t("people.add")}
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    className="min-h-11"
                    onClick={() => setCreating(false)}
                  >
                    {t("common.cancel")}
                  </Button>
                </div>
              </form>
            ) : (
              <>
                <ul className="max-h-56 space-y-1.5 overflow-y-auto">
                  {candidates.length === 0 ? (
                    <li className="py-4 text-center text-sm text-muted-foreground">
                      {t("roster.person.none")}
                    </li>
                  ) : (
                    candidates.map((p) => (
                      <li key={p.id}>
                        <button
                          type="button"
                          onClick={() => {
                            setPersonId(p.id);
                            setStep(1);
                          }}
                          className="flex min-h-11 w-full items-center gap-3 rounded-lg border border-border px-3 py-2 text-left transition-colors hover:bg-elevated"
                        >
                          <span className="grid size-8 shrink-0 place-items-center rounded-full bg-primary-soft text-xs font-semibold text-primary">
                            {p.full_name.slice(0, 1).toUpperCase()}
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-sm font-medium">
                              {p.full_name}
                            </span>
                            <span className="block truncate text-xs text-muted-foreground">
                              {p.email ?? "—"}
                            </span>
                          </span>
                          <Chip
                            className={
                              p.profile_id
                                ? "bg-primary-soft text-primary"
                                : "border border-border text-muted-foreground"
                            }
                          >
                            {p.profile_id ? t("roster.access.yes") : t("roster.access.no")}
                          </Chip>
                        </button>
                      </li>
                    ))
                  )}
                </ul>
                {canManage ? (
                  <Button
                    type="button"
                    variant="outline"
                    className="min-h-11 w-full"
                    onClick={() => setCreating(true)}
                  >
                    <UserPlus className="mr-2 size-4" aria-hidden="true" />
                    {t("roster.person.new")}
                  </Button>
                ) : null}
              </>
            )}
          </div>
        ) : null}

        {step === 1 ? (
          <div className="space-y-3">
            <p className="text-sm">
              {t("roster.person.selected")}: <strong>{person?.full_name}</strong>
            </p>
            <div className="grid gap-2 sm:grid-cols-2">
              {PARTICIPATION_KINDS.map((k) => (
                <button
                  key={k}
                  type="button"
                  onClick={() => setKind(k)}
                  className={`min-h-11 rounded-lg border px-3 py-2 text-sm transition-colors ${
                    kind === k
                      ? "border-primary bg-primary-soft text-primary"
                      : "border-border hover:bg-elevated"
                  }`}
                >
                  {t(`kindLabel.${k}`)}
                </button>
              ))}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="rp-notes">{t("roster.notes")}</Label>
              <Input
                id="rp-notes"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                maxLength={500}
              />
              <p className="text-xs text-muted-foreground">{t("roster.notesHint")}</p>
            </div>
          </div>
        ) : null}

        {step === 2 ? (
          <div className="space-y-3">
            <p className="text-xs text-muted-foreground">{t("roster.rolesHint")}</p>
            <div className="flex flex-wrap gap-2">
              {roleTypes.map((rt) => {
                const selected = roles.includes(rt.id);
                return (
                  <button
                    key={rt.id}
                    type="button"
                    onClick={() =>
                      setRoles((prev) => {
                        const next = selected
                          ? prev.filter((id) => id !== rt.id)
                          : [...prev, rt.id];
                        if (selected && primaryRole === rt.id) setPrimaryRole(null);
                        if (!selected && next.length === 1) setPrimaryRole(rt.id);
                        return next;
                      })
                    }
                    className={`min-h-11 rounded-full border px-3.5 text-sm transition-colors ${
                      selected
                        ? "border-primary bg-primary-soft text-primary"
                        : "border-border hover:bg-elevated"
                    }`}
                  >
                    {roleLabel(rt, t)}
                  </button>
                );
              })}
            </div>
            {roles.length > 1 ? (
              <div className="space-y-1.5">
                <Label htmlFor="rp-primary">{t("roster.primary")}</Label>
                <select
                  id="rp-primary"
                  className="min-h-11 w-full rounded-lg border border-border bg-background px-3 text-sm"
                  value={primaryRole ?? ""}
                  onChange={(e) => setPrimaryRole(e.target.value || null)}
                >
                  <option value="">{t("common.none")}</option>
                  {roles.map((id) => (
                    <option key={id} value={id}>
                      {roleLabel(
                        roleTypes.find((r) => r.id === id) ?? null,
                        t,
                      )}
                    </option>
                  ))}
                </select>
              </div>
            ) : null}
          </div>
        ) : null}

        {step === 3 ? (
          <div className="space-y-3 rounded-lg border border-border p-3 text-sm">
            <p>
              <strong>{person?.full_name}</strong>
            </p>
            <p className="text-muted-foreground">
              {t("roster.filters.kind")}: {t(`kindLabel.${kind}`)}
            </p>
            <p className="text-muted-foreground">
              {t("roster.roles")}:{" "}
              {roles.length === 0
                ? t("roster.rolesNone")
                : roles
                    .map((id) => roleLabel(roleTypes.find((r) => r.id === id) ?? null, t))
                    .join(" · ")}
            </p>
            {notes.trim() ? <p className="text-muted-foreground">{notes.trim()}</p> : null}
            <p className="text-xs text-muted-foreground">{t("roster.accessNote")}</p>
          </div>
        ) : null}

        <div className="flex flex-wrap justify-between gap-2 pt-1">
          <Button
            type="button"
            variant="ghost"
            className="min-h-11"
            disabled={step === 0}
            onClick={() => setStep((s) => Math.max(0, s - 1))}
          >
            {t("common.back")}
          </Button>
          {step < 3 ? (
            <Button
              type="button"
              className="min-h-11"
              disabled={step === 0 && !personId}
              onClick={() => setStep((s) => Math.min(3, s + 1))}
            >
              {t("common.next")}
            </Button>
          ) : (
            <Button
              type="button"
              className="min-h-11"
              disabled={add.isPending || !personId}
              onClick={() => add.mutate()}
            >
              {add.isPending ? t("common.saving") : t("roster.confirmAdd")}
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

/* ------------------------------------------------------------------ */
/* Roster row                                                          */
/* ------------------------------------------------------------------ */

function RosterCard({
  row,
  roleTypes,
  operationId,
}: {
  row: RosterRow;
  roleTypes: RoleTypeRow[];
  operationId: string;
}) {
  const { t, locale } = useI18n();
  const queryClient = useQueryClient();
  const [expanded, setExpanded] = React.useState(false);
  const [reason, setReason] = React.useState("");

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["roster", operationId] });

  const setStatus = useMutation({
    mutationFn: async (input: { status: ParticipationStatus; reason?: string }) => {
      const { error } = await supabase.rpc("set_participation_status", {
        _participation_id: row.id,
        _status: input.status,
        ...(input.reason ? { _reason: input.reason } : {}),
      });
      if (error) throw error;
    },
    onSuccess: () => {
      feedback.success(t("roster.statusChanged"));
      setReason("");
      void invalidate();
    },
    onError: (error) => feedback.error(humanizeError(error, locale)),
  });

  const assign = useMutation({
    mutationFn: async (roleTypeId: string) => {
      const { error } = await supabase.rpc("assign_operation_role", {
        _participation_id: row.id,
        _role_type_id: roleTypeId,
        _is_primary: false,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      feedback.success(t("roster.roleAssigned"));
      void invalidate();
    },
    onError: (error) => feedback.error(humanizeError(error, locale)),
  });

  const unassign = useMutation({
    mutationFn: async (roleTypeId: string) => {
      const { error } = await supabase.rpc("unassign_operation_role", {
        _participation_id: row.id,
        _role_type_id: roleTypeId,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      feedback.success(t("roster.roleUnassigned"));
      void invalidate();
    },
    onError: (error) => feedback.error(humanizeError(error, locale)),
  });

  const setPrimary = useMutation({
    mutationFn: async (roleTypeId: string) => {
      const { error } = await supabase.rpc("set_primary_operation_role", {
        _participation_id: row.id,
        _role_type_id: roleTypeId,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      feedback.success(t("roster.primaryChanged"));
      void invalidate();
    },
    onError: (error) => feedback.error(humanizeError(error, locale)),
  });

  const assigned = row.operation_role_assignments ?? [];
  const assignedIds = assigned.map((a) => a.role_type_id);
  const available = roleTypes.filter((rt) => !assignedIds.includes(rt.id));
  const transitions = PARTICIPATION_TRANSITIONS[row.status];

  return (
    <li className="surface-panel p-4">
      <div className="flex flex-wrap items-center gap-3">
        <span className="grid size-10 shrink-0 place-items-center rounded-full bg-primary-soft font-semibold text-primary">
          {(row.people?.full_name ?? "?").slice(0, 1).toUpperCase()}
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium">{row.people?.full_name}</p>
          <p className="truncate text-xs text-muted-foreground">{row.people?.email ?? "—"}</p>
        </div>
        <Chip className="border border-border text-muted-foreground">
          {t(`kindLabel.${row.participation_kind}`)}
        </Chip>
        <Chip className={STATUS_CLASS[row.status]}>{t(`pstatus.${row.status}`)}</Chip>
        <Chip
          className={
            row.people?.profile_id
              ? "bg-primary-soft text-primary"
              : "border border-border text-muted-foreground"
          }
        >
          <ShieldCheck className="mr-1 size-3" aria-hidden="true" />
          {row.people?.profile_id ? t("roster.access.yes") : t("roster.access.no")}
        </Chip>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-1.5">
        {assigned.length === 0 ? (
          <span className="text-xs text-muted-foreground">{t("roster.rolesNone")}</span>
        ) : (
          assigned.map((a) => (
            <span
              key={a.role_type_id}
              className={`inline-flex min-h-8 items-center gap-1 rounded-full px-2.5 text-xs ${
                a.is_primary
                  ? "bg-primary-soft text-primary"
                  : "border border-border text-muted-foreground"
              }`}
            >
              {roleLabel(a.operation_role_types, t)}
              {a.is_primary ? <span className="font-mono text-[9px]">★</span> : null}
              {expanded ? (
                <>
                  {!a.is_primary ? (
                    <button
                      type="button"
                      aria-label={t("roster.setPrimary")}
                      className="ml-0.5 rounded-full p-1 hover:text-foreground"
                      onClick={() => setPrimary.mutate(a.role_type_id)}
                    >
                      <Check className="size-3" />
                    </button>
                  ) : null}
                  <button
                    type="button"
                    aria-label={t("roster.unassignRole")}
                    className="rounded-full p-1 hover:text-destructive"
                    onClick={() => unassign.mutate(a.role_type_id)}
                  >
                    <X className="size-3" />
                  </button>
                </>
              ) : null}
            </span>
          ))
        )}
        <Button
          variant="ghost"
          size="sm"
          className="ml-auto min-h-9"
          onClick={() => setExpanded((v) => !v)}
          aria-expanded={expanded}
        >
          {expanded ? t("common.back") : t("roster.roles")}
        </Button>
      </div>

      {expanded ? (
        <div className="mt-3 space-y-4 border-t border-border pt-3">
          {available.length > 0 ? (
            <div className="space-y-1.5">
              <Label htmlFor={`assign-${row.id}`}>{t("roster.assignRole")}</Label>
              <select
                id={`assign-${row.id}`}
                className="min-h-11 w-full rounded-lg border border-border bg-background px-3 text-sm"
                value=""
                onChange={(e) => {
                  if (e.target.value) assign.mutate(e.target.value);
                }}
              >
                <option value="">{t("roster.assignRole")}</option>
                {available.map((rt) => (
                  <option key={rt.id} value={rt.id}>
                    {roleLabel(rt, t)}
                  </option>
                ))}
              </select>
            </div>
          ) : null}

          <PortalAccessAction
            operationId={operationId}
            personId={row.person_id}
            disabled={row.status === "cancelled"}
          />


          <div className="flex flex-wrap gap-2">
            {transitions
              .filter((s) => s !== "cancelled")
              .map((s) => (
                <Button
                  key={s}
                  variant="outline"
                  className="min-h-11"
                  disabled={setStatus.isPending}
                  onClick={() => setStatus.mutate({ status: s })}
                >
                  {s === "confirmed"
                    ? t("roster.confirm")
                    : row.status === "cancelled"
                      ? t("roster.reactivate")
                      : t("roster.backToExpected")}
                </Button>
              ))}
          </div>

          {transitions.includes("cancelled") ? (
            <div className="grid gap-2 sm:grid-cols-[1fr_auto] sm:items-end">
              <div className="space-y-1.5">
                <Label htmlFor={`cancel-${row.id}`}>{t("roster.cancelReason")}</Label>
                <Input
                  id={`cancel-${row.id}`}
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                />
              </div>
              <Button
                variant="outline"
                className="min-h-11 text-destructive"
                disabled={setStatus.isPending || reason.trim().length < 3}
                onClick={() => setStatus.mutate({ status: "cancelled", reason: reason.trim() })}
              >
                {t("roster.cancel")}
              </Button>
            </div>
          ) : null}

          <dl className="grid gap-1 text-xs text-muted-foreground sm:grid-cols-2">
            <div>
              <dt className="inline">{t("roster.history.added")}: </dt>
              <dd className="inline">{formatDateTime(row.created_at, { locale })}</dd>
            </div>
            {row.confirmed_at ? (
              <div>
                <dt className="inline">{t("roster.history.confirmed")}: </dt>
                <dd className="inline">{formatDateTime(row.confirmed_at, { locale })}</dd>
              </div>
            ) : null}
            {row.cancelled_at ? (
              <div>
                <dt className="inline">{t("roster.history.cancelled")}: </dt>
                <dd className="inline">
                  {formatDateTime(row.cancelled_at, { locale })}
                  {row.cancellation_reason ? ` — ${row.cancellation_reason}` : ""}
                </dd>
              </div>
            ) : null}
            {row.reactivated_at ? (
              <div>
                <dt className="inline">{t("roster.history.reactivated")}: </dt>
                <dd className="inline">{formatDateTime(row.reactivated_at, { locale })}</dd>
              </div>
            ) : null}
            {row.cancellation_count > 0 ? (
              <div>
                <dt className="inline">{t("roster.history.cancellations")}: </dt>
                <dd className="inline tabular-nums">{row.cancellation_count}</dd>
              </div>
            ) : null}
          </dl>
        </div>
      ) : null}
    </li>
  );
}

/* ------------------------------------------------------------------ */
/* Workspace                                                           */
/* ------------------------------------------------------------------ */

function Roster() {
  const { operationId } = useParams({ from: "/_authenticated/operations/$operationId/people" });
  const { t } = useI18n();
  const { tenant, canManage, role } = useTenant();
  const canOperate = canManage || role === "operations_agent";

  const [term, setTerm] = React.useState("");
  const [kindFilter, setKindFilter] = React.useState<ParticipationKind | "all">("all");
  const [statusFilter, setStatusFilter] = React.useState<ParticipationStatus | "all">("all");
  const [addOpen, setAddOpen] = React.useState(false);

  const roleTypes = useQuery({
    queryKey: ["roleTypes", tenant?.id],
    enabled: Boolean(tenant?.id) && canOperate,
    queryFn: async () => {
      // Self-healing provisioning: every W03 surface guarantees the taxonomy exists.
      const { error: rpcError } = await supabase.rpc("ensure_operation_role_types", {
        _tenant_id: tenant!.id,
      });
      if (rpcError) throw rpcError;
      const { data, error } = await supabase
        .from("operation_role_types")
        .select("*")
        .eq("tenant_id", tenant!.id)
        .eq("is_active", true)
        .order("sort_order");
      if (error) throw error;
      return data;
    },
  });

  const roster = useQuery({
    queryKey: ["roster", operationId],
    enabled: Boolean(tenant?.id) && canOperate,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("operation_participations")
        .select(
          "*, people(id, full_name, email, profile_id), operation_role_assignments(role_type_id, is_primary, operation_role_types(key, label))",
        )
        .eq("operation_id", operationId)
        .order("created_at");
      if (error) throw error;
      return data as unknown as RosterRow[];
    },
  });

  if (!canOperate) {
    return (
      <EmptyState icon={Users} title={t("roster.forbidden")} body={t("roster.forbiddenBody")} />
    );
  }

  if (roster.isLoading || roleTypes.isLoading) return <PanelSkeleton rows={4} />;

  const rows = roster.data ?? [];
  const active = rows.filter((r) => r.status !== "cancelled");
  const counters = [
    { label: t("roster.total"), value: active.length },
    ...PARTICIPATION_KINDS.map((k) => ({
      label: t(`kindPlural.${k}`),
      value: active.filter((r) => r.participation_kind === k).length,
    })),
  ];

  const filtered = rows.filter(
    (r) =>
      (kindFilter === "all" || r.participation_kind === kindFilter) &&
      (statusFilter === "all" || r.status === statusFilter) &&
      (term.trim() === "" ||
        (r.people?.full_name ?? "").toLowerCase().includes(term.trim().toLowerCase()) ||
        (r.people?.email ?? "").toLowerCase().includes(term.trim().toLowerCase())),
  );

  return (
    <div className="space-y-5">
      <section className="animate-rise flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-2xl font-semibold lg:text-3xl">{t("roster.title")}</h2>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">{t("roster.subtitle")}</p>
        </div>
        <Button className="min-h-11" onClick={() => setAddOpen(true)}>
          <Plus className="mr-2 size-4" aria-hidden="true" />
          {t("roster.add")}
        </Button>
      </section>

      {rows.length === 0 ? (
        <EmptyState
          icon={Users}
          title={t("roster.empty")}
          body={t("roster.emptyBody")}
          action={
            <Button className="mt-2 min-h-11" onClick={() => setAddOpen(true)}>
              {t("roster.add")}
            </Button>
          }
        />
      ) : (
        <>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
            {counters.map((c) => (
              <Counter key={c.label} label={c.label} value={c.value} />
            ))}
          </div>

          <div className="grid gap-2 sm:grid-cols-[1fr_auto_auto]">
            <div className="space-y-1.5">
              <Label htmlFor="roster-search" className="sr-only">
                {t("roster.search")}
              </Label>
              <Input
                id="roster-search"
                className="min-h-11"
                placeholder={t("roster.search")}
                value={term}
                onChange={(e) => setTerm(e.target.value)}
              />
            </div>
            <select
              aria-label={t("roster.filters.kind")}
              className="min-h-11 rounded-lg border border-border bg-background px-3 text-sm"
              value={kindFilter}
              onChange={(e) => setKindFilter(e.target.value as ParticipationKind | "all")}
            >
              <option value="all">{t("roster.filters.all")}</option>
              {PARTICIPATION_KINDS.map((k) => (
                <option key={k} value={k}>
                  {t(`kindPlural.${k}`)}
                </option>
              ))}
            </select>
            <select
              aria-label={t("roster.filters.status")}
              className="min-h-11 rounded-lg border border-border bg-background px-3 text-sm"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as ParticipationStatus | "all")}
            >
              <option value="all">{t("roster.filters.all")}</option>
              {PARTICIPATION_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {t(`pstatus.${s}`)}
                </option>
              ))}
            </select>
          </div>

          {filtered.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              {t("roster.noResults")}
            </p>
          ) : (
            <ul className="space-y-2">
              {filtered.map((row) => (
                <RosterCard
                  key={row.id}
                  row={row}
                  roleTypes={roleTypes.data ?? []}
                  operationId={operationId}
                />
              ))}
            </ul>
          )}

          <p className="text-xs text-muted-foreground">{t("roster.accessNote")}</p>
        </>
      )}

      <AddPersonDialog
        open={addOpen}
        onOpenChange={setAddOpen}
        operationId={operationId}
        roleTypes={roleTypes.data ?? []}
        rosterPersonIds={rows.map((r) => r.person_id)}
      />
    </div>
  );
}

function OperationPeoplePage() {
  return <Roster />;
}
