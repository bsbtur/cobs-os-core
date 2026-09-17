import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const cors = {
  "access-control-allow-origin": "*",
  "access-control-allow-headers": "authorization, apikey, content-type, x-client-info",
  "access-control-allow-methods": "POST, OPTIONS",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      ...cors,
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
    },
  });

/**
 * PROD LIVE R$1 release gate.
 *
 * IMPORTANT: this function is intentionally execution-locked in this commit.
 * It cannot call Mercado Pago or create a charge/attempt. The lock must remain
 * until the isolated fixture, one-shot authorization and preflight invariants
 * are implemented and reviewed. See docs/release/prod-live-r1-payment-gate.md.
 */
Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  return json(
    {
      error: "live_r1_gate_locked",
      amount_minor: 100,
      currency: "BRL",
      environment: "production",
      provider: "mercado_pago",
      method: "pix",
      charge_execution_enabled: false,
    },
    423,
  );
});
