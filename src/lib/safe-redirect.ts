const CONTROL_OR_BACKSLASH = /[\\\u0000-\u001f\u007f]/;

/**
 * Accept only same-origin application paths for post-auth navigation.
 *
 * Backslashes are rejected because browsers normalize them as URL separators,
 * so values such as `/\\evil.example` can become protocol-relative URLs.
 * Absolute/protocol-relative URLs and control characters are rejected as well.
 */
export function isSafeAppPath(value: string | undefined): value is string {
  if (typeof value !== "string" || value.length === 0) return false;
  if (!value.startsWith("/") || value.startsWith("//")) return false;
  if (CONTROL_OR_BACKSLASH.test(value)) return false;

  try {
    const base = new URL("https://cobs.invalid");
    const resolved = new URL(value, base);
    return resolved.origin === base.origin && resolved.pathname.startsWith("/");
  } catch {
    return false;
  }
}
