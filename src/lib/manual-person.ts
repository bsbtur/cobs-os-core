import { supabase } from "@/integrations/supabase/client";
import type { ManualPersonInput } from "@/lib/manual-person-attempt";

export const ENABLE_MANUAL_PERSON_RPC = false;

export type ManualPersonResult = {
  personId: string;
  unchanged: boolean;
};

export async function createManualPerson(
  tenantId: string,
  input: ManualPersonInput,
  idempotencyKey: string,
): Promise<ManualPersonResult> {
  const { data, error } = await supabase.rpc("create_person_manual", {
    _tenant_id: tenantId,
    _full_name: input.full_name,
    _email: input.email || null,
    _phone_e164: input.phone || null,
    _idempotency_key: idempotencyKey,
  });

  if (error) throw error;

  const payload = (data ?? {}) as Record<string, unknown>;
  const personId = typeof payload["person_id"] === "string" ? payload["person_id"] : null;
  if (!personId) throw new Error("manual_person_missing_person_id");

  return {
    personId,
    unchanged: payload["unchanged"] === true,
  };
}
