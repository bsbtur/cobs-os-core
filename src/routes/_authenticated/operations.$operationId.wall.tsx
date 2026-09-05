import { useState } from "react";
import { createFileRoute, useParams } from "@tanstack/react-router";
import { ListChecks, MessageSquareText, Plus, Send, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { createWallPost, type WallPostKind } from "@/lib/operation-wall";

export const Route = createFileRoute("/_authenticated/operations/$operationId/wall")({
  component: OperationWallComposer,
});

function OperationWallComposer() {
  const { operationId } = useParams({ from: "/_authenticated/operations/$operationId/wall" });
  const [kind, setKind] = useState<WallPostKind>("post");
  const [body, setBody] = useState("");
  const [options, setOptions] = useState(["", ""]);
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const cleanOptions = options.map((option) => option.trim()).filter(Boolean);
  const valid = body.trim().length > 0 && body.trim().length <= 2000 && (kind === "post" || (cleanOptions.length >= 2 && cleanOptions.length <= 6));

  const publish = async () => {
    if (!valid || submitting) return;
    setSubmitting(true);
    setMessage(null);
    try {
      await createWallPost(operationId, body.trim(), kind, kind === "poll" ? cleanOptions : []);
      setBody("");
      setOptions(["", ""]);
      setMessage({ type: "success", text: "Publicado no Mural dos viajantes." });
    } catch (error) {
      setMessage({
        type: "error",
        text: error instanceof Error ? error.message : "Não foi possível publicar no Mural.",
      });
    } finally {
      setSubmitting(false);
    }
  };

  const setOption = (index: number, value: string) => {
    setOptions((current) => current.map((option, i) => (i === index ? value : option)));
  };

  const addOption = () => {
    if (options.length < 6) setOptions((current) => [...current, ""]);
  };

  const removeOption = (index: number) => {
    if (options.length <= 2) return;
    setOptions((current) => current.filter((_, i) => i !== index));
  };

  return (
    <section className="space-y-5">
      <header>
        <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">Interação</p>
        <h2 className="mt-1 text-xl font-semibold">Mural da viagem</h2>
        <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
          Publique avisos leves, perguntas e enquetes para os viajantes. Eles podem reagir, comentar e votar pelo Portal do Viajante.
        </p>
      </header>

      <section className="surface-panel space-y-5 p-5">
        <div className="grid gap-2 sm:grid-cols-2">
          <button
            type="button"
            onClick={() => setKind("post")}
            className={`flex min-h-16 items-center gap-3 rounded-xl border px-4 text-left transition-colors ${kind === "post" ? "border-primary bg-primary-soft text-primary" : "border-border hover:border-primary/40"}`}
          >
            <MessageSquareText className="size-5 shrink-0" aria-hidden="true" />
            <span>
              <span className="block font-medium">Post</span>
              <span className="block text-xs opacity-80">Mensagem curta para o grupo</span>
            </span>
          </button>
          <button
            type="button"
            onClick={() => setKind("poll")}
            className={`flex min-h-16 items-center gap-3 rounded-xl border px-4 text-left transition-colors ${kind === "poll" ? "border-primary bg-primary-soft text-primary" : "border-border hover:border-primary/40"}`}
          >
            <ListChecks className="size-5 shrink-0" aria-hidden="true" />
            <span>
              <span className="block font-medium">Enquete</span>
              <span className="block text-xs opacity-80">2 a 6 alternativas</span>
            </span>
          </button>
        </div>

        <div className="space-y-2">
          <label htmlFor="wall-body" className="text-sm font-medium">
            {kind === "poll" ? "Pergunta ou contexto" : "Mensagem"}
          </label>
          <Textarea
            id="wall-body"
            value={body}
            onChange={(event) => setBody(event.target.value)}
            placeholder={kind === "poll" ? "Ex.: O que vocês preferem fazer no tempo livre?" : "Ex.: Amanhã sairemos 15 minutos mais cedo. Quem está animado?"}
            maxLength={2000}
            rows={5}
          />
          <p className="text-right font-mono text-[10px] text-muted-foreground">{body.length}/2000</p>
        </div>

        {kind === "poll" ? (
          <div className="space-y-3">
            <div className="flex items-center justify-between gap-3">
              <p className="text-sm font-medium">Alternativas</p>
              <Button type="button" variant="outline" size="sm" onClick={addOption} disabled={options.length >= 6}>
                <Plus className="mr-2 size-4" aria-hidden="true" />
                Adicionar
              </Button>
            </div>
            <div className="space-y-2">
              {options.map((option, index) => (
                <div key={index} className="flex items-center gap-2">
                  <Input
                    value={option}
                    onChange={(event) => setOption(index, event.target.value)}
                    placeholder={`Alternativa ${index + 1}`}
                    maxLength={120}
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={() => removeOption(index)}
                    disabled={options.length <= 2}
                    aria-label={`Remover alternativa ${index + 1}`}
                  >
                    <Trash2 className="size-4" aria-hidden="true" />
                  </Button>
                </div>
              ))}
            </div>
          </div>
        ) : null}

        {message ? (
          <div className={`rounded-lg border px-3 py-2 text-sm ${message.type === "success" ? "border-success/40 text-success" : "border-destructive/40 text-destructive"}`} role="status">
            {message.text}
          </div>
        ) : null}

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-4">
          <p className="text-xs text-muted-foreground">A publicação aparece somente nesta operação.</p>
          <Button type="button" onClick={() => void publish()} disabled={!valid || submitting}>
            <Send className="mr-2 size-4" aria-hidden="true" />
            {submitting ? "Publicando…" : "Publicar no Mural"}
          </Button>
        </div>
      </section>
    </section>
  );
}
