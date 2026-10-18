import { readFileSync } from "node:fs";
import { describe, expect, test } from "bun:test";

const peopleRoute = readFileSync(
  "src/routes/_authenticated/operations.$operationId.people.tsx",
  "utf8",
);
const migration = readFileSync(
  "supabase/migrations/20261018011158_people_commercial_lead_approval_read_model_v1.sql",
  "utf8",
);

function section(source: string, start: string, end: string) {
  const from = source.indexOf(start);
  const to = source.indexOf(end, from + start.length);
  if (from < 0 || to < 0) throw new Error(`section not found: ${start}`);
  return source.slice(from, to);
}

describe("People commercial lead approval read model", () => {
  const genericPanel = section(
    peopleRoute,
    "function GenericLeadApprovalPanel",
    "function CommercialLeadApprovalQueue",
  );

  test("GenericLeadApprovalPanel uses the governed approval RPC", () => {
    expect(genericPanel).toContain('supabase.rpc("list_operation_commercial_leads"');
    expect(genericPanel).not.toContain('.from("commercial_leads")');
    expect(genericPanel).toContain('queryKey: ["commercial-leads-operation", operationId]');
  });

  test("People no longer presents converted leads as funnel history", () => {
    expect(genericPanel).not.toContain(
      "Leads convertidos permanecem visíveis aqui como evidência do funil comercial.",
    );
  });

  test("approval read model returns only approvable commercial states", () => {
    expect(migration).toContain("and l.converted_person_id is null");
    expect(migration).toContain("and l.status in ('new','contacted','qualified')");
    expect(migration).not.toContain("and l.status <> 'archived'");
  });

  test("approval read model remains manager-only", () => {
    expect(migration).toContain("and m.role in ('owner','admin')");
    expect(migration).toContain("Manager access required");
    expect(migration).toContain(
      "revoke all on function public.list_operation_commercial_leads(uuid)",
    );
    expect(migration).toContain(
      "grant execute on function public.list_operation_commercial_leads(uuid)",
    );
  });
});
