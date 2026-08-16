import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";

import type { Database } from "@/integrations/supabase/types";

type GeneratorResult = {
  tenant_id?: string;
  window_start?: string;
  window_end?: string;
  created?: number;
  skipped_duplicate?: number;
  skipped_ineligible?: number;
  promoted_important?: number;
};

function json(body: unknown, status = 200) {
  return Response.json(body, {
    status,
    headers: {
      "Cache-Control": "no-store",
    },
  });
}

function serverConfig() {
  const supabaseUrl = process.env["SUPABASE_URL"];
  const serviceRoleKey = process.env["SUPABASE_SERVICE_ROLE_KEY"];
  const cronSecret = process.env["CRON_SECRET"];

  return { supabaseUrl, serviceRoleKey, cronSecret };
}

async function runStaffAlertScheduler(request: Request) {
  const { supabaseUrl, serviceRoleKey, cronSecret } = serverConfig();

  if (!cronSecret) {
    console.error("[PX12.5-D] CRON_SECRET is not configured");
    return json({ ok: false, error: "scheduler_not_configured" }, 503);
  }

  if (request.headers.get("authorization") !== `Bearer ${cronSecret}`) {
    return json({ ok: false, error: "unauthorized" }, 401);
  }

  if (!supabaseUrl || !serviceRoleKey) {
    console.error("[PX12.5-D] Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
    return json({ ok: false, error: "supabase_scheduler_credentials_missing" }, 503);
  }

  const supabase = createClient<Database>(supabaseUrl, serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });

  const tenantQuery = await supabase.from("tenants").select("id").order("id");
  if (tenantQuery.error) {
    console.error("[PX12.5-D] Failed to list tenants", tenantQuery.error);
    return json({ ok: false, error: "tenant_lookup_failed" }, 500);
  }

  const windowEnd = new Date(Date.now() + 60_000);
  const windowStart = new Date(Date.now() - 5 * 60_000);
  const results: Array<{ tenantId: string; result?: GeneratorResult; error?: string }> = [];

  const generateDueAlerts = supabase.rpc as unknown as (
    fn: "generate_due_staff_journey_alerts",
    args: { _tenant_id: string; _window_start: string; _window_end: string },
  ) => PromiseLike<{ data: unknown; error: { message: string } | null }>;

  for (const tenant of tenantQuery.data ?? []) {
    const response = await generateDueAlerts("generate_due_staff_journey_alerts", {
      _tenant_id: tenant.id,
      _window_start: windowStart.toISOString(),
      _window_end: windowEnd.toISOString(),
    });

    if (response.error) {
      console.error(`[PX12.5-D] Alert generation failed for tenant ${tenant.id}`, response.error);
      results.push({ tenantId: tenant.id, error: response.error.message });
      continue;
    }

    const generated = (response.data ?? {}) as GeneratorResult;

    // PX12.5-E — reuse the canonical message_priority enum.
    // Product language: normal = Normal, important = Importante, urgent = Crítico.
    // Staff presentation/start reminders are important; shift-end reminders remain normal.
    const candidates = await supabase
      .from("messages")
      .select("id,priority,metadata")
      .eq("tenant_id", tenant.id)
      .eq("kind", "reminder")
      .gte("published_at", windowStart.toISOString())
      .lte("published_at", new Date().toISOString())
      .contains("metadata", { source: "px12_staff_journey_alert" });

    if (candidates.error) {
      console.error(`[PX12.5-E] Priority lookup failed for tenant ${tenant.id}`, candidates.error);
      results.push({ tenantId: tenant.id, error: candidates.error.message });
      continue;
    }

    const importantIds = (candidates.data ?? [])
      .filter((message) => {
        const metadata = (message.metadata ?? {}) as Record<string, unknown>;
        return (
          message.priority === "normal" &&
          (metadata["milestone"] === "report_at" || metadata["milestone"] === "starts_at")
        );
      })
      .map((message) => message.id);

    if (importantIds.length) {
      const promoted = await supabase
        .from("messages")
        .update({ priority: "important" })
        .eq("tenant_id", tenant.id)
        .in("id", importantIds);

      if (promoted.error) {
        console.error(
          `[PX12.5-E] Priority promotion failed for tenant ${tenant.id}`,
          promoted.error,
        );
        results.push({ tenantId: tenant.id, error: promoted.error.message });
        continue;
      }
    }

    results.push({
      tenantId: tenant.id,
      result: { ...generated, promoted_important: importantIds.length },
    });
  }

  const totals = results.reduce(
    (acc, item) => {
      if (item.error) acc.failedTenants += 1;
      acc.created += item.result?.created ?? 0;
      acc.skippedDuplicate += item.result?.skipped_duplicate ?? 0;
      acc.skippedIneligible += item.result?.skipped_ineligible ?? 0;
      acc.promotedImportant += item.result?.promoted_important ?? 0;
      return acc;
    },
    {
      created: 0,
      skippedDuplicate: 0,
      skippedIneligible: 0,
      promotedImportant: 0,
      failedTenants: 0,
    },
  );

  return json(
    {
      ok: totals.failedTenants === 0,
      executedAt: new Date().toISOString(),
      windowStart: windowStart.toISOString(),
      windowEnd: windowEnd.toISOString(),
      tenantCount: results.length,
      totals,
      results,
    },
    totals.failedTenants === 0 ? 200 : 207,
  );
}

export const Route = createFileRoute("/api/cron/staff-alerts")({
  server: {
    handlers: {
      GET: async ({ request }) => runStaffAlertScheduler(request),
      POST: async ({ request }) => runStaffAlertScheduler(request),
    },
  },
});
