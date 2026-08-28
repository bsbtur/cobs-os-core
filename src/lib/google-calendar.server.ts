import { createCipheriv, createHash, randomBytes, timingSafeEqual } from "node:crypto";

const AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_URL = "https://oauth2.googleapis.com/token";
const CALENDAR_API = "https://www.googleapis.com/calendar/v3";
export const GOOGLE_CALENDAR_SCOPES = [
  "https://www.googleapis.com/auth/calendar.events",
  "https://www.googleapis.com/auth/calendar.freebusy",
];

type GoogleConfig = {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  stateSecret: string;
  tokenSecret: string;
};

export function getGoogleCalendarConfig(): GoogleConfig | null {
  const clientId = process.env["GOOGLE_CALENDAR_CLIENT_ID"];
  const clientSecret = process.env["GOOGLE_CALENDAR_CLIENT_SECRET"];
  const redirectUri = process.env["GOOGLE_CALENDAR_REDIRECT_URI"];
  const stateSecret = process.env["GOOGLE_CALENDAR_STATE_SECRET"];
  const tokenSecret = process.env["GOOGLE_CALENDAR_TOKEN_SECRET"];
  return clientId && clientSecret && redirectUri && stateSecret && tokenSecret
    ? { clientId, clientSecret, redirectUri, stateSecret, tokenSecret }
    : null;
}

export function encryptGoogleToken(token: string, secret: string): string {
  const key = createHash("sha256").update(secret).digest();
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([cipher.update(token, "utf8"), cipher.final()]);
  return [
    "v1",
    iv.toString("base64url"),
    cipher.getAuthTag().toString("base64url"),
    encrypted.toString("base64url"),
  ].join(".");
}

function signature(payload: string, secret: string): string {
  return createHash("sha256").update(`${secret}:${payload}`).digest("base64url");
}

export function createOAuthState(
  input: { userId: string; tenantId: string },
  secret: string,
): string {
  const payload = Buffer.from(
    JSON.stringify({
      ...input,
      nonce: randomBytes(16).toString("hex"),
      exp: Date.now() + 10 * 60_000,
    }),
  ).toString("base64url");
  return `${payload}.${signature(payload, secret)}`;
}

export function verifyOAuthState(
  state: string,
  secret: string,
): { userId: string; tenantId: string } | null {
  const [payload, supplied] = state.split(".");
  if (!payload || !supplied) return null;
  const expected = signature(payload, secret);
  if (
    supplied.length !== expected.length ||
    !timingSafeEqual(Buffer.from(supplied), Buffer.from(expected))
  )
    return null;
  try {
    const parsed = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as {
      userId?: string;
      tenantId?: string;
      exp?: number;
    };
    return parsed.userId && parsed.tenantId && parsed.exp && parsed.exp > Date.now()
      ? { userId: parsed.userId, tenantId: parsed.tenantId }
      : null;
  } catch {
    return null;
  }
}

export function buildGoogleAuthorizationUrl(config: GoogleConfig, state: string): string {
  const url = new URL(AUTH_URL);
  url.search = new URLSearchParams({
    client_id: config.clientId,
    redirect_uri: config.redirectUri,
    response_type: "code",
    access_type: "offline",
    prompt: "consent",
    include_granted_scopes: "true",
    scope: GOOGLE_CALENDAR_SCOPES.join(" "),
    state,
  }).toString();
  return url.toString();
}

export async function exchangeAuthorizationCode(config: GoogleConfig, code: string) {
  const response = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: config.clientId,
      client_secret: config.clientSecret,
      redirect_uri: config.redirectUri,
      grant_type: "authorization_code",
    }),
  });
  if (!response.ok) throw new Error("google_token_exchange_failed");
  return response.json() as Promise<{
    access_token: string;
    refresh_token?: string;
    expires_in: number;
    scope?: string;
    token_type: string;
  }>;
}

export async function fetchGoogleIdentity(accessToken: string) {
  const response = await fetch(`${CALENDAR_API}/users/me/calendarList/primary`, {
    headers: { authorization: `Bearer ${accessToken}` },
  });
  if (!response.ok) throw new Error("google_calendar_identity_failed");
  return response.json() as Promise<{ id: string; summary?: string; timeZone?: string }>;
}
