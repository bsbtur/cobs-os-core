import { supabase } from "@/integrations/supabase/client";

export type PersonPatch = Partial<{
  full_name: string;
  email: string | null;
  phone_e164: string | null;
  preferred_locale: string | null;
  notes: string | null;
}>;

export type UpdatedPerson = {
  person_id: string;
  tenant_id: string;
  profile_id: string | null;
  full_name: string;
  email: string | null;
  phone_e164: string | null;
  preferred_locale: string | null;
  notes: string | null;
  updated_at: string;
  /** Editing a Person never mutates the linked auth account/login. */
  login_identity_unchanged: true;
};

export const personKey = (personId: string) => ["person", personId] as const;

export async function updatePerson(
  personId: string,
  changes: PersonPatch,
): Promise<UpdatedPerson> {
  if (!personId) throw new Error("Pessoa inválida.");
  if (!changes || Object.keys(changes).length === 0) {
    throw new Error("Nenhuma alteração para salvar.");
  }

  const { data, error } = await supabase.rpc(
    "update_person" as never,
    { _person_id: personId, _changes: changes } as never,
  );

  if (error) {
    const message = error.message ?? "Não foi possível atualizar a pessoa.";
    if (message.includes("Only owners and admins")) {
      throw new Error("Somente administradores podem editar os dados da pessoa.");
    }
    if (message.includes("Invalid email")) {
      throw new Error("Informe um e-mail válido ou deixe o campo vazio.");
    }
    if (message.includes("Phone must use E.164")) {
      throw new Error("Informe o telefone com código do país, por exemplo +5561999999999.");
    }
    if (message.includes("Full name is required")) {
      throw new Error("O nome da pessoa é obrigatório.");
    }
    throw new Error(message);
  }

  if (!data || typeof data !== "object") {
    throw new Error("A atualização não retornou os dados da pessoa.");
  }

  return data as unknown as UpdatedPerson;
}
