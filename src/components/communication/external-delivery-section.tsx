import * as React from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { RotateCcw, Send } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { humanizeError } from "@/lib/auth";
import { useI18n } from "@/lib/i18n";
import { formatDateTime } from "@/lib/format";
import {
  OUTBOX_STATUS_TONE,
  canRetryOutbox,
  lastRelevantOutboxTimestamp,
  newIdempotencyKey,
  summarizeOutbox,
  type OutboxRow,
} from "@/lib/w08";
import { Button } from "@/components/ui/button";
import { feedback } from "@/components/feedback/feedback";

/**
 * W08 — External delivery (outbox) read-only section.
 * Renders ONLY when the backend actually returns rows for the message; the UI
 * never invents delivery state. `destination_snapshot`, provider ids and raw
 * payloads are deliberately not selected. If the outbox surface is absent on
 * the backend, the query degrades to an empty list and the section stays
 * hidden — no error, no fabricated state.
 */
export function ExternalDeliverySection({
  messageId,
  names,
}: {
  messageId: string;
  /** person_id → full name, reused from the recipient snapshot (no extra PII query). */
  names: Record<string, string>;
}) {
  const { t, locale, timeZone } = useI18n();

  const outbox = useQuery({
    queryKey: ["w08-outbox", messageId],
    queryFn: async () => {
      const { data, error } = await supabase
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .from("communication_outbox" as any)
        .select(
          "id, message_id, person_id, channel, status, attempt_count, next_attempt_at, last_error_code, last_error_message, accepted_at, sent_at, delivered_at, read_at, failed_at, dead_lettered_at, updated_at",
        )
        .eq("message_id", messageId)
        .order("created_at", { ascending: true });
      /* Surface absent or unreadable → hide the section instead of erroring the page. */
      if (error) return [] as OutboxRow[];
      return (data ?? []) as unknown as OutboxRow[];
    },
  });

  const retry = useMutation({
    mutationFn: async (outboxId: string) => {
      const { error } = await supabase.rpc(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        "retry_communication_delivery" as any,
        {
          _outbox_id: outboxId,
          _idempotency_key: newIdempotencyKey(),
        },
      );
      if (error) throw error;
    },
    onSuccess: () => {
      feedback.success(t("w08.outbox.retried"));
      void outbox.refetch();
    },
    onError: (error) => feedback.error(humanizeError(error, locale)),
  });

  const rows = React.useMemo(() => outbox.data ?? [], [outbox.data]);
  if (rows.length === 0) return null;

  const summary = summarizeOutbox(rows);

  return (
    <section className="surface-panel space-y-3 p-4">
      <div>
        <h3 className="flex items-center gap-2 text-sm font-medium">
          <Send className="size-4 text-muted-foreground" aria-hidden="true" />
          {t("w08.outbox.title")}
        </h3>
        <p className="mt-1 text-xs text-muted-foreground">{t("w08.outbox.hint")}</p>
      </div>

      <div className="flex flex-wrap gap-1.5">
        {summary.map(({ status, count }) => (
          <span
            key={status}
            className={`rounded px-1.5 py-0.5 text-[11px] tabular-nums ${OUTBOX_STATUS_TONE[status]}`}
          >
            {t(`w08.outbox.status.${status}`)} · {count}
          </span>
        ))}
      </div>

      <ul className="divide-y divide-border">
        {rows.map((row) => {
          const lastAt = lastRelevantOutboxTimestamp(row);
          const name = (row.person_id && names[row.person_id]) || t("w08.outbox.unknownRecipient");
          return (
            <li key={row.id} className="space-y-1.5 py-2 text-sm">
              <div className="flex flex-wrap items-center gap-2">
                <span className="min-w-0 flex-1 truncate font-medium">{name}</span>
                <span className="rounded bg-elevated px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
                  {row.channel}
                </span>
                <span
                  className={`rounded px-1.5 py-0.5 text-[11px] ${OUTBOX_STATUS_TONE[row.status]}`}
                >
                  {t(`w08.outbox.status.${row.status}`)}
                </span>
              </div>

              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                <span>
                  {t("w08.outbox.attempts")}: {row.attempt_count}
                </span>
                {lastAt ? <span>{formatDateTime(lastAt, { locale, timeZone })}</span> : null}
              </div>

              {row.status === "retry_wait" ? (
                <p className="text-xs text-warning">
                  {t("w08.outbox.retryAuto")}
                  {row.next_attempt_at
                    ? ` — ${t("w08.outbox.nextAttempt")}: ${formatDateTime(row.next_attempt_at, { locale, timeZone })}`
                    : ""}
                </p>
              ) : null}

              {row.last_error_code || row.last_error_message ? (
                <p className="text-xs text-destructive">
                  {t("w08.outbox.error")}:{" "}
                  {[row.last_error_code, row.last_error_message].filter(Boolean).join(" — ")}
                </p>
              ) : null}

              {canRetryOutbox(row.status) ? (
                <Button
                  type="button"
                  size="sm"
                  variant="secondary"
                  className="min-h-9"
                  disabled={retry.isPending}
                  aria-label={`${t("w08.outbox.retry")} — ${name}`}
                  onClick={() => {
                    if (!window.confirm(t("w08.outbox.retryConfirm"))) return;
                    retry.mutate(row.id);
                  }}
                >
                  <RotateCcw className="size-4" aria-hidden="true" />
                  {t("w08.outbox.retry")}
                </Button>
              ) : null}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
