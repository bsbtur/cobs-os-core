import { supabase } from "@/integrations/supabase/client";

export const operationParticipantActionStateKey = (
  operationId: string,
  personId: string,
) => ["operation-participant-action-state", operationId, personId] as const;

export type ParticipantActionState = {
  operation_id: string;
  operation_status: string;
  person_id: string;
  participation_id: string;
  participation_status: "expected" | "confirmed" | "cancelled";
  can_confirm: boolean;
  can_cancel: boolean;
  can_reactivate: boolean;
  participation_block_code: string | null;
  participation_block_label: string | null;
  portal: {
    grant_id: string | null;
    grant_status: "active" | "revoked" | null;
    effective_access: boolean;
    invitation_id: string | null;
    invitation_expires_at: string | null;
    has_open_invitation: boolean;
    can_invite: boolean;
    can_copy_invitation_link: boolean;
    can_revoke_invitation: boolean;
    can_revoke_access: boolean;
    can_reinstate_access: boolean;
    block_code: string | null;
    block_label: string | null;
  };
};

export async function fetchOperationParticipantActionState(
  operationId: string,
  personId: string,
): Promise<ParticipantActionState> {
  const { data, error } = await supabase.rpc(
    "get_operation_participant_action_state" as never,
    { _operation_id: operationId, _person_id: personId } as never,
  );
  if (error) throw error;
  if (!data || typeof data !== "object") {
    throw new Error("Não foi possível carregar as ações desta pessoa.");
  }
  return data as unknown as ParticipantActionState;
}

export function participantActionErrorMessage(error: unknown) {
  const message =
    typeof error === "object" && error && "message" in error
      ? String((error as { message?: unknown }).message ?? "")
      : String(error ?? "");

  if (message.includes("operation is terminal"))
    return "A operação já foi encerrada. Os participantes agora são somente históricos.";
  if (message.includes("reason is required to cancel"))
    return "Informe o motivo do cancelamento da participação.";
  if (message.includes("already has active portal access"))
    return "Esta pessoa já possui acesso ativo ao portal do viajante.";
  if (message.includes("cancelled participation"))
    return "Reative a participação antes de liberar acesso ao portal.";
  if (message.includes("terminal operation"))
    return "Não é possível emitir convite para uma operação encerrada.";
  if (message.includes("reinstated for a cancelled operation"))
    return "Não é possível reativar o acesso de uma operação cancelada.";

  return "Não foi possível concluir esta ação. Atualize a tela e tente novamente.";
}
