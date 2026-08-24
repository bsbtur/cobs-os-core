import * as React from "react";
import { useMutation } from "@tanstack/react-query";
import { MapPin } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { humanizeError } from "@/lib/auth";
import { useI18n } from "@/lib/i18n";
import {
  canSkip,
  deriveStepVisitPoints,
  type VisitPointEventRow,
  type VisitPointRow,
} from "@/lib/w11";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { feedback } from "@/components/feedback/feedback";

/**
 * W11 live guidance — rendered BELOW the Cockpit Core, never competing with it.
 * It shows the current visit point and records facts through the canonical
 * set_journey_visit_point_status RPC used by the deployed W11 schema.
 * It never completes a W04 step, never touches readiness and never blocks completion.
 */
export function CurrentVisitPoint({
  points,
  events,
  onRecorded,
}: {
  points: VisitPointRow[];
  events: VisitPointEventRow[];
  onRecorded: () => void;
}) {
  const { t, locale } = useI18n();
  const [showAll, setShowAll] = React.useState(false);
  const [skipOpen, setSkipOpen] = React.useState(false);
  const [reason, setReason] = React.useState("");
  const [submittedPointId, setSubmittedPointId] = React.useState<string | null>(null);

  const state = React.useMemo(() => deriveStepVisitPoints(points, events), [points, events]);
  const current = state.current;

  React.useEffect(() => {
    if (submittedPointId && current?.id !== submittedPointId) {
      setSubmittedPointId(null);
    }
  }, [current?.id, submittedPointId]);

  const record = useMutation({
    mutationFn: async (input: {
      type: "VISIT_POINT_COMPLETED" | "VISIT_POINT_SKIPPED";
      pointId: string;
    }) => {
      const status = input.type === "VISIT_POINT_COMPLETED" ? "visited" : "ignored";
      const note = input.type === "VISIT_POINT_SKIPPED" ? reason.trim() || null : null;

      const { error } = await supabase.rpc("set_journey_visit_point_status", {
        _visit_point_id: input.pointId,
        _status: status,
        ...(note ? { _note: note } : {}),
      });
      if (error) throw error;
    },
    onSuccess: (_data, variables) => {
      setSubmittedPointId(variables.pointId);
      feedback.success(t("w11.recorded"));
      setReason("");
      setSkipOpen(false);
      onRecorded();
    },
    onError: (error) => {
      setSubmittedPointId(null);
      feedback.error(humanizeError(error, locale));
    },
  });

  if (state.total === 0) return null;

  const currentAlreadySubmitted = Boolean(current && submittedPointId === current.id);
  const actionDisabled = record.isPending || currentAlreadySubmitted;

  return (
    <section
      id="cockpit-visit-point"
      className="surface-panel mt-3 p-4"
      aria-label={t("w11.live.title")}
    >
      <p className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
        <MapPin className="size-3.5" aria-hidden="true" />
        {t("w11.live.title")}
      </p>

      {current ? (
        <>
          <h3 className="mt-1 break-words text-lg font-semibold text-foreground">
            {current.title}
          </h3>
          <div className="mt-2 grid grid-cols-2 gap-2 text-sm">
            <div>
              <p className="text-xs text-muted-foreground">{t("w11.live.progress")}</p>
              <p className="tabular-nums">
                {state.currentPosition} {t("w11.live.of")} {state.total}
              </p>
            </div>
            {current.estimatedMinutes ? (
              <div>
                <p className="text-xs text-muted-foreground">{t("w11.live.suggested")}</p>
                <p className="tabular-nums">
                  {current.estimatedMinutes} {t("w11.live.minutes")}
                </p>
              </div>
            ) : null}
          </div>

          {current.interpretiveContent ? (
            <p className="mt-3 break-words text-sm text-foreground/90">
              {current.interpretiveContent}
            </p>
          ) : null}
          {current.operationalNote ? (
            <p className="mt-2 break-words text-sm text-muted-foreground">
              {current.operationalNote}
            </p>
          ) : null}

          <div className="mt-3 flex flex-col gap-2 sm:flex-row">
            <Button
              className="min-h-11 flex-1"
              disabled={actionDisabled}
              onClick={() =>
                record.mutate({ type: "VISIT_POINT_COMPLETED", pointId: current.id })
              }
            >
              {currentAlreadySubmitted ? t("w11.status.completed") : t("w11.live.complete")}
            </Button>
            <Button
              variant="outline"
              className="min-h-11"
              onClick={() => setSkipOpen(true)}
              disabled={actionDisabled}
            >
              {t("w11.live.skip")}
            </Button>
          </div>
        </>
      ) : (
        <p className="mt-2 text-sm text-muted-foreground">{t("w11.live.allResolved")}</p>
      )}

      <Button
        variant="ghost"
        size="sm"
        className="mt-2 min-h-9 px-0"
        onClick={() => setShowAll((value) => !value)}
      >
        {showAll ? t("w11.live.hideAll") : t("w11.live.seeAll")}
      </Button>

      {showAll ? (
        <ol className="mt-1 space-y-1 text-sm">
          {state.points.map((point) => (
            <li key={point.id} className="flex flex-wrap items-center gap-2">
              <span className="min-w-0 flex-1 break-words">{point.title}</span>
              <span className="shrink-0 font-mono text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
                {t(`w11.status.${point.status}`)}
              </span>
            </li>
          ))}
        </ol>
      ) : null}

      <p className="mt-2 text-xs text-muted-foreground">{t("w11.live.advisory")}</p>

      <Dialog open={skipOpen} onOpenChange={setSkipOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t("w11.live.skipTitle")}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="vp-skip-reason">{t("w11.field.reason")}</Label>
              <Textarea
                id="vp-skip-reason"
                value={reason}
                onChange={(event) => setReason(event.target.value)}
                rows={3}
              />
            </div>
            {current && current.isRequired && !reason.trim() ? (
              <p className="text-xs text-warning">{t("w11.live.skipReasonRequired")}</p>
            ) : null}
            <Button
              className="min-h-11 w-full"
              disabled={
                actionDisabled || !current || !canSkip({ isRequired: current.isRequired }, reason)
              }
              onClick={() =>
                current &&
                record.mutate({ type: "VISIT_POINT_SKIPPED", pointId: current.id })
              }
            >
              {t("w11.live.skip")}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </section>
  );
}
