import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { PDFDocument, StandardFonts } from "npm:pdf-lib@1.17.1";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const PUB = JSON.parse(Deno.env.get("SUPABASE_PUBLISHABLE_KEYS") ?? "{}").default;
const SEC = JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS") ?? "{}").default;
const BUCKET = "customer-contracts";
const RENDERER_VERSION = "pdf-lib-v1";
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

const sha256Bytes = async (bytes: Uint8Array) => {
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
};

const sha256Text = async (value: string) => sha256Bytes(new TextEncoder().encode(value));

const displayValue = (value: unknown): string | null => {
  if (value == null) return null;
  if (typeof value === "string") return value.trim() ? value : null;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (Array.isArray(value) || isRecord(value)) return JSON.stringify(value, null, 2);
  return null;
};

const renderTemplate = (source: string, variables: Record<string, unknown>) => {
  const missing = new Set<string>();
  const rendered = source.replace(/{{\s*([A-Za-z0-9_-]+)\s*}}/g, (_match, key: string) => {
    const value = displayValue(variables[key]);
    if (value == null) {
      missing.add(key);
      return `{{${key}}}`;
    }
    return value;
  });
  const unresolved = [...rendered.matchAll(/{{\s*([A-Za-z0-9_-]+)\s*}}/g)].map((match) => match[1]);
  for (const key of unresolved) missing.add(key);
  return { rendered, missing: [...missing].sort() };
};

const wrapParagraph = (
  text: string,
  maxWidth: number,
  widthOf: (value: string) => number,
): string[] => {
  if (!text.trim()) return [""];
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let current = "";

  const pushLongWord = (word: string) => {
    let chunk = "";
    for (const char of word) {
      const candidate = chunk + char;
      if (chunk && widthOf(candidate) > maxWidth) {
        lines.push(chunk);
        chunk = char;
      } else {
        chunk = candidate;
      }
    }
    return chunk;
  };

  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (widthOf(candidate) <= maxWidth) {
      current = candidate;
      continue;
    }
    if (current) lines.push(current);
    current = widthOf(word) <= maxWidth ? word : pushLongWord(word);
  }
  if (current) lines.push(current);
  return lines;
};

