import * as React from "react";
import { createFileRoute, useParams } from "@tanstack/react-router";
import { Bot, Send, UserRound } from "lucide-react";

import {
  useAssistantConversation,
  useAssistantMessages,
  useSubmitAssistantMessage,
} from "@/lib/assistant-conversations";
import { useMyOverview } from "@/lib/w10";
import { PortalShell } from "@/app/portal/portal-shell";
import { PortalCard, PortalQueryGate } from "@/app/portal/portal-states";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

export const Route = createFileRoute("/_authenticated/my/$operationId/assistant")({
  head: () => ({
    meta: [
      { title: "Assistente COBS — Portal do viajante" },
      {
        name: "description",
        content: "Tire dúvidas sobre a sua viagem usando apenas informações confirmadas da operação.",
      },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: PortalAssistant,
});

function PortalAssistant() {
  const { operationId } = useParams({ from: "/_authenticated/my/$operationId/assistant" });
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
    <PortalShell
      operationId={operationId}
      title={overview.data?.name ?? "Assistente COBS"}
      active="assistant"
    >
      <div className="mb-4">
        <h2 className="text-lg font-semibold text-foreground">Assistente COBS</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Pergunte sobre horários, programação, transporte, hospedagem e informações confirmadas da sua viagem.
        </p>
      </div>

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
                  <p className="font-medium text-foreground">Como posso ajudar?</p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Eu respondo usando os dados disponíveis da sua operação. Quando uma informação não estiver confirmada, não vou inventar.
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
                    <span>{mine ? "Você" : message.role === "human" ? "Equipe COBS" : "COBS"}</span>
                  </div>
                  <p className="whitespace-pre-wrap break-words text-sm">{message.content}</p>
                  {mine && message.status === "pending" ? (
                    <p className="mt-1 text-[11px] opacity-70">Processando…</p>
                  ) : null}
                </div>
              </div>
            );
          })}
          <div ref={bottomRef} />
        </div>
      </PortalQueryGate>

      <form
        className="sticky bottom-20 mt-4 rounded-2xl border border-border bg-background/95 p-3 shadow-sm backdrop-blur lg:bottom-4"
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
          placeholder="Digite sua pergunta…"
          aria-label="Mensagem para o Assistente COBS"
          rows={2}
          maxLength={1200}
          disabled={!conversation.data || submit.isPending}
          className="min-h-[72px] resize-none"
        />
        <div className="mt-2 flex items-center justify-between gap-3">
          <p className="text-xs text-muted-foreground">Enter envia · Shift+Enter quebra linha</p>
          <Button type="submit" disabled={!draft.trim() || !conversation.data || submit.isPending}>
            <Send className="mr-2 size-4" aria-hidden="true" />
            Enviar
          </Button>
        </div>
        {submit.isError ? (
          <p className="mt-2 text-xs text-destructive">Não foi possível enviar. Tente novamente.</p>
        ) : null}
      </form>
    </PortalShell>
  );
}
