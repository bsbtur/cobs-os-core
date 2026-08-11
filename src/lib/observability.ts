/**
 * COBS OS · M4 — minimum production observability.
 *
 * ONE structured, sanitized error envelope emitted to the platform log pipeline
 * (console -> worker/browser logs). This is NOT a second audit system: immutable
 * business evidence stays in public.audit_events. This layer only records that a
 * FAILURE happened, with enough context to investigate it.
 *
 * PRIVACY CONSTITUTION (binding):
 * - never emit passwords, JWTs, refresh tokens, invitation tokens or token hashes
 * - never emit e-mails, document numbers, phone numbers, payment credentials
 * - never emit private message bodies or passenger PII
 * - never emit request bodies
 * Only identifiers (uuid), codes, severities and redacted messages are allowed.
 */

export type ObsSeverity = "SEV-1" | "SEV-2" | "SEV-3" | "SEV-4";
export type ObsSource = "frontend" | "ssr" | "data_api" | "auth";

export type ObsEnvelope = {
  timestamp: string;
  environment: string;
  severity: ObsSeverity;
  domain: string;
  action: string;
  error_code: string;
  correlation_id: string;
  tenant_id?: string;
  operation_id?: string;
  actor_profile_id?: string;
  source: ObsSource;
  recoverable: boolean;
  sanitized_context: string;
};

const UUID_RE = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;
const EMAIL_RE = /[^\s"'<>@]+@[^\s"'<>@]+\.[^\s"'<>@]+/g;
const JWT_RE = /\beyJ[A-Za-z0-9_-]{5,}\.[A-Za-z0-9_-]{5,}\.[A-Za-z0-9_-]{5,}\b/g;
const LONG_TOKEN_RE = /\b(?:sb_[a-z]+_)?[A-Za-z0-9_-]{32,}\b/g;
const HEX_HASH_RE = /\b[0-9a-f]{40,}\b/gi;
const SECRET_KV_RE =
  /\b(password|senha|token|secret|apikey|api_key|authorization|bearer|refresh_token|token_hash)\b\s*[:=]\s*\S+/gi;

const MAX_CONTEXT = 300;

/** Redacts every known secret/PII shape. Applied to EVERY string that leaves this module. */
export function redact(input: unknown): string {
  const raw = typeof input === "string" ? input : String(input ?? "");
  return raw
    .replace(SECRET_KV_RE, (_m, k: string) => `${k}=[redacted]`)
    .replace(JWT_RE, "[redacted:jwt]")
    .replace(EMAIL_RE, "[redacted:email]")
    .replace(HEX_HASH_RE, "[redacted:hash]")
    .replace(UUID_RE, "[uuid]")
    .replace(LONG_TOKEN_RE, "[redacted:token]")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, MAX_CONTEXT);
}

/** Stable per-session correlation id. Random, non-identifying, never persisted server-side. */
let sessionCorrelationId: string | undefined;
export function correlationId(): string {
  if (sessionCorrelationId) return sessionCorrelationId;
  const rnd =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  sessionCorrelationId = `cobs-${rnd}`;
  return sessionCorrelationId;
}

/** Best-effort, non-leaking error code. Prefers PostgreSQL SQLSTATE when present. */
export function errorCodeOf(error: unknown): string {
  const e = error as { code?: unknown; status?: unknown; name?: unknown } | null;
  if (e && typeof e.code === "string" && e.code.length > 0) return e.code;
  if (e && typeof e.status === "number") return `http_${e.status}`;
  const msg = error instanceof Error ? error.message : String(error ?? "");
  if (/unauthorized|not authenticated|authentication required/i.test(msg)) return "unauthorized";
  if (/permission denied|only owners|not allowed|forbidden/i.test(msg)) return "forbidden";
  if (/idempotency/i.test(msg)) return "idempotency_conflict";
  if (/not found|does not exist/i.test(msg)) return "not_found";
  if (/invalid|cannot|must be/i.test(msg)) return "invalid_state";
  if (/fetch|network|failed to load/i.test(msg)) return "network";
  return "unhandled";
}

/** SEV mapping follows the M3 severity constitution. */
export function severityOf(code: string, domain: string): ObsSeverity {
  if (code === "network" || code === "http_503" || code === "unhandled") {
    return domain === "runtime" || domain === "mobility" ? "SEV-1" : "SEV-2";
  }
  if (code === "forbidden" || code === "unauthorized") return "SEV-2";
  if (code === "idempotency_conflict") return "SEV-3";
  if (code === "invalid_state" || code === "not_found") return "SEV-3";
  return "SEV-3";
}

/** Domain inferred from the current route only — never from payloads. */
export function domainOfPath(path: string): string {
  if (path.includes("/live") || path.includes("/journey")) return "runtime";
  if (path.includes("/mobility")) return "mobility";
  if (path.includes("/hospitality")) return "hospitality";
  if (path.includes("/events")) return "events";
  if (path.includes("/communication") || path.includes("/inbox")) return "communication";
  if (path.includes("/commerce")) return "commerce";
  if (path.includes("/people") || path.includes("/team")) return "people";
  if (path.includes("/my")) return "portal";
  if (path.startsWith("/auth")) return "identity";
  if (path.includes("/operations")) return "operations";
  if (path.includes("/settings") || path.includes("/experiences")) return "catalog";
  return "app";
}

function operationIdOfPath(path: string): string | undefined {
  const m = /\/(?:operations|my)\/([0-9a-f-]{36})/i.exec(path);
  return m?.[1];
}

export function emitObservation(envelope: ObsEnvelope): void {
  // Single-line, greppable, machine-parsable. Consumed via platform logs.
  console.error(`[COBS_OBS] ${JSON.stringify(envelope)}`);
}

export function observeError(
  error: unknown,
  input: { action: string; source?: ObsSource; domain?: string; tenantId?: string } = {
    action: "unknown",
  },
): ObsEnvelope {
  const path = typeof window !== "undefined" ? window.location.pathname : "/";
  const code = errorCodeOf(error);
  const domain = input.domain ?? domainOfPath(path);
  const operationId = operationIdOfPath(path);
  const envelope: ObsEnvelope = {
    timestamp: new Date().toISOString(),
    environment: typeof window !== "undefined" ? window.location.hostname : "server",
    severity: severityOf(code, domain),
    domain,
    action: redact(input.action),
    error_code: code,
    correlation_id: correlationId(),
    ...(input.tenantId ? { tenant_id: input.tenantId } : {}),
    ...(operationId ? { operation_id: operationId } : {}),
    source: input.source ?? "frontend",
    recoverable: code !== "unhandled",
    sanitized_context: redact(error instanceof Error ? error.message : error),
  };
  emitObservation(envelope);
  return envelope;
}
