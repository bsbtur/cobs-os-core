import { createFileRoute } from "@tanstack/react-router";

/**
 * COBS OS · M4 — anonymous liveness probe.
 *
 * Answers exactly one question: "are the three pilot-critical planes reachable?"
 * It deliberately exposes NO schema, NO counts, NO tenant data, NO topology,
 * NO environment variable values and NO internal error text.
 */

type PlaneState = "up" | "down";

async function probe(url: string, apikey: string): Promise<PlaneState> {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 4000);
    const response = await fetch(url, {
      method: "GET",
      headers: { apikey, Authorization: `Bearer ${apikey}` },
      signal: controller.signal,
    });
    clearTimeout(timer);
    // 4xx means the plane answered and enforced auth — that is "reachable".
    return response.status < 500 ? "up" : "down";
  } catch {
    return "down";
  }
}

export const Route = createFileRoute("/api/public/health")({
  server: {
    handlers: {
      GET: async () => {
        const url = process.env["SUPABASE_URL"];
        const key = process.env["SUPABASE_PUBLISHABLE_KEY"];

        const app: PlaneState = "up"; // this handler executing IS the frontend/SSR proof
        let auth: PlaneState = "down";
        let data_api: PlaneState = "down";

        if (url && key) {
          [auth, data_api] = await Promise.all([
            probe(`${url}/auth/v1/health`, key),
            // Any RLS-protected read path: a 401/200 both prove PostgREST + Postgres answered.
            probe(`${url}/rest/v1/tenants?select=id&limit=1`, key),
          ]);
        }

        const healthy = app === "up" && auth === "up" && data_api === "up";
        return new Response(
          JSON.stringify({
            status: healthy ? "ok" : "degraded",
            checks: { app, auth, data_api },
            timestamp: new Date().toISOString(),
          }),
          {
            status: healthy ? 200 : 503,
            headers: {
              "content-type": "application/json",
              "cache-control": "no-store",
            },
          },
        );
      },
    },
  },
});
