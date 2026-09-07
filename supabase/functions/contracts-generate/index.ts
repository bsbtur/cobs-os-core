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

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const asNonEmptyString = (value: unknown) =>
  typeof value === "string" && value.trim() ? value.trim() : null;

const formatMoney = (amountMinor: number, currency: string) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency }).format(amountMinor / 100);

const underThousandPtBr = (value: number): string => {
  const units = ["", "um", "dois", "três", "quatro", "cinco", "seis", "sete", "oito", "nove"];
  const teens = ["dez", "onze", "doze", "treze", "quatorze", "quinze", "dezesseis", "dezessete", "dezoito", "dezenove"];
  const tens = ["", "", "vinte", "trinta", "quarenta", "cinquenta", "sessenta", "setenta", "oitenta", "noventa"];
  const hundreds = ["", "cento", "duzentos", "trezentos", "quatrocentos", "quinhentos", "seiscentos", "setecentos", "oitocentos", "novecentos"];
  if (value === 0) return "";
  if (value === 100) return "cem";
  const parts: string[] = [];
  const h = Math.floor(value / 100);
  const rest = value % 100;
  if (h) parts.push(hundreds[h]);
  if (rest) {
    const tail = rest < 10 ? units[rest] : rest < 20 ? teens[rest - 10] : `${tens[Math.floor(rest / 10)]}${rest % 10 ? ` e ${units[rest % 10]}` : ""}`;
    parts.push(tail);
  }
  return parts.join(" e ");
};

const integerPtBr = (value: number): string => {
  if (value === 0) return "zero";
  if (!Number.isSafeInteger(value) || value < 0 || value > 999_999_999_999)
    throw new Error("amount_out_of_supported_range");
  const groups = [
    { divisor: 1_000_000_000, singular: "bilhão", plural: "bilhões" },
    { divisor: 1_000_000, singular: "milhão", plural: "milhões" },
    { divisor: 1_000, singular: "mil", plural: "mil" },
  ];
  let remainder = value;
  const parts: string[] = [];
  for (const group of groups) {
    const count = Math.floor(remainder / group.divisor);
    if (!count) continue;
    remainder %= group.divisor;
    if (group.divisor === 1_000) parts.push(count === 1 ? "mil" : `${underThousandPtBr(count)} mil`);
    else parts.push(`${count === 1 ? "um" : underThousandPtBr(count)} ${count === 1 ? group.singular : group.plural}`);
  }
  if (remainder) parts.push(underThousandPtBr(remainder));
  return parts.join(" e ");
};

const brlInWords = (amountMinor: number) => {
  if (!Number.isSafeInteger(amountMinor) || amountMinor < 0) throw new Error("invalid_amount_minor");
  const reais = Math.floor(amountMinor / 100);
  const cents = amountMinor % 100;
  const realText = `${integerPtBr(reais)} ${reais === 1 ? "real" : "reais"}`;
  if (!cents) return realText;
  return `${realText} e ${integerPtBr(cents)} ${cents === 1 ? "centavo" : "centavos"}`;
};

const formatDatePtBr = (isoDate: string) => {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(isoDate);
  return match ? `${match[3]}/${match[2]}/${match[1]}` : isoDate;
};

const paymentPlanFromMetadata = (metadata: unknown, expectedTotal: number, currency: string) => {
  if (!isRecord(metadata) || !Array.isArray(metadata.payment_schedule_v1))
    throw new Error("payment_schedule_snapshot_required");
  const schedule = metadata.payment_schedule_v1.map((raw, index) => {
    if (!isRecord(raw)) throw new Error("payment_schedule_invalid");
    const installmentNumber = Number(raw.installment_number);
    const amountMinor = Number(raw.amount_minor);
    const kind = asNonEmptyString(raw.kind) ?? "installment";
    const dueDate = asNonEmptyString(raw.due_date);
    const dueRule = asNonEmptyString(raw.due_rule);
    if (!Number.isInteger(installmentNumber) || installmentNumber <= 0 || !Number.isSafeInteger(amountMinor) || amountMinor <= 0)
      throw new Error(`payment_schedule_invalid_${index + 1}`);
    if (!dueDate && !dueRule) throw new Error(`payment_schedule_due_required_${installmentNumber}`);
    return { installment_number: installmentNumber, kind, amount_minor: amountMinor, due_date: dueDate, due_rule: dueRule };
  });
  if (!schedule.length) throw new Error("payment_schedule_snapshot_required");
  const total = schedule.reduce((sum, item) => sum + item.amount_minor, 0);
  if (total !== expectedTotal) throw new Error("payment_schedule_total_mismatch");
  const display = schedule
    .sort((a, b) => a.installment_number - b.installment_number)
    .map((item) => {
      const due = item.due_date
        ? `vencimento ${formatDatePtBr(item.due_date)}`
        : item.due_rule === "at_contract"
          ? "na contratação"
          : `condição ${item.due_rule}`;
      return `Parcela ${item.installment_number}: ${formatMoney(item.amount_minor, currency)} — ${due}`;
    })
    .join("; ");
  return { schedule, display };
};

