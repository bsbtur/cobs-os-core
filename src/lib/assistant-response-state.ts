export const ASSISTANT_RESPONSE_WAIT_MS = 10 * 60 * 1000;

type MessageStatus = { role: string; status: string; createdAt: string };

export type AssistantResponseState = "processing" | "delayed" | "failed" | null;

// A local wait limit is not a backend failure: late replies must still appear.
export function getAssistantResponseState(
  message: MessageStatus,
  now = Date.now(),
): AssistantResponseState {
  if (message.role !== "user") return null;
  if (message.status === "failed") return "failed";
  if (message.status !== "pending") return null;
  const createdAt = Date.parse(message.createdAt);
  if (!Number.isFinite(createdAt) || createdAt > now) return "delayed";
  return now - createdAt >= ASSISTANT_RESPONSE_WAIT_MS ? "delayed" : "processing";
}

export function getAssistantPollingInterval(messages: MessageStatus[], now = Date.now()): number {
  return messages.some((message) => getAssistantResponseState(message, now) === "processing")
    ? 2_000
    : 10_000;
}
