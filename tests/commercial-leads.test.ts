import { readFileSync } from "node:fs";
import { describe, expect, test, mock } from "bun:test";
import {
  LEAD_STAGES,
  canManageLeadPipeline,
  filterLeads,
  leadMoveStages,
  leadQueryKey,
  leadStatusLabel,
  updateLeadPipeline,
  whatsappUrl,
  type CommercialLead,
  type PipelineArgs,
} from "../src/lib/commercial-leads";

const lead: CommercialLead = {
  id: "lead-a",
  full_name: "Ana Ávila",
  email: "ana@example.test",
  phone: "+55 (61) 99999-1234",
  status: "new",
  source: "landing",
  campaign: "ciosp",
  metadata: { city: "Brasília", party_size: 2 },
  converted_person_id: null,
  assigned_profile_id: null,
  assigned_profile_name: null,
  assigned_at: null,
  status_changed_at: "2026-10-17T20:00:00Z",
  created_at: "2026-10-17T20:00:00Z",
  updated_at: "2026-10-17T20:00:00Z",
};
const filters = { search: "", assignee: "all", origin: "all" };
const result = {
  id: lead.id,
  status: "new",
  assigned_profile_id: null,
  assigned_profile_name: null,
  assigned_at: null,
  status_changed_at: lead.status_changed_at,
  updated_at: lead.updated_at,
};

describe("commercial lead pipeline", () => {
  test("maps exactly the five canonical states", () => {
    expect(LEAD_STAGES.map(({ value, label }) => [value, label])).toEqual([
      ["new", "Novo"],
      ["contacted", "Contatado"],
      ["qualified", "Qualificado"],
      ["converted", "Convertido"],
      ["lost", "Perdido"],
    ]);
    expect(leadStatusLabel("qualified")).toBe("Qualificado");
  });
  test("restricts the pipeline to owner/admin", () => {
    expect(
      ["owner", "admin", "operations_agent", "member", null].map(canManageLeadPipeline),
    ).toEqual([true, true, false, false, false]);
  });
  test("searches name, normalized phone and email", () => {
    for (const search of ["avila", "61999991234", "ana@example"])
      expect(filterLeads([lead], { ...filters, search })).toEqual([lead]);
    expect(filterLeads([lead], { ...filters, search: "Bruno" })).toEqual([]);
  });
  test("combines assignee and source/campaign filters", () => {
    const assigned = { ...lead, assigned_profile_id: "owner-a" };
    expect(
      filterLeads([lead, assigned], {
        ...filters,
        assignee: "owner-a",
        origin: '["landing","ciosp"]',
      }),
    ).toEqual([assigned]);
    expect(filterLeads([lead], { ...filters, origin: '["landing","other"]' })).toEqual([]);
  });
  test("keeps lost and converted while excluding archived", () => {
    expect(
      filterLeads(
        [
          lead,
          { ...lead, status: "lost" },
          { ...lead, status: "converted" },
          { ...lead, status: "archived" },
        ],
        filters,
      ).map((row) => row.status),
    ).toEqual(["new", "lost", "converted"]);
  });
  test("separates operation and tenant cache keys", () => {
    expect(leadQueryKey("tenant-a", "owner-a", "operation-a")).not.toEqual(
      leadQueryKey("tenant-a", "owner-a", "operation-b"),
    );
    expect(leadQueryKey("tenant-a", "owner-a", "operation-a")).not.toEqual(
      leadQueryKey("tenant-b", "owner-a", "operation-a"),
    );
  });
  test("normalizes WhatsApp without inventing a country code", () => {
    expect(whatsappUrl(lead.phone)).toBe("https://wa.me/5561999991234");
    expect(whatsappUrl("123")).toBeNull();
  });
  test("keeps converted visible but out of the manual move options", () => {
    expect(leadMoveStages(lead).map((stage) => stage.value)).toEqual([
      "new",
      "contacted",
      "qualified",
      "lost",
    ]);
    const converted = { ...lead, status: "converted", converted_person_id: "person-a" };
    expect(leadMoveStages(converted).map((stage) => stage.value)).toEqual(["converted"]);
  });
  test("rejects manual converted status before calling the pipeline RPC", async () => {
    const rpc = mock(async (_name: string, _args: PipelineArgs) => ({
      data: [result],
      error: null,
    }));
    await expect(updateLeadPipeline(rpc, lead.id, { status: "converted" })).rejects.toThrow(
      "canonical Person conversion",
    );
    expect(rpc).toHaveBeenCalledTimes(0);
  });
  test("assignment calls only the pipeline RPC", async () => {
    const rpc = mock(async (_name: string, _args: PipelineArgs) => ({
      data: [result],
      error: null,
    }));
    await updateLeadPipeline(rpc, lead.id, { assignee: "owner-a" });
    expect(rpc.mock.calls).toEqual([
      ["update_commercial_lead_pipeline", { _lead_id: "lead-a", _assigned_profile_id: "owner-a" }],
    ]);
  });
  test("clearing assignment uses the explicit clear flag", async () => {
    const rpc = mock(async (_name: string, _args: PipelineArgs) => ({
      data: [result],
      error: null,
    }));
    await updateLeadPipeline(rpc, lead.id, { assignee: null });
    expect(rpc.mock.calls).toEqual([
      ["update_commercial_lead_pipeline", { _lead_id: "lead-a", _clear_assignee: true }],
    ]);
  });
  test("propagates RPC failure rather than reporting success", async () => {
    const rpc = mock(async () => ({ data: null, error: new Error("denied") }));
    await expect(updateLeadPipeline(rpc, lead.id, { status: "lost" })).rejects.toThrow("denied");
    expect(rpc).toHaveBeenCalledTimes(1);
  });
});

describe("commercial lead migration hardening", () => {
  const hardening = readFileSync(
    "supabase/migrations/20261018001000_commercial_lead_pipeline_hardening_v1.sql",
    "utf8",
  );

  test("removes direct authenticated writes and narrows PII reads to managers", () => {
    expect(hardening).toContain(
      "revoke update on table public.commercial_leads from authenticated",
    );
    expect(hardening).toContain(
      "drop policy if exists commercial_leads_staff_update on public.commercial_leads",
    );
    expect(hardening).toContain("create policy commercial_leads_manager_select");
    expect(hardening).toContain("and m.role in ('owner','admin')");
    expect(hardening).toContain("m.profile_id = (select auth.uid())");
  });

  test("preserves canonical conversion and archived invariants", () => {
    expect(hardening).toContain("Converted status requires canonical Person conversion");
    expect(hardening).toContain("Converted lead status is managed by canonical Person conversion");
    expect(hardening).toContain("Archived lead is read-only");
  });

  test("repairs only synthetic stage timestamps created by the first migration", () => {
    expect(hardening).toContain("where status_changed_at > updated_at");
  });
});
