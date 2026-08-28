import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import {
  buildGoogleAuthorizationUrl,
  createOAuthState,
  getGoogleCalendarConfig,
} from "@/lib/google-calendar.server";

export const Route = createFileRoute("/api/google-calendar/connect")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const bearer = request.headers.get("authorization")?.match(/^Bearer (.+)$/)?.[1];
        const body = (await request.json().catch(() => null)) as { tenantId?: string } | null;
        if (!bearer || !body?.tenantId)
          return Response.json({ error: "unauthorized" }, { status: 401 });
        const url = process.env["SUPABASE_URL"] ?? import.meta.env["VITE_SUPABASE_URL"];
        const key =
          process.env["SUPABASE_PUBLISHABLE_KEY"] ??
          import.meta.env["VITE_SUPABASE_PUBLISHABLE_KEY"];
        const config = getGoogleCalendarConfig();
        if (!url || !key || !config)
          return Response.json({ error: "google_calendar_not_configured" }, { status: 503 });
        const supabase = createClient<Database>(url, key, {
          global: { headers: { Authorization: `Bearer ${bearer}` } },
          auth: { persistSession: false },
        });
        const { data: auth } = await supabase.auth.getUser(bearer);
        if (!auth.user) return Response.json({ error: "unauthorized" }, { status: 401 });
        const { data: membership } = await supabase
          .from("memberships")
          .select("id")
          .eq("tenant_id", body.tenantId)
          .eq("profile_id", auth.user.id)
          .eq("status", "active")
          .maybeSingle();
        if (!membership) return Response.json({ error: "forbidden" }, { status: 403 });
        const state = createOAuthState(
          { userId: auth.user.id, tenantId: body.tenantId },
          config.stateSecret,
        );
        return Response.json({ authorizationUrl: buildGoogleAuthorizationUrl(config, state) });
      },
    },
  },
});
