export type HumanExperienceEvent =
  | "operation.started"
  | "checklist.completed"
  | "stage.completed"
  | "alert.raised";

export type HumanExperiencePayload = Record<string, unknown>;

export type HumanExperienceEventRecord = {
  event: HumanExperienceEvent;
  at: string;
  payload: HumanExperiencePayload;
};

/**
 * Prototype-only orchestration adapter.
 *
 * Today this emits to the browser console and returns a structured event for
 * the local debug panel. In production, n8n should be invoked server-side
 * (API route / Edge Function) so secret webhook URLs are never exposed in the
 * browser bundle.
 */
export async function emitHumanExperienceEvent(
  event: HumanExperienceEvent,
  payload: HumanExperiencePayload = {},
): Promise<HumanExperienceEventRecord> {
  const record = { event, at: new Date().toISOString(), payload } satisfies HumanExperienceEventRecord;
  console.info("[COBS Human Experience Lab] orchestration event", record);
  await Promise.resolve();
  return record;
}
