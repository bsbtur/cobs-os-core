import * as React from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ChevronDown, ChevronUp, MapPin, Plus } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { humanizeError } from "@/lib/auth";
import { useI18n } from "@/lib/i18n";
import { newIdempotencyKey } from "@/lib/w04";
import {
  buildVisitPointUpdateArgs,
  deriveStepVisitPoints,
  type VisitPointEventRow,
  type VisitPointRow,
  type VisitPointView,
} from "@/lib/w11";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { feedback } from "@/components/feedback/feedback";

/**
 * W11 planning surface — lives inside a W04 journey step card.
 * Every write goes through an approved W11 command; nothing here touches W04.
 */

function Chip({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <span
      className={`inline-flex shrink-0 items-center rounded-full px-2 py-0.5 font-mono text-[10px] uppercase tracking-[0.12em] ${className}`}
    >
      {children}
    </span>
  );
}

function EditVisitPointDialog({
  point,
  onOpenChange,
  onSaved,
}: {
  point: VisitPointView | null;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
}) {
  const { t, locale } = useI18n();
  const [title, setTitle] = React.useState("");
  const [interpretive, setInterpretive] = React.useState("");
  const [operational, setOperational] = React.useState("");
  const [minutes, setMinutes] = React.useState("");
  const [required, setRequired] = React.useState(false);

  React.useEffect(() => {
    setTitle(point?.title ?? "");
    setInterpretive(point?.interpretiveContent ?? "");
    setOperational(point?.operationalNote ?? "");
    setMinutes(point?.estimatedMinutes ? String(point.estimatedMinutes) : "");
    setRequired(point?.isRequired ?? false);
  }, [
    point?.id,
    point?.title,
    point?.interpretiveContent,
    point?.operationalNote,
    point?.estimatedMinutes,
    point?.isRequired,
  ]);

  const save = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.rpc(
        "update_visit_point",
        buildVisitPointUpdateArgs(point!.id, {
          title,
          interpretiveContent: interpretive,
          operationalNote: operational,
          minutes,
          isRequired: required,
        }),
      );
      if (error) throw error;
    },
    onSuccess: () => {
      feedback.success(t("w11.updated"));
      onSaved();
      onOpenChange(false);
    },
    onError: (error) => feedback.error(humanizeError(error, locale)),
  });

  return (
    <Dialog open={Boolean(point)} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{t("w11.edit")}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="vp-title">{t("w11.field.title")}</Label>
            <Input
              id="vp-title"
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              className="min-h-11"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="vp-interpretive">{t("w11.field.interpretive")}</Label>
            <Textarea
              id="vp-interpretive"
              value={interpretive}
              onChange={(event) => setInterpretive(event.target.value)}
              rows={3}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="vp-operational">{t("w11.field.operational")}</Label>
            <Textarea
              id="vp-operational"
              value={operational}
              onChange={(event) => setOperational(event.target.value)}
              rows={2}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="vp-minutes">{t("w11.field.minutes")}</Label>
            <Input
              id="vp-minutes"
              inputMode="numeric"
              value={minutes}
              onChange={(event) => setMinutes(event.target.value)}
              className="min-h-11"
            />
          </div>
          <label className="flex items-center gap-2 text-sm">
            <Checkbox checked={required} onCheckedChange={(value) => setRequired(value === true)} />
            {t("w11.field.required")}
          </label>
          <Button
            className="min-h-11 w-full"
            disabled={!title.trim() || save.isPending}
            onClick={() => save.mutate()}
          >
            {t("w11.save")}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function VisitPointsPanel({
  stepId,
  operationId,
  points,
  events,
  editable,
}: {
  stepId: string;
  operationId: string;
  points: VisitPointRow[];
  events: VisitPointEventRow[];
  editable: boolean;
}) {
  const { t, locale } = useI18n();
  const queryClient = useQueryClient();
  const [title, setTitle] = React.useState("");
  const [editing, setEditing] = React.useState<VisitPointView | null>(null);

  const state = React.useMemo(() => deriveStepVisitPoints(points, events), [points, events]);

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ["visit-points", operationId] });
  };

  const add = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.rpc("create_visit_point", {
        _journey_step_id: stepId,
        _title: title.trim(),
        _idempotency_key: newIdempotencyKey(),
      });
      if (error) throw error;
    },
    onSuccess: () => {
      feedback.success(t("w11.added"));
      setTitle("");
      invalidate();
    },
    onError: (error) => feedback.error(humanizeError(error, locale)),
  });

  const reorder = useMutation({
    mutationFn: async (ids: string[]) => {
      const { error } = await supabase.rpc("reorder_visit_points", {
        _journey_step_id: stepId,
        _visit_point_ids: ids,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      feedback.success(t("w11.reordered"));
      invalidate();
    },
    onError: (error) => feedback.error(humanizeError(error, locale)),
  });

  const move = (index: number, direction: -1 | 1) => {
    const ordered = state.points.map((point) => point.id);
    const target = index + direction;
    const a = ordered[index];
    const b = ordered[target];
    if (!a || !b) return;
    ordered[index] = b;
    ordered[target] = a;
    reorder.mutate(ordered);
  };

  return (
    <div className="mt-3 rounded-xl border border-border/70 bg-background/40 p-3">
      <p className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
        <MapPin className="size-3.5" aria-hidden="true" />
        {t("w11.title")}
      </p>

      {state.points.length === 0 ? (
        <p className="mt-2 text-sm text-muted-foreground">{t("w11.empty")}</p>
      ) : (
        <ol className="mt-2 space-y-1.5">
          {state.points.map((point, index) => (
            <li key={point.id} className="flex flex-wrap items-center gap-2 text-sm">
              <span className="min-w-0 flex-1 break-words">{point.title}</span>
              <Chip
                className={
                  point.isRequired
                    ? "bg-primary-soft text-primary"
                    : "border border-border text-muted-foreground"
                }
              >
                {point.isRequired ? t("w11.required") : t("w11.optional")}
              </Chip>
              {point.estimatedMinutes ? (
                <Chip className="border border-border text-muted-foreground">
                  {point.estimatedMinutes} {t("w11.live.minutes")}
                </Chip>
              ) : null}
              <Chip className="border border-border text-muted-foreground">
                {t(`w11.status.${point.status}`)}
              </Chip>
              {editable ? (
                <span className="flex items-center gap-1">
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label={t("w11.moveUp")}
                    disabled={index === 0 || reorder.isPending}
                    onClick={() => move(index, -1)}
                  >
                    <ChevronUp className="size-4" aria-hidden="true" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label={t("w11.moveDown")}
                    disabled={index === state.points.length - 1 || reorder.isPending}
                    onClick={() => move(index, 1)}
                  >
                    <ChevronDown className="size-4" aria-hidden="true" />
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="min-h-9"
                    onClick={() => setEditing(point)}
                  >
                    {t("w11.edit")}
                  </Button>
                </span>
              ) : null}
            </li>
          ))}
        </ol>
      )}

      {editable ? (
        <div className="mt-3 flex flex-col gap-2 sm:flex-row">
          <Input
            aria-label={t("w11.add")}
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            placeholder={t("w11.field.title")}
            className="min-h-11 flex-1"
          />
          <Button
            className="min-h-11"
            disabled={!title.trim() || add.isPending}
            onClick={() => add.mutate()}
          >
            <Plus className="mr-1.5 size-4" aria-hidden="true" />
            {t("w11.add")}
          </Button>
        </div>
      ) : null}

      <p className="mt-2 text-xs text-muted-foreground">{t("w11.subtitle")}</p>

      <EditVisitPointDialog
        point={editing}
        onOpenChange={(open) => setEditing(open ? editing : null)}
        onSaved={invalidate}
      />
    </div>
  );
}
