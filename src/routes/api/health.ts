import { createFileRoute } from "@tanstack/react-router";

type ProbeStatus = "up" | "down";

type HealthPayload = {
  status: "ok" | "degraded";
  app: ProbeStatus;
  auth: ProbeStatus;
  data_api: ProbeStatus;
  checked_at: string;
};

export const Route = createFileRoute("/api/health")({
  server: {
    handlers: {
      GET: async () => {
        let auth: ProbeStatus = "down";
        let dataApi: ProbeStatus = "down";

        try {
          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

          const [{ error: authError }, { error: dataError }] = await Promise.all([
            supabaseAdmin.auth.admin.listUsers({ page: 1, perPage: 1 }),
            supabaseAdmin.from("tenants").select("id").limit(1),
          ]);

          auth = authError ? "down" : "up";
          dataApi = dataError ? "down" : "up";
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
