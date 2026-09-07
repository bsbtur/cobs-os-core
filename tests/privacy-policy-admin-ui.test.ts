import { readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";

const route = readFileSync("src/routes/_authenticated/settings_.privacy.tsx", "utf8");
const settings = readFileSync("src/routes/_authenticated/settings.tsx", "utf8");
const runtimeTypes = readFileSync("src/integrations/supabase/runtime-rpc-types.ts", "utf8");
const readMigration = readFileSync(
  "supabase/migrations/20260907033500_privacy_policy_admin_read_v1.sql",
  "utf8",
);

describe("privacy policy admin UI", () => {
  test("uses only approved privacy RPCs with the pinned traveler policy key", () => {
    expect(route).toContain('supabase.rpc("register_privacy_policy_draft"');
    expect(route).toContain('supabase.rpc("get_privacy_policy_versions_for_admin"');
    expect(route).toContain('const CIOSP_TRAVELER_POLICY_KEY = "ciosp-2027-traveler-contract"');
    expect(route).toContain('_scope: "traveler_contract"');
    expect(runtimeTypes).toContain("register_privacy_policy_draft");
    expect(runtimeTypes).toContain("get_privacy_policy_versions_for_admin");
  });

  test("does not expose legal approval or activation actions", () => {
    expect(route).not.toContain("activate_privacy_policy");
    expect(route).not.toContain("legal_reviewed_at: new Date");
    expect(route).not.toContain("legal_review_reference:");
    expect(route).toContain("RASCUNHO — NÃO LIBERADO PARA CONTRATO");
    expect(route).toContain("não libera Clicksign");
  });

  test("keeps management access and governance navigation explicit", () => {
    expect(route).toContain("if (!canManage)");
    expect(route).toContain("Somente owner/admin");
    expect(settings).toContain('to="/settings/privacy"');
    expect(settings).toContain("Política de Privacidade Contratual");
    expect(readMigration).toContain("array['owner','admin']");
  });

  test("reads metadata only and excludes the frozen policy body", () => {
    expect(readMigration).toContain("get_privacy_policy_versions_for_admin");
    expect(readMigration).not.toContain("'content_snapshot', p.content_snapshot");
    expect(readMigration).not.toContain("update public.privacy_policy_versions");
    expect(readMigration).not.toContain("insert into public.privacy_policy_versions");
  });

  test("shows the server hash and never computes a browser hash", () => {
    expect(route).toContain("Hash SHA-256 retornado pelo servidor");
    expect(route).toContain("lastResult.content_hash");
    expect(route).not.toContain("crypto.subtle");
  });
});
