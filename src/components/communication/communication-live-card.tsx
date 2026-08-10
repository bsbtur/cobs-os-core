import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { MessagesSquare } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { useI18n } from "@/lib/i18n";
import { formatDateTime } from "@/lib/format";
import {
  MESSAGE_PRIORITY_TONE,
  MESSAGE_STATUS_TONE,
  deliverySummary,
  type CommunicationFeed,
} from "@/lib/w08";
import { Button } from "@/components/ui/button";

/**
 * Read-only communication summary for the W04 Live page.
 * BOUNDARY: reads W08 facts, never writes them. Drafting, audience and
 * publication live on the Communication tab only.
 */
export function CommunicationLiveCard({ operationId }: { operationId: string }) {
  const { t, locale, timeZone } = useI18n();

  const feed = useQuery({
    queryKey: ["w08-live-card", operationId],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_operation_communication_feed", {
        _operation_id: operationId,
        _limit: 50,
      });
      if (error) throw error;
      return data as unknown as CommunicationFeed;
    },
  });

  const messages = feed.data?.messages ?? [];
  /* The card only exists once the operation actually communicates. */
  if (messages.length === 0) return null;

  const published = messages.filter((m) => m.status === "published");
  const latest = published[0] ?? null;
  const drafts = messages.filter((m) => m.status === "draft" || m.status === "scheduled").length;
  const summary = latest ? deliverySummary(latest.summary) : null;

  return (
    <section className="surface-panel p-4">
      <div className="flex items-center gap-2">
        <MessagesSquare className="size-4 text-muted-foreground" aria-hidden="true" />
        <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
          {t("w08.live.title")}
        </p>
        <Button asChild size="sm" variant="ghost" className="ml-auto min-h-9">
          <Link from="/operations/$operationId" to="/operations/$operationId/communication">
            {t("w08.live.open")}
          </Link>
        </Button>
      </div>

      {latest ? (
        <div className="mt-3 flex flex-wrap items-center gap-2 text-sm">
          <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
            {t("w08.live.latest")}
          </span>
          <span className="min-w-0 truncate font-medium">{latest.title}</span>
          <span
            className={`rounded px-1.5 py-0.5 text-[11px] ${MESSAGE_PRIORITY_TONE[latest.priority]}`}
          >
            {t(`w08.priority.${latest.priority}`)}
          </span>
          {summary ? (
            <span className="ml-auto text-muted-foreground">
              {summary.read_count}/{summary.in_app_reachable_count} {t("w08.live.readRate")}
            </span>
          ) : null}
          {latest.published_at ? (
            <span className="w-full text-xs text-muted-foreground">
              {formatDateTime(latest.published_at, { locale, timeZone })}
            </span>
          ) : null}
        </div>
      ) : null}

      {drafts > 0 ? (
        <p className="mt-2 flex items-center gap-2 text-xs text-muted-foreground">
          <span className={`rounded px-1.5 py-0.5 text-[11px] ${MESSAGE_STATUS_TONE.draft}`}>
            {drafts}
          </span>
          {t("w08.live.drafts")}
        </p>
      ) : null}
    </section>
  );
}
