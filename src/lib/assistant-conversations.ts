import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { supabase } from "@/integrations/supabase/client";
import { toPortalError } from "@/lib/w10";

type Raw = Record<string, unknown>;
const obj = (value: unknown): Raw => (value && typeof value === "object" ? (value as Raw) : {});
const req = (value: unknown): string => (typeof value === "string" ? value : "");
const str = (value: unknown): string | null => (typeof value === "string" ? value : null);

export type AssistantConversation = {
  conversationId: string;
  operationId: string;
  status: string;
  title: string | null;
  createdAt: string;
  updatedAt: string;
};

export type AssistantConversationMessage = {
  messageId: string;
  conversationId: string;
  role: "user" | "assistant" | "human" | "system";
  status: string;
  content: string;
  createdAt: string;
};

export const assistantKeys = {
  all: ["assistant-conversations"] as const,
  operation: (operationId: string) => ["assistant-conversations", operationId] as const,
  messages: (conversationId: string) => ["assistant-conversations", "messages", conversationId] as const,
};

function mapConversation(value: unknown): AssistantConversation {
  const raw = obj(value);
  return {
    conversationId: req(raw["id"] ?? raw["conversation_id"]),
    operationId: req(raw["operation_id"]),
    status: req(raw["status"]),
    title: str(raw["title"]),
    createdAt: req(raw["created_at"]),
    updatedAt: req(raw["updated_at"]),
  };
}

function mapMessage(value: unknown): AssistantConversationMessage {
  const raw = obj(value);
  const role = req(raw["role"]);
  return {
    messageId: req(raw["id"] ?? raw["message_id"]),
    conversationId: req(raw["conversation_id"]),
    role: role === "assistant" || role === "human" || role === "system" ? role : "user",
    status: req(raw["status"]),
    content: req(raw["content"]),
    createdAt: req(raw["created_at"]),
  };
}

async function getOrCreateConversation(operationId: string): Promise<AssistantConversation> {
  const existing = await supabase
    .from("assistant_conversations")
    .select("id,operation_id,status,title,created_at,updated_at")
    .eq("operation_id", operationId)
    .eq("status", "active")
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (existing.error) throw toPortalError(existing.error);
  if (existing.data) return mapConversation(existing.data);

  const created = await supabase.rpc("assistant_create_conversation", { _operation_id: operationId });
  if (created.error) throw toPortalError(created.error);

  const createdRaw = obj(created.data);
  const conversationId = req(createdRaw["conversation_id"] ?? created.data);
  if (!conversationId) throw toPortalError(new Error("Assistant conversation unavailable"));

  const loaded = await supabase
    .from("assistant_conversations")
    .select("id,operation_id,status,title,created_at,updated_at")
    .eq("id", conversationId)
    .single();
  if (loaded.error) throw toPortalError(loaded.error);
  return mapConversation(loaded.data);
}

async function getMessages(conversationId: string): Promise<AssistantConversationMessage[]> {
  const { data, error } = await supabase
    .from("assistant_conversation_messages")
    .select("id,conversation_id,role,status,content,created_at")
    .eq("conversation_id", conversationId)
    .order("created_at", { ascending: true });
  if (error) throw toPortalError(error);
  return (data ?? []).map(mapMessage);
}

export function useAssistantConversation(operationId: string) {
  return useQuery({
    queryKey: assistantKeys.operation(operationId),
    queryFn: () => getOrCreateConversation(operationId),
    enabled: Boolean(operationId),
    staleTime: 30_000,
  });
}

export function useAssistantMessages(conversationId: string | undefined) {
  return useQuery({
    queryKey: assistantKeys.messages(conversationId ?? ""),
    queryFn: () => getMessages(conversationId!),
    enabled: Boolean(conversationId),
    refetchInterval: (query) => {
      const messages = query.state.data ?? [];
      const waiting = messages.some((message) => message.role === "user" && message.status === "pending");
      return waiting ? 2_000 : 10_000;
    },
  });
}

export function useSubmitAssistantMessage(operationId: string, conversationId: string | undefined) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (content: string) => {
      if (!conversationId) throw new Error("Conversation unavailable");
      const { data, error } = await supabase.rpc("assistant_submit_message", {
        _conversation_id: conversationId,
        _content: content,
      });
      if (error) throw toPortalError(error);
      return data;
    },
    onSuccess: async () => {
      if (conversationId) {
        await queryClient.invalidateQueries({ queryKey: assistantKeys.messages(conversationId) });
      }
      await queryClient.invalidateQueries({ queryKey: assistantKeys.operation(operationId) });
    },
  });
}
