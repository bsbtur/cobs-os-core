import * as React from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { MessagesSquare } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { humanizeError } from "@/lib/auth";
import { useI18n } from "@/lib/i18n";
import { formatDateTime } from "@/lib/format";
import { useTenant } from "@/lib/tenant";
import { AppShell } from "@/app/shell/app-shell";
import { RequireTenant } from "@/app/shell/require-tenant";
import {
  MESSAGE_PRIORITY_TONE,
  isExpired,
  type Inbox,
  type InboxMessage,
} from "@/lib/w08";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/feedback/empty-state";
import { PanelSkeleton } from "@/components/feedback/loading";
import { feedback } from "@/components/feedback/feedback";

/**
 * COBS OS · W08 — recipient inbox.
 * RECIPIENT-SELF ONLY: the Person is derived from the session on the backend.
 * Reading is a FACT recorded once; the UI never invents or clears it.
 */
export const Route = createFileRoute("/_authenticated/inbox")({
  head: () => ({
    meta: [
      { title: "My messages — operational inbox in COBS OS" },
      {
        name: "description",
        content:
          "Published operational messages addressed to you, with read state recorded the moment you open them.",
      },
      { property: "og:title", content: "My messages — COBS OS" },
      {
        property: "og:description",
        content: "Your operational inbox: messages addressed to you across your operations.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: InboxPage,
});

function InboxRow({ message, onRead }: { message: InboxMessage; onRead: (id: string) => void }) {
  const { t, locale, timeZone } = useI18n();
  const expired = isExpired(message);

  return (
    <li className="surface-panel space-y-2 p-4">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="min-w-0 flex-1 truncate text-sm font-medium">{message.title}</h2>
        <span
          className={`rounded px-1.5 py-0.5 text-[11px] ${MESSAGE_PRIORITY_TONE[message.priority]}`}
        >
          {t(`w08.priority.${message.priority}`)}
        </span>
        {!message.first_read_at ? (
          <span className="rounded bg-primary-soft px-1.5 py-0.5 text-[11px] text-primary">
            {t("w08.inbox.unread")}
          </span>
        ) : null}
        {expired ? (
          <span className="rounded bg-elevated px-1.5 py-0.5 text-[11px] text-muted-foreground">
            {t("w08.inbox.expired")}
          </span>
        ) : null}
      </div>

      <p className="whitespace-pre-wrap text-sm text-muted-foreground">{message.body}</p>

      {message.cancelled_at ? (
        <p className="text-xs text-destructive">{t("w08.inbox.cancelled")}</p>
      ) : null}

      <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
        <span>
          {t(`w08.kind.${message.kind}`)}
          {message.published_at
            ? ` · ${formatDateTime(message.published_at, { locale, timeZone })}`
            : ""}
        </span>
        {message.first_read_at ? (
          <span>
            {t("w08.inbox.readAt")} {formatDateTime(message.first_read_at, { locale, timeZone })}
          </span>
        ) : (
          <Button
            type="button"
            size="sm"
            variant="secondary"
            className="ml-auto min-h-9"
            onClick={() => onRead(message.id)}
          >
            {t("w08.inbox.markRead")}
          </Button>
        )}
      </div>
    </li>
  );
}

function InboxContent() {
  const { t, locale } = useI18n();
  const { tenant } = useTenant();
  const queryClient = useQueryClient();

  const inbox = useQuery({
    queryKey: ["w08-inbox", tenant?.id],
    enabled: Boolean(tenant?.id),
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_my_message_inbox", {
        _tenant_id: tenant!.id,
      });
      if (error) throw error;
      return data as unknown as Inbox;
    },
  });

  React.useEffect(() => {
    const channel = supabase
      .channel("w08-inbox")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "communication_events" },
        () => {
          void queryClient.invalidateQueries({ queryKey: ["w08-inbox"] });
        },
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [queryClient]);

  const markRead = useMutation({
    mutationFn: async (messageId: string) => {
      const { error } = await supabase.rpc("mark_message_read", { _message_id: messageId });
      if (error) throw error;
    },
    onSuccess: () => {
      feedback.success(t("w08.inbox.markedRead"));
      void inbox.refetch();
    },
    onError: (error) => feedback.error(humanizeError(error, locale)),
  });

  if (inbox.isLoading) return <PanelSkeleton rows={4} />;

  if (inbox.isError) {
    return (
      <EmptyState
        icon={MessagesSquare}
        title={t("w08.loadError")}
        body={humanizeError(inbox.error, locale)}
      />
    );
  }

  if (inbox.data && inbox.data.person_id === null) {
    return (
      <EmptyState
        icon={MessagesSquare}
        title={t("w08.inbox.noPerson")}
        body={t("w08.inbox.noPersonBody")}
      />
    );
  }

  const messages = inbox.data?.messages ?? [];

  return (
    <div className="space-y-4">
      <header>
        <h1 className="text-lg font-medium">{t("w08.inbox.title")}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{t("w08.inbox.subtitle")}</p>
      </header>

      {messages.length === 0 ? (
        <EmptyState
          icon={MessagesSquare}
          title={t("w08.inbox.empty")}
          body={t("w08.inbox.emptyBody")}
        />
      ) : (
        <ul className="space-y-3">
          {messages.map((m) => (
            <InboxRow key={m.id} message={m} onRead={(id) => markRead.mutate(id)} />
          ))}
        </ul>
      )}
    </div>
  );
}

function InboxPage() {
  const { t } = useI18n();
  return (
    <AppShell activeId="inbox" title={t("w08.inbox.title")}>
      <div className="mx-auto w-full max-w-3xl">
        <RequireTenant>
          <InboxContent />
        </RequireTenant>
      </div>
    </AppShell>
  );
}