const contractDatePtBr = (generatedAt: string, timezone: string | null) => {
  const parts = new Intl.DateTimeFormat("pt-BR", {
    timeZone: timezone || "America/Sao_Paulo",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).formatToParts(new Date(generatedAt));
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.day}/${values.month}/${values.year}`;
};

const missingRequiredVariables = (required: unknown, variables: Record<string, unknown>) => {
  if (!Array.isArray(required)) return ["template_required_variable_schema"];
  return required.filter((key) => {
    if (typeof key !== "string") return true;
    const value = variables[key];
    if (Array.isArray(value)) return value.length === 0;
    if (typeof value === "string") return value.trim().length === 0;
    return value == null;
  });
};

const sha256Hex = async (value: unknown) => {
  const bytes = new TextEncoder().encode(JSON.stringify(value));
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
};

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
    if (!order.buyer_person_id) return json({ error: "order_buyer_required" }, 409);
    if (!["submitted", "confirmed"].includes(order.status))
      return json({ error: "order_not_contractable", status: order.status }, 409);
    if (order.grand_total_minor == null || !Number.isSafeInteger(order.grand_total_minor) || order.grand_total_minor <= 0)
      return json({ error: "order_total_required" }, 409);
    const currency = asNonEmptyString(order.currency)?.toUpperCase();
    if (!currency) return json({ error: "order_currency_required" }, 409);
    if (currency !== "BRL") return json({ error: "unsupported_contract_currency", currency }, 409);

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
      admin.from("operations").select("id,name,code,primary_country,primary_region,primary_city,timezone,planned_start,planned_end,source_experience_name,source_offering_name,metadata,updated_at").eq("id", order.operation_id).eq("tenant_id", order.tenant_id).maybeSingle(),
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
    if (!reservation?.offering_id) return json({ error: "contract_reservation_offering_required" }, 409);
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
    const [
      { data: offering, error: offeringError },
      { data: quotes, error: quotesError },
      { data: privacyRows, error: privacyError },
      { data: journeyRows, error: journeyError },
    ] = await Promise.all([
      admin.from("offerings").select("id,name,slug,status,currency_code,metadata,updated_at").eq("id", reservation.offering_id).eq("tenant_id", order.tenant_id).maybeSingle(),
      admin.from("operation_quotes").select("id,supplier_id,category,description,contract_reference,contracted_at,status").eq("tenant_id", order.tenant_id).eq("operation_id", order.operation_id).eq("status", "contracted").order("category", { ascending: true }),
      admin.from("privacy_policy_versions").select("id,policy_key,version,title,effective_at,content_hash,public_url,metadata").eq("tenant_id", order.tenant_id).eq("status", "active").lte("effective_at", generatedAt).order("effective_at", { ascending: false }).limit(2),
      admin
        .from("journey_steps")
        .select("id,sequence,title,description,step_kind,planned_start,planned_end,location_label,traveler_label,updated_at")
        .eq("tenant_id", order.tenant_id)
        .eq("operation_id", order.operation_id)
        .eq("traveler_facing", true)
        .is("archived_at", null)
        .order("sequence", { ascending: true }),
    ]);
    if (offeringError || quotesError || privacyError || journeyError)
      return json({ error: "contract_evidence_lookup_failed" }, 500);
    if (!offering) return json({ error: "offering_snapshot_required" }, 409);
    if (!quotes?.length) return json({ error: "contracted_suppliers_required" }, 409);
    if (!privacyRows?.length) return json({ error: "active_privacy_policy_required" }, 409);
    if (!journeyRows?.length) return json({ error: "program_snapshot_required" }, 409);

    const templateMetadata = isRecord(template.metadata) ? template.metadata : {};
    const configuredPrivacyKey = asNonEmptyString(templateMetadata.privacy_policy_key);
    const matchingPrivacy = configuredPrivacyKey
      ? privacyRows.filter((row) => row.policy_key === configuredPrivacyKey)
      : privacyRows;
    if (!matchingPrivacy.length) return json({ error: "configured_privacy_policy_not_active" }, 409);
    if (!configuredPrivacyKey && matchingPrivacy.length > 1)
      return json({ error: "privacy_policy_ambiguous", active_policy_count: matchingPrivacy.length }, 409);
    const privacy = matchingPrivacy[0];

    const supplierIds = [...new Set(quotes.map((quote) => quote.supplier_id).filter(Boolean))];
    if (!supplierIds.length) return json({ error: "contracted_suppliers_required" }, 409);
    const { data: suppliers, error: suppliersError } = await admin
      .from("suppliers")
      .select("id,name,legal_name,category,document_number,address_line1,address_line2,district,city,state_region,postal_code,country_code")
      .eq("tenant_id", order.tenant_id)
      .in("id", supplierIds);
    if (suppliersError) return json({ error: "supplier_snapshot_lookup_failed" }, 500);
    if (!suppliers || suppliers.length !== supplierIds.length) return json({ error: "supplier_snapshot_incomplete" }, 409);

    const supplierById = new Map(suppliers.map((supplier) => [supplier.id, supplier]));
    const contractedSuppliers = quotes.map((quote) => {
      const supplier = supplierById.get(quote.supplier_id);
      if (!supplier) throw new Error("supplier_snapshot_incomplete");
      const legalName = asNonEmptyString(supplier.legal_name) ?? asNonEmptyString(supplier.name);
      const documentNumber = asNonEmptyString(supplier.document_number);
      const addressLine1 = asNonEmptyString(supplier.address_line1);
      const city = asNonEmptyString(supplier.city);
      const stateRegion = asNonEmptyString(supplier.state_region);
      const postalCode = asNonEmptyString(supplier.postal_code);
      const countryCode = asNonEmptyString(supplier.country_code);
      if (!legalName || !documentNumber || !addressLine1 || !city || !stateRegion || !postalCode || !countryCode)
        throw new Error(`supplier_legal_evidence_incomplete:${supplier.id}`);
      return {
        quote_id: quote.id,
        supplier_id: supplier.id,
        service_category: quote.category,
        service_description: quote.description,
        legal_name: legalName,
        document_number: documentNumber,
        commercial_address: {
          line1: addressLine1,
          line2: supplier.address_line2,
          district: supplier.district,
          city,
          state_region: stateRegion,
          postal_code: postalCode,
          country_code: countryCode,
        },
        contract_reference: quote.contract_reference,
        contracted_at: quote.contracted_at,
      };
    });

    const offeringMetadata = isRecord(offering.metadata) ? offering.metadata : {};
    const commercialTermsVersion = asNonEmptyString(offeringMetadata.commercial_terms_version);
    if (!commercialTermsVersion) return json({ error: "commercial_terms_version_required" }, 409);

    const programSteps = journeyRows.map((step) => ({
      id: step.id,
      sequence: step.sequence,
      title: step.title,
      description: step.description,
      step_kind: step.step_kind,
      planned_start: step.planned_start,
      planned_end: step.planned_end,
      location_label: step.location_label,
      traveler_label: step.traveler_label,
      source_updated_at: step.updated_at,
    }));
    const programHash = await sha256Hex(programSteps);

    let paymentPlan: ReturnType<typeof paymentPlanFromMetadata>;
    try {
      paymentPlan = paymentPlanFromMetadata(offeringMetadata, order.grand_total_minor, currency);
    } catch (error) {
      return json({ error: error instanceof Error ? error.message : "payment_schedule_invalid" }, 409);
    }

    let grandTotalInWords: string;
    try {
      grandTotalInWords = brlInWords(order.grand_total_minor);
    } catch (error) {
      return json({ error: error instanceof Error ? error.message : "amount_in_words_failed" }, 409);
    }
    const grandTotalFormatted = formatMoney(order.grand_total_minor, currency);
    const contractDate = contractDatePtBr(generatedAt, operation.timezone);
    const packageName = asNonEmptyString(operation.source_offering_name) ?? asNonEmptyString(items[0]?.sellable_name_snapshot);

    const variables: Record<string, unknown> = {
      contract_date: contractDate,
      customer_full_name: person.full_name,
      customer_document_type: party.document_type,
      customer_document_number: party.document_number,
      customer_email: person.email,
      customer_phone: person.phone_e164,
      customer_address_line1: party.address_line1,
      customer_address_line2: party.address_line2,
      customer_district: party.district,
      customer_city: party.city,
      customer_state_region: party.state_region,
      customer_postal_code: party.postal_code,
      customer_country_code: party.country_code,
      operation_name: operation.name,
      operation_code: operation.code,
      operation_start: operation.planned_start,
      operation_end: operation.planned_end,
      destination_city: operation.primary_city,
      destination_region: operation.primary_region,
      order_id: order.id,
      reservation_id: reservation.id,
      package_name: packageName,
      currency,
      grand_total_formatted: grandTotalFormatted,
      grand_total_in_words: grandTotalInWords,
      payment_plan_display: paymentPlan.display,
      order_items: items,
      contracted_suppliers: contractedSuppliers,
      privacy_policy_version: privacy.version,
      privacy_policy_effective_at: privacy.effective_at,
      program_snapshot: programSteps,
      program_hash: programHash,
    };
    const variableSchema = isRecord(template.variable_schema) ? template.variable_schema : {};
    const missingVariables = missingRequiredVariables(variableSchema.required, variables);
    if (missingVariables.length)
      return json({ error: "contract_placeholder_preflight_failed", missing: missingVariables }, 409);

    const snapshot = {
      schema_version: "contract-snapshot-v2",
      generated_at: generatedAt,
      contract_date: contractDate,
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
        source_updated_at: operation.updated_at,
      },
      order: {
        id: order.id,
        status: order.status,
        reference_label: order.reference_label,
        currency,
        grand_total_minor: order.grand_total_minor,
        grand_total_formatted: grandTotalFormatted,
        grand_total_in_words: grandTotalInWords,
        buyer_name_snapshot: order.buyer_name_snapshot,
        created_at: order.created_at,
        items,
      },
      reservation,
      offering: {
        id: offering.id,
        name: offering.name,
        slug: offering.slug,
        status: offering.status,
        currency_code: offering.currency_code,
        commercial_terms_version: commercialTermsVersion,
        payment_schedule_v1: paymentPlan.schedule,
        payment_plan_display: paymentPlan.display,
        source_updated_at: offering.updated_at,
      },
      program: {
        source: "journey_steps",
        traveler_facing_only: true,
        active_only: true,
        ordered_by: "sequence",
        step_count: programSteps.length,
        content_hash: programHash,
        steps: programSteps,
      },
      suppliers: contractedSuppliers,
      privacy_policy: {
        id: privacy.id,
        policy_key: privacy.policy_key,
        version: privacy.version,
        title: privacy.title,
        effective_at: privacy.effective_at,
        content_hash: privacy.content_hash,
        public_url: privacy.public_url,
      },
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
      variables,
      preflight: {
        supplier_evidence_complete: true,
        payment_schedule_matches_order_total: true,
        privacy_policy_frozen: true,
        offer_version_frozen: true,
        program_snapshot_frozen: true,
        placeholders_complete: true,
      },
    };

    const { data: contract, error: createError } = await admin
      .from("customer_contracts")
      .insert({
        tenant_id: order.tenant_id,
        operation_id: order.operation_id,
        order_id: order.id,
        reservation_id: reservation.id,
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
          ready_for_render: true,
          ready_for_provider_send: false,
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
      payload: {
        order_id: order.id,
        template_key: template.template_key,
        template_version: template.version,
        snapshot_schema: "contract-snapshot-v2",
        commercial_terms_version: commercialTermsVersion,
        program_hash: programHash,
        program_step_count: programSteps.length,
        privacy_policy_version: privacy.version,
      },
      created_by: userData.user.id,
    });
    if (eventError && eventError.code !== "23505") return json({ error: "contract_event_failed", contract_id: contract.id }, 500);

    return json({
      ok: true,
      contract_id: contract.id,
      status: contract.status,
      template_key: contract.template_key,
      template_version: contract.template_version,
      snapshot_schema: "contract-snapshot-v2",
      ready_for_render: true,
      ready_for_provider_send: false,
    }, 201);
  } catch (error) {
    console.error("contracts-generate", String(error));
    const message = error instanceof Error ? error.message : "internal_error";
    if (message.startsWith("supplier_legal_evidence_incomplete:"))
      return json({ error: "supplier_legal_evidence_incomplete", supplier_id: message.split(":")[1] }, 409);
    if (message === "supplier_snapshot_incomplete") return json({ error: message }, 409);
    return json({ error: "internal_error" }, 500);
  }
});