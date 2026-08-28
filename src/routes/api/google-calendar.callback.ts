import { createFileRoute } from "@tanstack/react-router";
import {
  encryptGoogleToken,
  exchangeAuthorizationCode,
  fetchGoogleIdentity,
  getGoogleCalendarConfig,
  verifyOAuthState,
} from "@/lib/google-calendar.server";

export const Route = createFileRoute("/api/google-calendar/callback")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const requestUrl = new URL(request.url);
        const code = requestUrl.searchParams.get("code");
        const rawState = requestUrl.searchParams.get("state");
        const config = getGoogleCalendarConfig();
        if (!code || !rawState || !config)
          return new Response("Invalid OAuth callback", { status: 400 });
        const state = verifyOAuthState(rawState, config.stateSecret);
        if (!state) return new Response("Invalid or expired OAuth state", { status: 400 });
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { data: membership } = await supabaseAdmin
          .from("memberships")
          .select("id")
          .eq("tenant_id", state.tenantId)
          .eq("profile_id", state.userId)
          .eq("status", "active")
          .maybeSingle();
        if (!membership) return new Response("Membership not found", { status: 403 });
        try {
          const tokens = await exchangeAuthorizationCode(config, code);
          const calendar = await fetchGoogleIdentity(tokens.access_token);
          const row = {
            tenant_id: state.tenantId,
            profile_id: state.userId,
            google_calendar_id: calendar.id,
            google_calendar_label: calendar.summary ?? null,
            google_timezone: calendar.timeZone ?? null,
            access_token: encryptGoogleToken(tokens.access_token, config.tokenSecret),
            ...(tokens.refresh_token
              ? { refresh_token: encryptGoogleToken(tokens.refresh_token, config.tokenSecret) }
              : {}),
            access_token_expires_at: new Date(Date.now() + tokens.expires_in * 1000).toISOString(),
            granted_scopes: tokens.scope?.split(" ") ?? [],
            revoked_at: null,
            updated_at: new Date().toISOString(),
          };
          // app_private is deliberately absent from the browser-facing generated Database type.
          const { error } = await supabaseAdmin
            .schema("app_private" as never)
            .from("google_calendar_connections" as never)
            .upsert(row as never, { onConflict: "tenant_id,profile_id" });
          if (error) throw error;
          return Response.redirect(new URL("/settings?calendar=connected", request.url), 303);
        } catch (error) {
          console.error(
            "[Google Calendar] callback failed",
            error instanceof Error ? error.message : "unknown",
          );
          return Response.redirect(new URL("/settings?calendar=error", request.url), 303);
        }
      },
    },
  },
});
