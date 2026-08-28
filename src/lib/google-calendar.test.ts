import { describe, expect, test } from "bun:test";
import {
  buildGoogleAuthorizationUrl,
  createOAuthState,
  encryptGoogleToken,
  verifyOAuthState,
} from "./google-calendar.server";

describe("Google Calendar OAuth", () => {
  test("round-trips a signed state and rejects tampering", () => {
    const state = createOAuthState({ userId: "user-1", tenantId: "tenant-1" }, "secret");
    expect(verifyOAuthState(state, "secret")).toEqual({ userId: "user-1", tenantId: "tenant-1" });
    expect(verifyOAuthState(`${state}x`, "secret")).toBeNull();
  });
  test("requests offline incremental calendar access", () => {
    const url = new URL(
      buildGoogleAuthorizationUrl(
        {
          clientId: "client",
          clientSecret: "secret",
          redirectUri: "https://cobs.test/api/google-calendar/callback",
          stateSecret: "state",
          tokenSecret: "tokens",
        },
        "signed",
      ),
    );
    expect(url.searchParams.get("access_type")).toBe("offline");
    expect(url.searchParams.get("include_granted_scopes")).toBe("true");
    expect(url.searchParams.get("state")).toBe("signed");
  });
  test("never stores a Google token as plaintext", () => {
    const encrypted = encryptGoogleToken("refresh-token", "encryption-secret");
    expect(encrypted).not.toContain("refresh-token");
    expect(encrypted.startsWith("v1.")).toBe(true);
  });
});
