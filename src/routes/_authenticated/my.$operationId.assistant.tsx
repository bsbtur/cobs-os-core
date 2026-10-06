import * as React from "react";
import { createFileRoute, useParams } from "@tanstack/react-router";
import { Bot, Send, ShieldCheck, Sparkles, UserRound } from "lucide-react";

import {
  type AssistantConversationMessage,
  useAssistantConversation,
  useAssistantMessages,
  useSubmitAssistantMessage,
} from "@/lib/assistant-conversations";
import { ASSISTANT_RESPONSE_WAIT_MS, getAssistantResponseState } from "@/lib/assistant-response-state";
import { useMyOverview } from "@/lib/w10";
import { useI18n } from "@/lib/i18n";
import { PortalFrame } from "@/app/portal/portal-shell";
import { PortalCard, PortalQueryGate } from "@/app/portal/portal-states";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

export const Route = createFileRoute("/_authenticated/my/$operationId/assistant")({
  head: () => ({
    meta: [
      { title: "Assistente COBS — Portal do viajante" },
      {
        name: "description",
        content: "Tire dúvidas sobre a sua viagem usando apenas informações confirmadas.",
      },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: PortalAssistant,
});

function PortalAssistant() {
  const { operationId } = useParams({ from: "/_authenticated/my/$operationId/assistant" });
  const { t } = useI18n();
  const overview = useMyOverview(operationId);
  const conversation = useAssistantConversation(operationId);
  const messages = useAssistantMessages(conversation.data?.conversationId);
  const submit = useSubmitAssistantMessage(operationId, conversation.data?.conversationId);
  const [draft, setDraft] = React.useState("");
  const bottomRef = React.useRef<HTMLDivElement | null>(null);

  React.useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages.data?.length]);

  async function send() {
    const content = draft.trim();
    if (!content || submit.isPending) return;
    setDraft("");
    try {
      await submit.mutateAsync(content);
    } catch {
      setDraft(content);
    }
  }

  return (
    <PortalFrame
      title={overview.data?.name ?? t("w10.home.assistantShortcut")}
      back={{ to: `/my/${operationId}`, label: t("w10.assistant.back") }}
    >
      <section className="mb-5 rounded-3xl border border-primary/20 bg-gradient-to-br from-card via-card to-primary/5 p-5 shadow-sm">
        <div className="flex items-start gap-3"><div className="rounded-2xl bg-primary/10 p-3"><Bot className="h-5 w-5 text-primary" /></div><div><p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-primary">{t("w10.assistant.eyebrow")}</p><h2 className="mt-1 text-xl font-semibold text-foreground">{t("w10.home.assistantShortcut")}</h2><p className="mt-1 text-sm text-muted-foreground">{t("w10.assistant.heroBody")}</p></div></div>
        <div className="mt-4 flex flex-wrap gap-2"><span className="inline-flex items-center gap-1.5 rounded-full border border-primary/20 bg-primary/10 px-3 py-1.5 text-xs font-medium text-primary"><ShieldCheck className="size-3.5" />{t("w10.assistant.confirmedOnly")}</span><span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-background/60 px-3 py-1.5 text-xs font-medium text-foreground"><Sparkles className="size-3.5 text-primary" />{t("w10.assistant.operationContext")}</span></div>
      </section>

      <PortalQueryGate
        isLoading={conversation.isLoading || messages.isLoading}
        error={conversation.error ?? messages.error}
        onRetry={() => {
          void conversation.refetch();
          void messages.refetch();
        }}
      >
        <div className="flex flex-col gap-3" aria-live="polite">
          {(messages.data ?? []).length === 0 ? (
            <PortalCard>
              <div className="flex gap-3">
                <span className="grid size-9 shrink-0 place-items-center rounded-full bg-primary-soft text-primary">
                  <Bot className="size-4" aria-hidden="true" />
                </span>
                <div>
                  <p className="font-medium text-foreground">{t("w10.assistant.emptyTitle")}</p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {t("w10.assistant.emptyBody")}
                  </p>
                </div>
              </div>
            </PortalCard>
          ) : null}

          {(messages.data ?? []).map((message) => {
            const mine = message.role === "user";
            return (
              <div key={message.messageId} className={mine ? "flex justify-end" : "flex justify-start"}>
                <div
                  className={
                    mine
                      ? "max-w-[88%] rounded-2xl rounded-br-md bg-primary px-4 py-3 text-primary-foreground"
                      : "max-w-[88%] rounded-2xl rounded-bl-md border border-border bg-elevated px-4 py-3 text-foreground"
                  }
                >
                  <div className="mb-1 flex items-center gap-2 text-xs opacity-80">
                    {mine ? (
                      <UserRound className="size-3.5" aria-hidden="true" />
                    ) : (
                      <Bot className="size-3.5" aria-hidden="true" />
                    )}
                    <span>{mine ? t("w10.assistant.you") : message.role === "human" ? t("w10.assistant.team") : "COBS"}</span>
                  </div>
                  <p className="whitespace-pre-wrap break-words text-sm">{message.content}</p>
                  <AssistantResponseStatus message={message} />
                </div>
              </div>
            );
          })}
          <div ref={bottomRef} />
        </div>
      </PortalQueryGate>

      <form
        className="sticky bottom-4 mt-4 rounded-2xl border border-border bg-background/95 p-3 shadow-sm backdrop-blur"
        onSubmit={(event) => {
          event.preventDefault();
          void send();
        }}
      >
        <Textarea
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey) {
              event.preventDefault();
              void send();
            }
          }}
          placeholder={t("w10.assistant.placeholder")}
          aria-label={t("w10.assistant.ariaMessage")}
          rows={2}
          maxLength={1200}
          disabled={!conversation.data || submit.isPending}
          className="min-h-[72px] resize-none"
        />
        <div className="mt-2 flex items-center justify-between gap-3">
          <p className="text-xs text-muted-foreground">{t("w10.assistant.keyboardHint")}</p>
          <Button type="submit" disabled={!draft.trim() || !conversation.data || submit.isPending}>
            <Send className="mr-2 size-4" aria-hidden="true" />
            {t("w10.assistant.send")}
          </Button>
        </div>
        {submit.isError ? (
          <p className="mt-2 text-xs text-destructive">{t("w10.assistant.sendError")}</p>
        ) : null}
      </form>
    </PortalFrame>
  );
}

function AssistantResponseStatus({ message }: { message: AssistantConversationMessage }) {
  const { t } = useI18n();
  const [now, setNow] = React.useState(() => Date.now());
  const { role, status, createdAt } = message;

  React.useEffect(() => {
    const current = Date.now();
    setNow(current);
    if (getAssistantResponseState({ role, status, createdAt }, current) !== "processing") return;
    const remaining = Date.parse(createdAt) + ASSISTANT_RESPONSE_WAIT_MS - current;
    const timer = setTimeout(() => setNow(Date.now()), remaining);
    return () => clearTimeout(timer);
  }, [role, status, createdAt]);

  const state = getAssistantResponseState(message, now);
  if (!state) return null;
  return <p className="mt-1 text-xs opacity-80" role="status">{t(`w10.assistant.${state}`)}</p>;
}
