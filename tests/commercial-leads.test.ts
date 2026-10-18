import { readFileSync } from "node:fs";
import { describe, expect, test, mock } from "bun:test";
import {
  LEAD_STAGES,
  canManageLeadPipeline,
  filterLeads,
  leadMoveStages,
  leadQueryKey,
  leadStageTimestamp,
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
  test("uses updated_at as a display-only proxy for legacy synthetic stage timestamps", () => {
    const legacy = {
      ...lead,
      status_changed_at: "2026-10-17T21:00:00Z",
      updated_at: "2026-10-01T10:00:00Z",
    };
    expect(leadStageTimestamp(legacy)).toBe("2026-10-01T10:00:00Z");
    const current = {
      ...lead,
      status_changed_at: "2026-10-10T10:00:00Z",
      updated_at: "2026-10-17T21:00:00Z",
    };
    expect(leadStageTimestamp(current)).toBe("2026-10-10T10:00:00Z");
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
    "supabase/migrations/20261018002200_commercial_lead_pipeline_hardening_v1.sql",
    "utf8",
  );

  test("keeps approval and CRM read models semantically separate", () => {
    const board = readFileSync(
      "src/components/commercial/operation-leads-board.tsx",
      "utf8",
    );
    expect(hardening).toContain("list_operation_commercial_lead_pipeline");
    expect(hardening).toContain("and l.converted_person_id is null");
    expect(hardening).toContain("and l.status <> 'archived'");
    expect(board).toContain('supabase.rpc("list_operation_commercial_lead_pipeline"');
    expect(board).not.toContain('supabase.rpc("list_operation_commercial_leads"');
  });

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

  test("audits status and assignee changes through the canonical audit helper", () => {
    expect(hardening).toContain("app_private.record_audit_event");
    expect(hardening).toContain("commercial.lead_pipeline_updated");
    expect(hardening).toContain("'old_status', _old_status");
    expect(hardening).toContain("'new_status', _lead.status");
    expect(hardening).toContain("'old_assigned_profile_id', _old_assignee");
    expect(hardening).toContain("'new_assigned_profile_id', _lead.assigned_profile_id");
  });

  test("does not rewrite historical timestamps during hardening", () => {
    expect(hardening).not.toContain("update public.commercial_leads\nset status_changed_at");
  });
});


describe("PIRI public lead capture source", () => {
  const source = readFileSync(
    "supabase/functions/piri-public-lead-capture/index.ts",
    "utf8",
  );
  const config = readFileSync("supabase/config.toml", "utf8");

  test("is pinned to the PIRI operation and priority-list campaign", () => {
    expect(source).toContain('const OPERATION_ID = "0cf5d7fa-4d89-428a-9fec-0906ebc188d0"');
    expect(source).toContain('const CAMPAIGN = "piri-experience-2027"');
    expect(source).toContain('sales_mode: "priority_list"');
  });

  test("requires consent, idempotency and server-side rate limiting", () => {
    expect(source).toContain("contact_consent_required");
    expect(source).toContain("invalid_idempotency_key");
    expect(source).toContain("consume_public_endpoint_rate_limit");
    expect(source).toContain("30, 600");
    expect(source).toContain("5, 3600");
  });

  test("does not create orders or payments and keeps CORS allowlisted", () => {
    expect(source).toContain("creates_order: false");
    expect(source).toContain("creates_payment: false");
    expect(source).toContain("https://piri-premium-preview.lovable.app");
    expect(source).toContain("origin_not_allowed");
  });

  test("keeps JWT verification disabled explicitly for the public endpoint", () => {
    expect(config).toContain("[functions.piri-public-lead-capture]");
    expect(config).toMatch(/\[functions\.piri-public-lead-capture\][\s\S]*verify_jwt\s*=\s*false/);
  });
});
