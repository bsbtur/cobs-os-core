import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SECRET_KEYS = JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS") ?? "{}");
const secretKey = SUPABASE_SECRET_KEYS.default;
const OPERATION_CODE = "TEAM-SEFFRIN-BSB-20270416";

const cors = { ...corsHeaders, "access-control-allow-methods": "GET, OPTIONS" };
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      ...cors,
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store, max-age=0",
    },
  });

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
  if (req.method !== "GET") return json({ error: "method_not_allowed" }, 405);
  if (!SUPABASE_URL || !secretKey) return json({ error: "server_not_configured" }, 500);

  const admin = createClient(SUPABASE_URL, secretKey, { auth: { persistSession: false } });

  const { data: op, error: opError } = await admin
    .from("operations")
    .select("id,tenant_id")
    .eq("code", OPERATION_CODE)
    .is("archived_at", null)
    .maybeSingle();

  if (opError) return json({ error: "operation_lookup_failed" }, 500);
  if (!op) return json({ error: "operation_not_found" }, 404);

  const { data: property, error: propertyError } = await admin
    .from("hospitality_properties")
    .select("id")
    .eq("tenant_id", op.tenant_id)
    .eq("name", "Woodstock Guesthouse")
    .maybeSingle();

  if (propertyError) return json({ error: "property_lookup_failed" }, 500);

  const { data: stay, error: stayError } = property?.id
    ? await admin
        .from("hospitality_stays")
        .select("id,status")
        .eq("operation_id", op.id)
        .eq("tenant_id", op.tenant_id)
        .eq("property_id", property.id)
        .neq("status", "cancelled")
        .maybeSingle()
    : { data: null, error: null };

  if (stayError) return json({ error: "stay_lookup_failed" }, 500);
  if (!stay) {
    return json({
      availability_status: "unconfigured",
      sold_out: false,
      capacity: null,
      occupied: null,
      remaining: null,
    });
  }

  const [rooms, guests] = await Promise.all([
    admin
      .from("hospitality_rooms")
      .select("capacity,room_status")
      .eq("stay_id", stay.id)
      .eq("tenant_id", op.tenant_id),
    admin
      .from("hospitality_stay_participations")
      .select("id", { count: "exact", head: true })
      .eq("stay_id", stay.id)
      .eq("tenant_id", op.tenant_id)
      .eq("is_active", true),
  ]);

  if (rooms.error) return json({ error: "room_lookup_failed" }, 500);
  if (guests.error) return json({ error: "guest_count_failed" }, 500);

  const capacity = (rooms.data ?? [])
    .filter((room) => room.room_status !== "blocked")
    .reduce((sum, room) => sum + Number(room.capacity || 0), 0);
  const occupied = guests.count ?? 0;
  const remaining = Math.max(0, capacity - occupied);
  const soldOut = capacity > 0 && occupied >= capacity;

  return json({
    availability_status: capacity > 0 ? (soldOut ? "sold_out" : "available") : "unconfigured",
    sold_out: soldOut,
    capacity,
    occupied,
    remaining,
  });
});
