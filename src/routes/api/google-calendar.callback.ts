import { createFileRoute } from "@tanstack/react-router";
import {
  encryptGoogleToken,
  exchangeAuthorizationCode,
  fetchGoogleIdentity,
  getGoogleCalendarConfig,
  verifyOAuthState,
} from "@/lib/google-calendar.server";

function describeCallbackError(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  if (error && typeof error === "object") {
    const candidate = error as {
      message?: unknown;
      code?: unknown;
      details?: unknown;
      hint?: unknown;
    };
    return JSON.stringify({
      message: candidate.message ?? null,
      code: candidate.code ?? null,
      details: candidate.details ?? null,
      hint: candidate.hint ?? null,
    });
  }
  return "unknown";
}

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
          const { error } = await supabaseAdmin.rpc(
            "persist_google_calendar_connection" as never,
            {
              _tenant_id: state.tenantId,
              _profile_id: state.userId,
              _google_calendar_id: calendar.id,
              _google_calendar_label: calendar.summary ?? null,
              _google_timezone: calendar.timeZone ?? null,
              _access_token: encryptGoogleToken(tokens.access_token, config.tokenSecret),
              _refresh_token: tokens.refresh_token
                ? encryptGoogleToken(tokens.refresh_token, config.tokenSecret)
                : null,
              _access_token_expires_at: new Date(
                Date.now() + tokens.expires_in * 1000,
              ).toISOString(),
              _granted_scopes: tokens.scope?.split(" ") ?? [],
            } as never,
          );
          if (error) throw error;
          return Response.redirect(new URL("/settings?calendar=connected", request.url), 303);
        } catch (error) {
          console.error("[Google Calendar] callback failed", describeCallbackError(error));
          return Response.redirect(new URL("/settings?calendar=error", request.url), 303);
        }
      },
    },
  },
});
