import * as React from "react";
import { createFileRoute, useParams } from "@tanstack/react-router";
import { useMutation, useQueryClient } from "@tanstack/react-query";

import { supabase } from "@/integrations/supabase/client";
import { useI18n } from "@/lib/i18n";
import { formatDateTime } from "@/lib/format";
import { portalKeys, useMyMessages, useMyOverview } from "@/lib/w10";
import { PortalShell } from "@/app/portal/portal-shell";
import { PortalCard, PortalEmpty, PortalQueryGate, PortalTag } from "@/app/portal/portal-states";

export const Route = createFileRoute("/_authenticated/my/$operationId/messages")({
  head: () => ({
    meta: [
      { title: "My notices — COBS OS traveler portal" },
      { name: "description", content: "Notices and updates sent to you for this experience." },
      { property: "og:title", content: "My notices — COBS OS traveler portal" },
      { property: "og:description", content: "Everything the team has sent you, newest first." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: PortalMessages,
});

function PortalMessages() {
  const { operationId } = useParams({ from: "/_authenticated/my/$operationId/messages" });
  const { t, locale } = useI18n();
  const queryClient = useQueryClient();
  const overview = useMyOverview(operationId);
  const messages = useMyMessages(operationId);
  const tz = overview.data?.timezone ?? null;
  const ctx = tz ? { locale, timeZone: tz } : { locale };

  const markRead = useMutation({
    mutationFn: async (messageId: string) => {
      const { error } = await supabase.rpc("mark_message_read", { _message_id: messageId });
      if (error) throw error;
    },
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: portalKeys.scoped(operationId, "messages") }),
  });

  const list = React.useMemo(() => messages.data ?? [], [messages.data]);
  const seen = React.useRef(new Set<string>());

  // Reading the notice IS the read receipt — no extra button, one call per message.
  React.useEffect(() => {
    for (const m of list) {
      if (m.status === "published" && m.myFirstReadAt === null && !seen.current.has(m.messageId)) {
        seen.current.add(m.messageId);
        markRead.mutate(m.messageId);
      }
    }
  }, [list, markRead]);

  return (
    <PortalShell
      operationId={operationId}
      title={overview.data?.name ?? t("w10.portal.brand")}
      active="messages"
    >
      <h2 className="mb-3 text-lg font-semibold text-foreground">{t("w10.messages.title")}</h2>
      <PortalQueryGate
        isLoading={messages.isLoading}
        error={messages.error}
        onRetry={() => void messages.refetch()}
      >
        {list.length === 0 ? (
          <PortalEmpty body={t("w10.messages.empty")} />
        ) : (
          <div className="flex flex-col gap-3">
            {list.map((m) => (
              <PortalCard key={m.messageId}>
                <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-3">
                  <h3 className="min-w-0 break-words text-base font-medium text-foreground">
                    {m.title ?? "—"}
                  </h3>
                  {m.status === "cancelled" ? (
                    <PortalTag>{t("w10.messages.cancelled")}</PortalTag>
                  ) : m.myFirstReadAt === null ? (
                    <span className="mt-1 size-2 shrink-0 rounded-full bg-primary" aria-hidden />
                  ) : null}
                </div>
                {m.body ? (
                  <p className="mt-2 whitespace-pre-wrap break-words text-sm text-foreground">
                    {m.body}
                  </p>
                ) : null}
                {m.publishedAt ? (
                  <p className="mt-2 text-xs text-muted-foreground">
                    {formatDateTime(m.publishedAt, ctx)}
                  </p>
                ) : null}
                {m.myFirstReadAt ? (
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {t("w10.messages.readAt")}: {formatDateTime(m.myFirstReadAt, ctx)}
                  </p>
                ) : null}
              </PortalCard>
            ))}
          </div>
        )}
      </PortalQueryGate>
    </PortalShell>
  );
}
