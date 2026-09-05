import * as React from "react";
import { createFileRoute, useParams } from "@tanstack/react-router";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { MessageCircle } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PortalShell } from "@/app/portal/portal-shell";
import { PortalCard, PortalEmpty, PortalQueryGate } from "@/app/portal/portal-states";
import { formatDateTime } from "@/lib/format";
import { useI18n } from "@/lib/i18n";
import { useMyOverview } from "@/lib/w10";
import {
  addWallComment,
  toggleWallReaction,
  useMyOperationWall,
  voteWallPoll,
  wallKeys,
  type WallPost,
  type WallReaction,
} from "@/lib/operation-wall";

export const Route = createFileRoute("/_authenticated/my/$operationId/wall")({
  head: () => ({
    meta: [
      { title: "Mural — COBS OS" },
      { name: "description", content: "Interações e enquetes da sua viagem." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: PortalWall,
});

const REACTIONS: Array<{ id: WallReaction; emoji: string }> = [
  { id: "heart", emoji: "❤️" },
  { id: "clap", emoji: "👏" },
  { id: "fire", emoji: "🔥" },
  { id: "wow", emoji: "😍" },
];

const COPY = {
  "pt-BR": {
    title: "Mural",
    subtitle: "Interaja com a organização e com os viajantes da sua experiência.",
    empty: "Ainda não há publicações. Os próximos avisos, perguntas e enquetes aparecerão aqui.",
    vote: "voto",
    votes: "votos",
    you: "Você",
    commentPlaceholder: "Escreva um comentário…",
    send: "Enviar",
  },
  "en-US": {
    title: "Wall",
    subtitle: "Interact with the organizers and travelers in your experience.",
    empty: "No posts yet. New questions, polls and updates will appear here.",
    vote: "vote",
    votes: "votes",
    you: "You",
    commentPlaceholder: "Write a comment…",
    send: "Send",
  },
  "es-ES": {
    title: "Mural",
    subtitle: "Interactúa con la organización y con los viajeros de tu experiencia.",
    empty: "Todavía no hay publicaciones. Las preguntas, encuestas y novedades aparecerán aquí.",
    vote: "voto",
    votes: "votos",
    you: "Tú",
    commentPlaceholder: "Escribe un comentario…",
    send: "Enviar",
  },
} as const;

function PortalWall() {
  const { operationId } = useParams({ from: "/_authenticated/my/$operationId/wall" });
  const { t, locale } = useI18n();
  const copy = COPY[locale];
  const overview = useMyOverview(operationId);
  const wall = useMyOperationWall(operationId);
  const tz = overview.data?.timezone ?? undefined;

  return (
    <PortalShell
      operationId={operationId}
      title={overview.data?.name ?? t("w10.portal.brand")}
      active="wall"
    >
      <div className="mb-4">
        <h2 className="text-lg font-semibold text-foreground">{copy.title}</h2>
        <p className="mt-1 text-sm text-muted-foreground">{copy.subtitle}</p>
      </div>

      <PortalQueryGate isLoading={wall.isLoading} error={wall.error} onRetry={() => void wall.refetch()}>
        {(wall.data ?? []).length === 0 ? (
          <PortalEmpty body={copy.empty} />
        ) : (
          <div className="flex flex-col gap-4">
            {(wall.data ?? []).map((post) => (
              <WallPostCard
                key={post.postId}
                post={post}
                operationId={operationId}
                readOnly={overview.data?.readOnly === true}
                locale={locale}
                timeZone={tz}
              />
            ))}
          </div>
        )}
      </PortalQueryGate>
    </PortalShell>
  );
}

function WallPostCard({
  post,
  operationId,
  readOnly,
  locale,
  timeZone,
}: {
  post: WallPost;
  operationId: string;
  readOnly: boolean;
  locale: keyof typeof COPY;
  timeZone?: string;
}) {
  const copy = COPY[locale];
  const queryClient = useQueryClient();
  const [comment, setComment] = React.useState("");
  const invalidate = () => queryClient.invalidateQueries({ queryKey: wallKeys.scoped(operationId) });

  const reactionMutation = useMutation({
    mutationFn: ({ postId, reaction }: { postId: string; reaction: WallReaction }) =>
      toggleWallReaction(postId, reaction),
    onSuccess: invalidate,
  });
  const voteMutation = useMutation({ mutationFn: voteWallPoll, onSuccess: invalidate });
  const commentMutation = useMutation({
    mutationFn: ({ postId, body }: { postId: string; body: string }) => addWallComment(postId, body),
    onSuccess: () => {
      setComment("");
      void invalidate();
    },
  });

  const totalVotes = post.pollOptions.reduce((sum, option) => sum + option.votes, 0);

  return (
    <PortalCard>
      <div>
        <p className="text-sm font-semibold text-foreground">{post.authorLabel}</p>
        {post.publishedAt ? (
          <p className="mt-0.5 text-xs text-muted-foreground">
            {formatDateTime(post.publishedAt, timeZone ? { locale, timeZone } : { locale })}
          </p>
        ) : null}
      </div>

      <p className="mt-3 whitespace-pre-wrap break-words text-sm leading-6 text-foreground">{post.body}</p>

      {post.kind === "poll" ? (
        <div className="mt-4 flex flex-col gap-2">
          {post.pollOptions.map((option) => {
            const percentage = totalVotes > 0 ? Math.round((option.votes / totalVotes) * 100) : 0;
            return (
              <button
                key={option.optionId}
                type="button"
                disabled={readOnly || voteMutation.isPending}
                onClick={() => voteMutation.mutate(option.optionId)}
                className="relative min-h-12 overflow-hidden rounded-lg border border-border px-3 py-2 text-left disabled:cursor-not-allowed disabled:opacity-70"
              >
                <span
                  className="absolute inset-y-0 left-0 bg-primary/10 transition-[width]"
                  style={{ width: `${percentage}%` }}
                  aria-hidden
                />
                <span className="relative grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 text-sm">
                  <span className={option.selected ? "font-semibold text-primary" : "text-foreground"}>
                    {option.label}
                  </span>
                  <span className="text-xs text-muted-foreground">{percentage}%</span>
                </span>
              </button>
            );
          })}
          <p className="text-xs text-muted-foreground">
            {totalVotes} {totalVotes === 1 ? copy.vote : copy.votes}
          </p>
        </div>
      ) : null}

      <div className="mt-4 flex flex-wrap gap-2 border-t border-border pt-3">
        {REACTIONS.map(({ id, emoji }) => {
          const active = post.myReactions.includes(id);
          return (
            <button
              key={id}
              type="button"
              disabled={readOnly || reactionMutation.isPending}
              onClick={() => reactionMutation.mutate({ postId: post.postId, reaction: id })}
              aria-pressed={active}
              className={`min-h-10 rounded-full border px-3 text-sm transition-colors disabled:cursor-not-allowed disabled:opacity-70 ${
                active ? "border-primary bg-primary-soft text-primary" : "border-border text-foreground"
              }`}
            >
              {emoji} {post.reactions[id] ?? 0}
            </button>
          );
        })}
        <span className="inline-flex min-h-10 items-center gap-1 px-2 text-sm text-muted-foreground">
          <MessageCircle className="size-4" aria-hidden /> {post.comments.length}
        </span>
      </div>

      {post.comments.length > 0 ? (
        <div className="mt-3 flex flex-col gap-2 rounded-lg bg-muted/40 p-3">
          {post.comments.map((item) => (
            <div key={item.commentId} className="text-sm">
              <span className="font-medium text-foreground">{item.mine ? copy.you : item.authorName}</span>{" "}
              <span className="break-words text-foreground">{item.body}</span>
            </div>
          ))}
        </div>
      ) : null}

      {!readOnly ? (
        <form
          className="mt-3 flex items-end gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            const body = comment.trim();
            if (!body || commentMutation.isPending) return;
            commentMutation.mutate({ postId: post.postId, body });
          }}
        >
          <Input
            value={comment}
            onChange={(event) => setComment(event.target.value.slice(0, 500))}
            placeholder={copy.commentPlaceholder}
            aria-label={copy.commentPlaceholder}
            className="min-h-11"
          />
          <Button type="submit" disabled={!comment.trim() || commentMutation.isPending} className="min-h-11">
            {copy.send}
          </Button>
        </form>
      ) : null}
    </PortalCard>
  );
}