const buildPdf = async (text: string) => {
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const pageWidth = 595.28;
  const pageHeight = 841.89;
  const margin = 50;
  const fontSize = 10.5;
  const lineHeight = 15;
  const maxWidth = pageWidth - margin * 2;
  let page = pdf.addPage([pageWidth, pageHeight]);
  let y = pageHeight - margin;
  const widthOf = (value: string) => font.widthOfTextAtSize(value, fontSize);

  for (const paragraph of text.replace(/\r\n/g, "\n").split("\n")) {
    const lines = wrapParagraph(paragraph, maxWidth, widthOf);
    for (const line of lines) {
      if (y < margin + lineHeight) {
        page = pdf.addPage([pageWidth, pageHeight]);
        y = pageHeight - margin;
      }
      if (line) page.drawText(line, { x: margin, y, size: fontSize, font });
      y -= lineHeight;
    }
  }

  return new Uint8Array(await pdf.save({ useObjectStreams: false }));
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

    let input: { contract_id?: string };
    try {
      input = await req.json();
    } catch {
      return json({ error: "invalid_json" }, 400);
    }
    const contractId = input.contract_id?.trim();
    if (!contractId) return json({ error: "contract_id_required" }, 400);

    const admin = createClient(SUPABASE_URL, SEC, { auth: { persistSession: false } });
    const { data: contract, error: contractError } = await admin
      .from("customer_contracts")
      .select("id,tenant_id,status,template_key,template_version,provider_envelope_id,original_document_path,document_hash,metadata")
      .eq("id", contractId)
      .maybeSingle();
    if (contractError) return json({ error: "contract_lookup_failed" }, 500);
    if (!contract) return json({ error: "contract_not_found" }, 404);

    const { data: membership } = await admin
      .from("memberships")
      .select("role")
      .eq("tenant_id", contract.tenant_id)
      .eq("profile_id", userData.user.id)
      .eq("status", "active")
      .maybeSingle();
    if (!membership || !["owner", "admin", "operations_agent"].includes(membership.role))
      return json({ error: "forbidden" }, 403);

    if (contract.status !== "draft") return json({ error: "contract_not_draft", status: contract.status }, 409);
    if (contract.provider_envelope_id) return json({ error: "provider_envelope_already_created" }, 409);
    if (contract.original_document_path || contract.document_hash)
      return json({ error: "contract_document_already_frozen" }, 409);

    const { data: template, error: templateError } = await admin
      .from("contract_templates")
      .select("id,status,legal_reviewed_at,metadata,document_source_snapshot,document_source_hash,document_renderer_version")
      .eq("tenant_id", contract.tenant_id)
      .eq("template_key", contract.template_key)
      .eq("version", contract.template_version)
      .eq("status", "active")
      .maybeSingle();
    if (templateError) return json({ error: "contract_template_lookup_failed" }, 500);
    if (!template?.legal_reviewed_at)
      return json({ error: "contract_render_locked", reason: "formal_legal_validation_required" }, 423);
    if (template.metadata?.provider_document_mode !== "upload")
      return json({ error: "contract_document_mode_not_upload" }, 409);
    if (template.document_renderer_version !== RENDERER_VERSION)
      return json({ error: "unsupported_document_renderer", expected: RENDERER_VERSION }, 409);

    const source = typeof template.document_source_snapshot === "string" ? template.document_source_snapshot.trim() : "";
    const sourceHash = typeof template.document_source_hash === "string" ? template.document_source_hash.trim().toLowerCase() : "";
    if (source.length < 200 || !sourceHash) return json({ error: "contract_document_source_required" }, 409);
    const actualSourceHash = await sha256Text(source);
    if (actualSourceHash !== sourceHash) return json({ error: "contract_document_source_hash_mismatch" }, 409);

    const snapshot = isRecord(contract.metadata) && isRecord(contract.metadata.contract_snapshot)
      ? contract.metadata.contract_snapshot
      : null;
    if (!snapshot) return json({ error: "contract_snapshot_required" }, 409);
    const variables = isRecord(snapshot.variables) ? snapshot.variables : null;
    if (!variables) return json({ error: "contract_snapshot_variables_required" }, 409);
    if (!isRecord(contract.metadata) || contract.metadata.ready_for_render !== true)
      return json({ error: "contract_not_ready_for_render" }, 409);

    const { rendered, missing } = renderTemplate(source, variables);
    if (missing.length) return json({ error: "contract_placeholders_unresolved", missing }, 409);

    let bytes: Uint8Array;
    try {
      bytes = await buildPdf(rendered);
    } catch (error) {
      console.error("contracts-render-pdf unsupported content", String(error));
      return json({ error: "contract_document_contains_unsupported_characters" }, 422);
    }
    if (bytes.length < 5 || new TextDecoder().decode(bytes.subarray(0, 5)) !== "%PDF-")
      return json({ error: "generated_pdf_invalid" }, 500);

    const documentHash = await sha256Bytes(bytes);
    const path = `${contract.tenant_id}/${contract.id}/original-${documentHash}.pdf`;
    const { error: uploadError } = await admin.storage
      .from(BUCKET)
      .upload(path, bytes, { contentType: "application/pdf", upsert: false });
    if (uploadError) {
      console.error("contracts-render-pdf upload", uploadError.message);
      return json({ error: "contract_pdf_upload_failed" }, 500);
    }

    const renderedAt = new Date().toISOString();
    const metadata = {
      ...(contract.metadata as Record<string, unknown>),
      ready_for_render: false,
      ready_for_provider_send: false,
      document_render: {
        renderer_version: RENDERER_VERSION,
        rendered_at: renderedAt,
        document_source_hash: sourceHash,
        document_hash: documentHash,
      },
    };
    const { data: updated, error: updateError } = await admin
      .from("customer_contracts")
      .update({ original_document_path: path, document_hash: documentHash, metadata })
      .eq("id", contract.id)
      .eq("status", "draft")
      .is("original_document_path", null)
      .is("document_hash", null)
      .select("id,status")
      .maybeSingle();

    if (updateError || !updated) {
      await admin.storage.from(BUCKET).remove([path]);
      return json({ error: "contract_changed_during_render" }, 409);
    }

    return json({
      ok: true,
      contract_id: contract.id,
      status: "draft",
      renderer_version: RENDERER_VERSION,
      original_document_path: path,
      document_hash: documentHash,
      ready_for_provider_send: false,
    }, 201);
  } catch (error) {
    console.error("contracts-render-pdf", String(error));
    return json({ error: "internal_error" }, 500);
  }
});
