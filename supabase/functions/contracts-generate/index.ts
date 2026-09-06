import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const PUB = JSON.parse(Deno.env.get("SUPABASE_PUBLISHABLE_KEYS") ?? "{}").default;
const SEC = JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS") ?? "{}").default;
const cors = {
  "access-control-allow-origin": "*",
  "access-control-allow-headers": "authorization, apikey, content-type, x-client-info",
  "access-control-allow-methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "content-type": "application/json; charset=utf-8" },
  });

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  try {
    if (!PUB || !SEC) return json({ error: "supabase_keys_not_available" }, 500);
    const auth = req.headers.get("authorization");
    if (!auth) return json({ error: "authorization_required" }, 401);

    const userClient = createClient(SUPABASE_URL, PUB, {
      global: { headers: { Authorization: auth } },
      auth: { persistSession: false },
    });
    const { data: userData, error: userError } = await userClient.auth.getUser();
    if (userError || !userData.user) return json({ error: "invalid_session" }, 401);

    let input: { order_id?: string; template_key?: string };
    try {
      input = await req.json();
    } catch {
      return json({ error: "invalid_json" }, 400);
    }
    const orderId = input.order_id?.trim();
    const templateKey = input.template_key?.trim();
    if (!orderId) return json({ error: "order_id_required" }, 400);
    if (!templateKey) return json({ error: "template_key_required" }, 400);

    const admin = createClient(SUPABASE_URL, SEC, { auth: { persistSession: false } });
    const { data: order, error: orderError } = await admin
      .from("orders")
      .select("id,tenant_id,operation_id,buyer_person_id,buyer_name_snapshot,currency,status,reference_label,grand_total_minor,metadata,created_at")
      .eq("id", orderId)
      .maybeSingle();
    if (orderError) return json({ error: "order_lookup_failed" }, 500);
    if (!order) return json({ error: "order_not_found" }, 404);
    if (!order.operation_id) return json({ error: "order_operation_required" }, 409);
    if (!["submitted", "confirmed"].includes(order.status))
      return json({ error: "order_not_contractable", status: order.status }, 409);
    if (order.grand_total_minor == null) return json({ error: "order_total_required" }, 409);

    const { data: membership } = await admin
      .from("memberships")
      .select("role")
      .eq("tenant_id", order.tenant_id)
      .eq("profile_id", userData.user.id)
      .eq("status", "active")
      .maybeSingle();
    if (!membership || !["owner", "admin", "operations_agent"].includes(membership.role))
      return json({ error: "forbidden" }, 403);

    const [{ data: person, error: personError }, { data: party, error: partyError }, { data: operation, error: operationError }, { data: items, error: itemsError }, { data: reservation, error: reservationError }, { data: template, error: templateError }] = await Promise.all([
      admin.from("people").select("id,full_name,email,phone_e164,country_code,preferred_locale").eq("id", order.buyer_person_id).eq("tenant_id", order.tenant_id).maybeSingle(),
      admin.from("contract_party_profiles").select("document_type,document_number,address_line1,address_line2,district,city,state_region,postal_code,country_code").eq("person_id", order.buyer_person_id).eq("tenant_id", order.tenant_id).maybeSingle(),
      admin.from("operations").select("id,name,code,primary_country,primary_region,primary_city,timezone,planned_start,planned_end,source_experience_name,source_offering_name").eq("id", order.operation_id).eq("tenant_id", order.tenant_id).maybeSingle(),
      admin.from("order_items").select("id,sellable_kind,sellable_name_snapshot,description_snapshot,price_basis,currency,unit_amount_minor,quantity,discount_minor,line_subtotal_minor,line_total_minor").eq("order_id", order.id).eq("tenant_id", order.tenant_id).order("created_at", { ascending: true }),
      admin.from("commercial_reservations").select("id,status,quantity,offering_id").eq("order_id", order.id).eq("tenant_id", order.tenant_id).in("status", ["reserved", "confirmed"]).order("created_at", { ascending: true }).limit(1).maybeSingle(),
      admin.from("contract_templates").select("id,template_key,version,name,locale,status,provider,provider_template_id,variable_schema,metadata,legal_reviewed_at").eq("tenant_id", order.tenant_id).eq("template_key", templateKey).eq("status", "active").maybeSingle(),
    ]);

    if (personError || partyError || operationError || itemsError || reservationError || templateError)
      return json({ error: "contract_source_lookup_failed" }, 500);
    if (!person) return json({ error: "customer_not_found" }, 409);
    if (!party) return json({ error: "contract_party_profile_required" }, 409);
    if (!operation) return json({ error: "operation_not_found" }, 409);
    if (!items?.length) return json({ error: "order_items_required" }, 409);
    if (!template) return json({ error: "active_template_not_found" }, 409);
    if (!template.legal_reviewed_at) return json({ error: "template_not_ready" }, 409);

    const { data: existing, error: existingError } = await admin
      .from("customer_contracts")
      .select("id,status,template_key,template_version")
      .eq("tenant_id", order.tenant_id)
      .eq("order_id", order.id)
      .eq("template_key", template.template_key)
      .eq("template_version", template.version)
      .in("status", ["draft", "sent", "viewed", "signed"])
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (existingError) return json({ error: "existing_contract_lookup_failed" }, 500);
    if (existing)
      return json({ ok: true, idempotent: true, contract_id: existing.id, status: existing.status, template_key: existing.template_key, template_version: existing.template_version });

    const generatedAt = new Date().toISOString();
    const snapshot = {
      schema_version: "contract-snapshot-v1",
      generated_at: generatedAt,
      customer: {
        person_id: person.id,
        full_name: person.full_name,
        email: person.email,
        phone_e164: person.phone_e164,
        document_type: party.document_type,
        document_number: party.document_number,
        address: {
          line1: party.address_line1,
          line2: party.address_line2,
          district: party.district,
          city: party.city,
          state_region: party.state_region,
          postal_code: party.postal_code,
          country_code: party.country_code,
        },
      },
      operation: {
        id: operation.id,
        name: operation.name,
        code: operation.code,
        destination: { country: operation.primary_country, region: operation.primary_region, city: operation.primary_city },
        timezone: operation.timezone,
        planned_start: operation.planned_start,
        planned_end: operation.planned_end,
        experience_name: operation.source_experience_name,
        offering_name: operation.source_offering_name,
      },
      order: {
        id: order.id,
        status: order.status,
        reference_label: order.reference_label,
        currency: order.currency,
        grand_total_minor: order.grand_total_minor,
        buyer_name_snapshot: order.buyer_name_snapshot,
        created_at: order.created_at,
        items,
      },
      reservation: reservation ?? null,
      template: {
        id: template.id,
        key: template.template_key,
        version: template.version,
        name: template.name,
        locale: template.locale,
        provider: template.provider,
        provider_template_id: template.provider_template_id,
        variable_schema: template.variable_schema,
      },
    };

    const { data: contract, error: createError } = await admin
      .from("customer_contracts")
      .insert({
        tenant_id: order.tenant_id,
        operation_id: order.operation_id,
        order_id: order.id,
        reservation_id: reservation?.id ?? null,
        customer_person_id: order.buyer_person_id,
        template_key: template.template_key,
        template_version: template.version,
        provider: template.provider,
        status: "draft",
        signer_name: person.full_name,
        signer_document: party.document_number,
        metadata: {
          generation: { source: "contracts-generate", generated_at: generatedAt, generated_by: userData.user.id },
          contract_snapshot: snapshot,
          provider_template_id: template.provider_template_id,
        },
        created_by: userData.user.id,
      })
      .select("id,status,template_key,template_version")
      .single();
    if (createError?.code === "23505") {
      const { data: raced, error: racedError } = await admin
        .from("customer_contracts")
        .select("id,status,template_key,template_version")
        .eq("tenant_id", order.tenant_id)
        .eq("order_id", order.id)
        .eq("template_key", template.template_key)
        .eq("template_version", template.version)
        .in("status", ["draft", "sent", "viewed", "signed"])
        .maybeSingle();
      if (racedError || !raced) return json({ error: "contract_create_conflict" }, 409);
      return json({ ok: true, idempotent: true, contract_id: raced.id, status: raced.status, template_key: raced.template_key, template_version: raced.template_version });
    }
    if (createError || !contract) return json({ error: "contract_create_failed" }, 500);

    const { error: eventError } = await admin.from("contract_events").insert({
      tenant_id: order.tenant_id,
      contract_id: contract.id,
      event_type: "created",
      provider_event_id: `cobs:contract:created:${contract.id}`,
      source: "cobs",
      payload: { order_id: order.id, template_key: template.template_key, template_version: template.version },
      created_by: userData.user.id,
    });
    if (eventError && eventError.code !== "23505") return json({ error: "contract_event_failed", contract_id: contract.id }, 500);

    return json({
      ok: true,
      contract_id: contract.id,
      status: contract.status,
      template_key: contract.template_key,
      template_version: contract.template_version,
      ready_for_provider_send: false,
    }, 201);
  } catch (error) {
    console.error("contracts-generate", String(error));
    return json({ error: "internal_error" }, 500);
  }
});
