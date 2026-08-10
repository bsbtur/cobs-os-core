import * as React from "react";
import { createFileRoute, Link, useParams } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Activity, ArchiveRestore, ArrowLeft, Box } from "lucide-react";

import { AppShell } from "@/app/shell/app-shell";
import { RequireTenant } from "@/app/shell/require-tenant";
import { supabase } from "@/integrations/supabase/client";
import { humanizeError } from "@/lib/auth";
import { useI18n } from "@/lib/i18n";
import { formatDateTime } from "@/lib/format";
import { useTenant } from "@/lib/tenant";
import {
  OPERATION_TRANSITIONS,
  fromLocalInput,
  isPlannedWindowEditable,
  toLocalInput,
  type OperationRow,
  type OperationStatus,
} from "@/lib/w02";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { EmptyState } from "@/components/feedback/empty-state";
import { PanelSkeleton } from "@/components/feedback/loading";
import { StatusPill } from "@/components/feedback/status-pill";
import { feedback } from "@/components/feedback/feedback";

export const Route = createFileRoute("/_authenticated/operations/$operationId")({
  head: () => ({
    meta: [
      { title: "Operation detail — COBS OS execution" },
      {
        name: "description",
        content:
          "Operation lifecycle, planned baseline and current forecast — planned, expected and actual kept separate by design.",
      },
      { property: "og:title", content: "Operation detail — COBS OS execution" },
      {
        property: "og:description",
        content: "Lifecycle, planned baseline and current forecast.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: OperationDetailPage,
});

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-border bg-elevated/50 px-3 py-2">
      <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
        {label}
      </p>
      <p className="mt-0.5 text-sm">{value}</p>
    </div>
  );
}

function LifecyclePanel({ op }: { op: OperationRow }) {
  const { t, locale } = useI18n();
  const { canManage } = useTenant();
  const queryClient = useQueryClient();
  const [cancelReason, setCancelReason] = React.useState("");
  const next = OPERATION_TRANSITIONS[op.status].filter((s) => s !== "cancelled");
  const canCancel = OPERATION_TRANSITIONS[op.status].includes("cancelled");

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ["operation", op.id] });
    void queryClient.invalidateQueries({ queryKey: ["operations", op.tenant_id] });
  };

  const setStatus = useMutation({
    mutationFn: async (input: { status: OperationStatus; reason?: string }) => {
      const args: { _operation_id: string; _status: OperationStatus; _reason?: string } = {
        _operation_id: op.id,
        _status: input.status,
      };
      if (input.reason) args._reason = input.reason;
      const { error } = await supabase.rpc("set_operation_status", args);
      if (error) throw error;
    },
    onSuccess: () => {
      feedback.success(t("op.statusChanged"));
      invalidate();
    },
    onError: (error) => feedback.error(humanizeError(error, locale)),
  });

  const setArchived = useMutation({
    mutationFn: async (archived: boolean) => {
      const { error } = await supabase.rpc("set_operation_archived", {
        _operation_id: op.id,
        _archived: archived,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      feedback.success(t("op.archiveDone"));
      invalidate();
    },
    onError: (error) => feedback.error(humanizeError(error, locale)),
  });

  if (!canManage) return null;

  return (
    <section className="surface-panel space-y-4 p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h3 className="text-base font-semibold">{t("op.lifecycle")}</h3>
        <StatusPill status={op.status} />
      </div>

      {next.length > 0 ? (
        <div className="flex flex-wrap gap-2">
          {next.map((status) => (
            <Button
              key={status}
              className="min-h-11"
              variant={status === "completed" ? "default" : "outline"}
              disabled={setStatus.isPending}
              onClick={() => setStatus.mutate({ status })}
            >
              {t("op.advance")} · {t(`status.${status}`)}
            </Button>
          ))}
        </div>
      ) : null}

      {canCancel ? (
        <div className="grid gap-2 sm:grid-cols-[1fr_auto] sm:items-end">
          <div className="space-y-1.5">
            <Label htmlFor="op-cancel-reason">{t("op.cancelReason")}</Label>
            <Input
              id="op-cancel-reason"
              value={cancelReason}
              onChange={(e) => setCancelReason(e.target.value)}
            />
          </div>
          <Button
            variant="outline"
            className="min-h-11 text-destructive"
            disabled={setStatus.isPending || cancelReason.trim().length < 3}
            onClick={() => setStatus.mutate({ status: "cancelled", reason: cancelReason.trim() })}
          >
            {t("op.cancel")}
          </Button>
        </div>
      ) : null}

      <div className="flex flex-wrap items-center gap-3 border-t border-border pt-4">
        <Button
          variant="ghost"
          className="min-h-11"
          disabled={setArchived.isPending}
          onClick={() => setArchived.mutate(!op.archived_at)}
        >
          <ArchiveRestore className="mr-2 size-4" aria-hidden="true" />
          {op.archived_at ? t("op.unarchive") : t("op.archive")}
        </Button>
        <p className="text-xs text-muted-foreground">{t("op.archivedNote")}</p>
      </div>
    </section>
  );
}

function WindowsPanel({ op }: { op: OperationRow }) {
  const { t, locale, timeZone } = useI18n();
  const { canManage } = useTenant();
  const queryClient = useQueryClient();
  const tz = op.timezone || timeZone;
  const editablePlanned = canManage && isPlannedWindowEditable(op.status);

  const [planned, setPlanned] = React.useState({
    start: toLocalInput(op.planned_start),
    end: toLocalInput(op.planned_end),
    reason: "",
  });
  const [expected, setExpected] = React.useState({
    start: toLocalInput(op.expected_start ?? op.planned_start),
    end: toLocalInput(op.expected_end ?? op.planned_end),
    reason: "",
  });

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ["operation", op.id] });
    void queryClient.invalidateQueries({ queryKey: ["operations", op.tenant_id] });
  };

  const savePlanned = useMutation({
    mutationFn: async () => {
      const args: {
        _operation_id: string;
        _planned_start: string;
        _planned_end: string;
        _reason?: string;
      } = {
        _operation_id: op.id,
        _planned_start: fromLocalInput(planned.start),
        _planned_end: fromLocalInput(planned.end),
      };
      if (planned.reason.trim()) args._reason = planned.reason.trim();
      const { error } = await supabase.rpc("set_operation_planned_window", args);
      if (error) throw error;
    },
    onSuccess: () => {
      feedback.success(t("op.plannedUpdated"));
      invalidate();
    },
    onError: (error) => feedback.error(humanizeError(error, locale)),
  });

  const saveExpected = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.rpc("set_operation_expected_window", {
        _operation_id: op.id,
        _expected_start: fromLocalInput(expected.start),
        _expected_end: fromLocalInput(expected.end),
        _reason: expected.reason.trim(),
      });
      if (error) throw error;
    },
    onSuccess: () => {
      feedback.success(t("op.expectedUpdated"));
      setExpected((e) => ({ ...e, reason: "" }));
      invalidate();
    },
    onError: (error) => feedback.error(humanizeError(error, locale)),
  });

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <section className="surface-panel space-y-4 p-5">
        <div>
          <h3 className="text-base font-semibold">{t("op.planned")}</h3>
          <p className="mt-1 text-sm text-muted-foreground">
            {editablePlanned ? t("op.plannedEditable") : t("op.plannedFrozen")}
          </p>
        </div>

        {editablePlanned ? (
          <form
            className="space-y-3"
            onSubmit={(e) => {
              e.preventDefault();
              savePlanned.mutate();
            }}
          >
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="pw-start">{t("op.plannedStart")}</Label>
                <Input
                  id="pw-start"
                  type="datetime-local"
                  required
                  value={planned.start}
                  onChange={(e) => setPlanned((p) => ({ ...p, start: e.target.value }))}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="pw-end">{t("op.plannedEnd")}</Label>
                <Input
                  id="pw-end"
                  type="datetime-local"
                  required
                  value={planned.end}
                  onChange={(e) => setPlanned((p) => ({ ...p, end: e.target.value }))}
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="pw-reason">{t("op.reason")}</Label>
              <Input
                id="pw-reason"
                value={planned.reason}
                onChange={(e) => setPlanned((p) => ({ ...p, reason: e.target.value }))}
              />
            </div>
            <Button type="submit" className="min-h-11" disabled={savePlanned.isPending}>
              {savePlanned.isPending ? t("common.saving") : t("common.save")}
            </Button>
          </form>
        ) : (
          <div className="grid gap-2 sm:grid-cols-2">
            <Field
              label={t("op.plannedStart")}
              value={formatDateTime(op.planned_start, { locale, timeZone: tz })}
            />
            <Field
              label={t("op.plannedEnd")}
              value={formatDateTime(op.planned_end, { locale, timeZone: tz })}
            />
          </div>
        )}
      </section>

      <section className="surface-panel space-y-4 p-5">
        <div>
          <h3 className="text-base font-semibold">{t("op.expected")}</h3>
          <p className="mt-1 text-sm text-muted-foreground">
            {op.expected_start && op.expected_end
              ? `${formatDateTime(op.expected_start, { locale, timeZone: tz })} — ${formatDateTime(
                  op.expected_end,
                  { locale, timeZone: tz },
                )}`
              : t("op.expectedNone")}
          </p>
        </div>

        {canManage ? (
          <form
            className="space-y-3"
            onSubmit={(e) => {
              e.preventDefault();
              if (expected.reason.trim().length < 3) {
                feedback.warning(t("op.reasonRequired"));
                return;
              }
              saveExpected.mutate();
            }}
          >
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="ew-start">{t("op.expectedStart")}</Label>
                <Input
                  id="ew-start"
                  type="datetime-local"
                  required
                  value={expected.start}
                  onChange={(e) => setExpected((p) => ({ ...p, start: e.target.value }))}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="ew-end">{t("op.expectedEnd")}</Label>
                <Input
                  id="ew-end"
                  type="datetime-local"
                  required
                  value={expected.end}
                  onChange={(e) => setExpected((p) => ({ ...p, end: e.target.value }))}
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ew-reason">{t("op.reason")}</Label>
              <Input
                id="ew-reason"
                required
                value={expected.reason}
                onChange={(e) => setExpected((p) => ({ ...p, reason: e.target.value }))}
              />
            </div>
            <Button type="submit" className="min-h-11" disabled={saveExpected.isPending}>
              {saveExpected.isPending ? t("common.saving") : t("common.save")}
            </Button>
          </form>
        ) : null}

        <p className="border-t border-border pt-3 text-xs text-muted-foreground">
          {t("op.actual")}: {t("op.actualLater")}
        </p>
      </section>
    </div>
  );
}

