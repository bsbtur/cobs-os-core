/**
 * COBS OS · W10 — pending portal claim intent (DEF-PILOT-016).
 *
 * A traveler who opens /my/claim/<token> without a session is sent to
 * authentication. Sign-up requires e-mail confirmation, which can land the
 * user on a different tab and lose the original URL. We therefore persist the
 * raw token locally (owner's own browser only, never sent anywhere except the
 * existing claim RPC, never logged) so the claim can be resumed after
 * authentication.
 *
 * The token is cleared as soon as the claim is consumed or rejected.
 */

const KEY = "cobs.claim.pending";
const TTL_MS = 24 * 60 * 60 * 1000;

const TOKEN_RE = /^[0-9a-f]{64}$/;

export function isClaimToken(value: unknown): value is string {
  return typeof value === "string" && TOKEN_RE.test(value);
}

/** Extracts the raw token from a /my/claim/<token> path, if present. */
export function claimTokenFromPath(pathname: string): string | null {
  const match = /^\/my\/claim\/([^/?#]+)/.exec(pathname);
  const token = match?.[1];
  return isClaimToken(token) ? token : null;
}

export function savePendingClaim(token: string) {
  if (typeof window === "undefined" || !isClaimToken(token)) return;
  try {
    window.localStorage.setItem(KEY, JSON.stringify({ token, at: Date.now() }));
  } catch {
    /* storage unavailable — the URL redirect still carries the token */
  }
}

export function readPendingClaim(): string | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { token?: unknown; at?: unknown };
    const at = typeof parsed.at === "number" ? parsed.at : 0;
    if (!isClaimToken(parsed.token) || Date.now() - at > TTL_MS) {
      clearPendingClaim();
      return null;
    }
    return parsed.token;
  } catch {
    return null;
  }
}

export function clearPendingClaim() {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(KEY);
  } catch {
    /* noop */
  }
}
