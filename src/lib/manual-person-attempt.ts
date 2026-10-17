export type ManualPersonAttempt = { payload: string; key: string };
export type ManualPersonInput = { full_name: string; email: string; phone: string };

export function nextManualPersonAttempt(
  previous: ManualPersonAttempt | null,
  tenantId: string,
  input: ManualPersonInput,
  newKey: () => string,
): ManualPersonAttempt {
  const payload = JSON.stringify([
    tenantId,
    input.full_name.trim(),
    input.email.trim().toLowerCase(),
    input.phone.trim(),
  ]);
  return previous?.payload === payload ? previous : { payload, key: newKey() };
}