function OperationDetail() {
  const { operationId } = useParams({ from: "/_authenticated/operations/$operationId" });
  const { t, locale, timeZone } = useI18n();
  const { tenant } = useTenant();

  const operation = useQuery({
    queryKey: ["operation", operationId],
    enabled: Boolean(tenant?.id),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("operations")
        .select("*")
        .eq("id", operationId)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  if (operation.isLoading) return <PanelSkeleton rows={4} />;
  if (!operation.data)
    return <EmptyState icon={Activity} title={t("op.notFound")} body={t("op.back")} />;

  const op = operation.data;
  const tz = op.timezone || timeZone;

  return (
    <div className="space-y-6">
      <Button asChild variant="ghost" size="sm" className="-ml-2 min-h-9">
        <Link to="/operations">
          <ArrowLeft className="mr-2 size-4" aria-hidden="true" />
          {t("op.back")}
        </Link>
      </Button>

      <header className="surface-panel animate-rise space-y-3 p-5">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="text-2xl font-semibold">{op.name}</h2>
          <StatusPill status={op.status} />
          {op.archived_at ? <StatusPill status="archived" /> : null}
        </div>
        <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
          {op.code} · {t(`kind.${op.operation_kind}`)} · {tz}
        </p>
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          <Field
            label={t("op.lineage")}
            value={
              op.experience_id ? (
                <Link
                  to="/experiences/$experienceId"
                  params={{ experienceId: op.experience_id }}
                  className="text-primary underline-offset-4 hover:underline"
                >
                  {op.source_experience_name ?? t("op.lineage")}
                </Link>
              ) : (
                t("op.lineageNone")
              )
            }
          />
          <Field label={t("off.title")} value={op.source_offering_name ?? t("common.none")} />
          <Field
            label={t("op.location")}
            value={
              [op.primary_city, op.primary_region, op.primary_country]
                .filter(Boolean)
                .join(" · ") || t("common.none")
            }
          />
          <Field
            label={t("op.overview")}
            value={formatDateTime(op.created_at, { locale, timeZone: tz })}
          />
        </div>
        {op.cancellation_reason ? (
          <p className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {op.cancellation_reason}
          </p>
        ) : null}
      </header>

      <WindowsPanel op={op} />
      <LifecyclePanel op={op} />

      <p className="flex items-center gap-2 text-xs text-muted-foreground">
        <Box className="size-3.5" aria-hidden="true" />
        {t("op.actualLater")}
      </p>
    </div>
  );
}

function OperationDetailPage() {
  const { t } = useI18n();
  return (
    <AppShell activeId="operations" title={t("op.title")}>
      <div className="mx-auto w-full max-w-5xl">
        <RequireTenant>
          <OperationDetail />
        </RequireTenant>
      </div>
    </AppShell>
  );
}
