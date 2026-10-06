import * as React from "react";
import { createFileRoute, useParams } from "@tanstack/react-router";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { BellRing, CheckCheck, ShieldCheck } from "lucide-react";

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

  // Reading the notice IS the read receipt. Only record the fact after the card
  // is actually visible, so opening a long inbox does not mark off-screen notices.
  React.useEffect(() => {
    const nodes = document.querySelectorAll<HTMLElement>("[data-unread-message-id]");
    if (nodes.length === 0) return;

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting || entry.intersectionRatio < 0.6) continue;
          const node = entry.target as HTMLElement;
          const messageId = node.dataset.unreadMessageId;
          if (!messageId || seen.current.has(messageId)) continue;
          seen.current.add(messageId);
          observer.unobserve(node);
          markRead.mutate(messageId);
        }
      },
      { threshold: 0.6 },
    );

    nodes.forEach((node) => observer.observe(node));
    return () => observer.disconnect();
  }, [list, markRead]);

  return (
    <PortalShell
      operationId={operationId}
      title={overview.data?.name ?? t("w10.portal.brand")}
      active="messages"
    >
      <section className="mb-5 rounded-3xl border border-border/70 bg-gradient-to-br from-card via-card to-muted/50 p-5 shadow-sm">
        <div className="flex items-start gap-3">
          <div className="rounded-2xl bg-primary/10 p-3"><BellRing className="h-5 w-5 text-primary" /></div>
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-primary">{t("w10.messages.eyebrow")}</p>
            <h2 className="mt-1 text-xl font-semibold text-foreground">{t("w10.messages.title")}</h2>
            <p className="mt-1 text-sm text-muted-foreground">{t("w10.messages.heroBody")}</p>
          </div>
        </div>
        <div className="mt-4 grid gap-2 sm:grid-cols-2">
          <div className="flex gap-2 rounded-xl border bg-background/60 p-3 text-xs text-foreground"><ShieldCheck className="h-4 w-4 shrink-0 text-primary" />{t("w10.messages.reference")}</div>
          <div className="flex gap-2 rounded-xl border bg-background/60 p-3 text-xs text-foreground"><CheckCheck className="h-4 w-4 shrink-0 text-primary" />{t("w10.messages.readReceipt")}</div>
        </div>
      </section>
      <PortalQueryGate
        isLoading={messages.isLoading}
        error={messages.error}
        onRetry={() => void messages.refetch()}
      >
        {list.length === 0 ? (
          <PortalEmpty icon={BellRing} title={t("w10.messages.emptyTitle")} body={t("w10.messages.empty")} />
        ) : (
          <div className="flex flex-col gap-3">
            {list.map((m) => (
              <div
                key={m.messageId}
                data-unread-message-id={
                  m.status === "published" && m.myFirstReadAt === null ? m.messageId : undefined
                }
              >
                <PortalCard>
                <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-3">
                  <h3 className="min-w-0 break-words text-base font-medium text-foreground">
                    {m.title ?? "—"}
                  </h3>
                  <div className="flex flex-wrap items-center justify-end gap-1.5">
                    {m.priority === "urgent" ? (
                      <span className="inline-flex shrink-0 items-center rounded-full border border-destructive/30 bg-destructive/10 px-2 py-0.5 text-[11px] font-medium text-destructive">
                        {t("w10.messages.priorityUrgent")}
                      </span>
                    ) : m.priority === "important" ? (
                      <span className="inline-flex shrink-0 items-center rounded-full border border-primary/25 bg-primary/10 px-2 py-0.5 text-[11px] font-medium text-primary">
                        {t("w10.messages.priorityImportant")}
                      </span>
                    ) : null}
                    {m.status === "cancelled" ? (
                      <PortalTag>{t("w10.messages.cancelled")}</PortalTag>
                    ) : m.myFirstReadAt === null ? (
                      <span className="size-2 shrink-0 rounded-full bg-primary" aria-hidden />
                    ) : null}
                  </div>
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
              </div>
            ))}
          </div>
        )}
      </PortalQueryGate>
    </PortalShell>
  );
}
