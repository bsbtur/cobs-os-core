/**
 * COBS OS · W01 — Invitation token intent store.
 *
 * BINDING CORRECTION 1 (retry-safe invitations):
 * A single "user intent" owns BOTH the cryptographically secure raw token and
 * the idempotency key. Both are generated once, persisted locally, and reused
 * across every transport retry of that same intent. The server only ever sees
 * the raw token to hash it (sha-256); the database stores the hash only.
 *
 * Consequence: a lost response never strands the administrator — the intent
 * still holds the raw token, so the shareable link can always be rebuilt while
 * the idempotency key guarantees the same invitation row is resolved.
 *
 * The raw token lives in the inviting administrator's own browser storage only.
 * It is never persisted server-side, never logged, and never written to audit.
 */

export type InvitationIntent = {
  /** Stable id for the user intent (also used as the idempotency key). */
  idempotencyKey: string;
  /** 256 bits of Web Crypto entropy, hex-encoded. Never leaves the client except to be hashed. */
  rawToken: string;
  tenantId: string;
  email: string;
  role: string;
  createdAt: string;
  /** Filled once the server confirms (or replays) the invitation. */
  invitationId?: string;
  expiresAt?: string;
};

const STORAGE_KEY = "cobs.invitation.intents";
const MAX_INTENTS = 50;

export const HEX_256_RE = /^[0-9a-f]{64}$/;

export function isValidRawToken(token: string): boolean {
  return HEX_256_RE.test(token);
}

/** 32 bytes of CSPRNG entropy, hex-encoded. Never weakened for determinism. */
export function generateRawToken(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

export function generateIdempotencyKey(): string {
  return crypto.randomUUID();
}

export function createInvitationIntent(input: {
  tenantId: string;
  email: string;
  role: string;
}): InvitationIntent {
  return {
    idempotencyKey: generateIdempotencyKey(),
    rawToken: generateRawToken(),
    tenantId: input.tenantId,
    email: input.email.trim().toLowerCase(),
    role: input.role,
    createdAt: new Date().toISOString(),
  };
}

function read(): InvitationIntent[] {
  if (typeof window === "undefined") return [];
  try {
    const parsed: unknown = JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? "[]");
    return Array.isArray(parsed) ? (parsed as InvitationIntent[]) : [];
  } catch {
    return [];
  }
}

function write(intents: InvitationIntent[]) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(intents.slice(0, MAX_INTENTS)));
}

export function saveIntent(intent: InvitationIntent) {
  const rest = read().filter((i) => i.idempotencyKey !== intent.idempotencyKey);
  write([intent, ...rest]);
}

export function listIntents(tenantId: string): InvitationIntent[] {
  return read().filter((i) => i.tenantId === tenantId);
}

/** Recover the raw token of a confirmed invitation so the share link survives retries. */
export function findIntentByInvitationId(invitationId: string): InvitationIntent | undefined {
  return read().find((i) => i.invitationId === invitationId);
}

/**
 * An intent that was started but whose response never arrived.
 * Replaying it with the SAME idempotency key + SAME raw token is safe.
 */
export function findPendingIntent(tenantId: string, email: string): InvitationIntent | undefined {
  const normalized = email.trim().toLowerCase();
  return read().find(
    (i) => i.tenantId === tenantId && i.email === normalized && i.invitationId === undefined,
  );
}

export function forgetIntent(idempotencyKey: string) {
  write(read().filter((i) => i.idempotencyKey !== idempotencyKey));
}

export function buildInviteLink(origin: string, rawToken: string): string {
  return `${origin.replace(/\/$/, "")}/invite/${rawToken}`;
}
