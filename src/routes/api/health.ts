import { createFileRoute } from "@tanstack/react-router";

type ProbeStatus = "up" | "down";

type HealthPayload = {
  status: "ok" | "degraded";
  app: ProbeStatus;
  auth: ProbeStatus;
  data_api: ProbeStatus;
  checked_at: string;
};

function supabaseRuntimeConfig() {
  const url = process.env["SUPABASE_URL"] ?? import.meta.env["VITE_SUPABASE_URL"];
  const key =
    process.env["SUPABASE_PUBLISHABLE_KEY"] ?? import.meta.env["VITE_SUPABASE_PUBLISHABLE_KEY"];
  return url && key ? { url, key } : null;
}

export const Route = createFileRoute("/api/health")({
  server: {
    handlers: {
      GET: async () => {
        let auth: ProbeStatus = "down";
        let dataApi: ProbeStatus = "down";

        try {
          const config = supabaseRuntimeConfig();
          if (config) {
            const headers = { apikey: config.key };
            const [authResponse, dataResponse] = await Promise.all([
              fetch(`${config.url}/auth/v1/settings`, { headers, cache: "no-store" }),
              fetch(`${config.url}/rest/v1/tenants?select=id&limit=1`, {
                headers,
                cache: "no-store",
              }),
            ]);

            auth = authResponse.ok ? "up" : "down";
            // A 401/403 still proves the Data API is reachable and enforcing access.
            dataApi = dataResponse.status > 0 && dataResponse.status < 500 ? "up" : "down";
          }
        } catch {
          auth = "down";
          dataApi = "down";
        }

        const payload: HealthPayload = {
          status: auth === "up" && dataApi === "up" ? "ok" : "degraded",
          app: "up",
          auth,
          data_api: dataApi,
          checked_at: new Date().toISOString(),
        };

        return Response.json(payload, {
          status: payload.status === "ok" ? 200 : 503,
          headers: {
            "cache-control": "no-store",
          },
        });
      },
    },
  },
});
