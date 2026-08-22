import { createFileRoute } from "@tanstack/react-router";

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
    return response.status < 500 ? "up" : "down";
  } catch {
    return "down";
  }
}

export const Route = createFileRoute("/api/public/health")({
  server: {
    handlers: {
      GET: async () => {
        const url = process.env["SUPABASE_URL"] ?? import.meta.env["VITE_SUPABASE_URL"];
        const key = process.env["SUPABASE_PUBLISHABLE_KEY"] ?? import.meta.env["VITE_SUPABASE_PUBLISHABLE_KEY"];

        const app: PlaneState = "up";
        let auth: PlaneState = "down";
        let data_api: PlaneState = "down";

        if (url && key) {
          [auth, data_api] = await Promise.all([
            probe(`${url}/auth/v1/health`, key),
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
