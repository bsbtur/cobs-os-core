import { supabase } from "@/integrations/supabase/client";

export const operationParticipantSummaryKey = (operationId: string) => [
  "operation-participant-summary",
  operationId,
] as const;

export type OperationParticipantSummary = {
  operation_id: string;
  operation_status: string;
  travelers: {
    planned: number;
    confirmed: number;
    unconfirmed: number;
    present: number;
    boarded: number;
    no_show: number;
  };
  health: {
    status: "under_control" | "attention" | "critical";
    reason_code: string | null;
    reason_label: string | null;
  };
};

export async function fetchOperationParticipantSummary(
  operationId: string,
): Promise<OperationParticipantSummary> {
  const { data, error } = await supabase.rpc(
    "get_operation_participant_summary" as never,
    { _operation_id: operationId } as never,
  );

  if (error) throw error;
  if (!data || typeof data !== "object") {
    throw new Error("Operational participant summary returned no data");
  }

  return data as unknown as OperationParticipantSummary;
}
