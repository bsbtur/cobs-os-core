import { useQuery } from "@tanstack/react-query";

import { supabase } from "@/integrations/supabase/client";
import { toPortalError } from "@/lib/w10";

type Raw = Record<string, unknown>;
const obj = (value: unknown): Raw => (value && typeof value === "object" ? (value as Raw) : {});
const arr = (value: unknown): Raw[] => (Array.isArray(value) ? value.map(obj) : []);
const str = (value: unknown): string | null => (typeof value === "string" ? value : null);
const req = (value: unknown): string => (typeof value === "string" ? value : "");
const num = (value: unknown): number => (typeof value === "number" ? value : 0);
const bool = (value: unknown): boolean => value === true;

export const WALL_REACTIONS = ["heart", "clap", "fire", "wow"] as const;
export type WallReaction = (typeof WALL_REACTIONS)[number];
export type WallPostKind = "post" | "poll";

export type WallComment = {
  commentId: string;
  authorName: string;
  body: string;
  createdAt: string | null;
  mine: boolean;
};

export type WallPollOption = {
  optionId: string;
  label: string;
  position: number;
  votes: number;
  selected: boolean;
};

export type WallPost = {
  postId: string;
  kind: WallPostKind;
  body: string;
  publishedAt: string | null;
  authorLabel: string;
  reactions: Record<string, number>;
  myReactions: WallReaction[];
  comments: WallComment[];
  pollOptions: WallPollOption[];
};

type RpcResult = { data: unknown; error: unknown };
type Rpc = (fn: string, args: Record<string, unknown>) => PromiseLike<RpcResult>;
const rpc = supabase.rpc.bind(supabase) as unknown as Rpc;

function mapPost(raw: Raw): WallPost {
  const reactionsRaw = obj(raw["reactions"]);
  const reactions: Record<string, number> = {};
  for (const reaction of WALL_REACTIONS) reactions[reaction] = num(reactionsRaw[reaction]);

  return {
    postId: req(raw["post_id"]),
    kind: raw["kind"] === "poll" ? "poll" : "post",
    body: req(raw["body"]),
    publishedAt: str(raw["published_at"]),
    authorLabel: req(raw["author_label"]) || "Organização",
    reactions,
    myReactions: Array.isArray(raw["my_reactions"])
      ? raw["my_reactions"].filter((value): value is WallReaction =>
          WALL_REACTIONS.includes(value as WallReaction),
        )
      : [],
    comments: arr(raw["comments"]).map((comment) => ({
      commentId: req(comment["comment_id"]),
      authorName: req(comment["author_name"]) || "Viajante",
      body: req(comment["body"]),
      createdAt: str(comment["created_at"]),
      mine: bool(comment["mine"]),
    })),
    pollOptions: arr(raw["poll_options"]).map((option) => ({
      optionId: req(option["option_id"]),
      label: req(option["label"]),
      position: num(option["position"]),
      votes: num(option["votes"]),
      selected: bool(option["selected"]),
    })),
  };
}

export const wallKeys = {
  scoped: (operationId: string) => ["operation-wall", operationId] as const,
};

export function useMyOperationWall(operationId: string) {
  return useQuery({
    queryKey: wallKeys.scoped(operationId),
    queryFn: async () => {
      const { data, error } = await rpc("get_my_operation_wall", { _operation_id: operationId });
      if (error) throw toPortalError(error);
      return arr(obj(data)["posts"]).map(mapPost);
    },
    staleTime: 15_000,
  });
}

async function command(fn: string, args: Record<string, unknown>) {
  const { data, error } = await rpc(fn, args);
  if (error) throw toPortalError(error);
  return data;
}

export function createWallPost(
  operationId: string,
  body: string,
  kind: WallPostKind,
  pollOptions: string[] = [],
) {
  return command("create_operation_wall_post", {
    _operation_id: operationId,
    _body: body,
    _kind: kind,
    _poll_options: pollOptions,
  });
}

export function addWallComment(postId: string, body: string) {
  return command("add_my_operation_wall_comment", { _post_id: postId, _body: body });
}

export function toggleWallReaction(postId: string, reaction: WallReaction) {
  return command("toggle_my_operation_wall_reaction", { _post_id: postId, _reaction: reaction });
}

export function voteWallPoll(optionId: string) {
  return command("vote_my_operation_wall_poll", { _option_id: optionId });
}
