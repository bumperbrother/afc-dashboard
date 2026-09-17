/**
 * A single shared team password, held in a signed cookie. There is no user
 * directory here on purpose: the dashboard is for a handful of people, and
 * Notion already holds the real permissions.
 *
 * Everything here uses Web Crypto rather than node:crypto, because the same
 * verification runs inside middleware on the Edge runtime.
 */

export const SESSION_COOKIE = "afc_session";
export const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 30; // 30 days

function secret(): string {
  const value = process.env.SESSION_SECRET;
  if (value && value.length >= 16) return value;
  // A weak fallback keeps local development working; production sets the var.
  return "afc-dashboard-development-secret-do-not-use-in-production";
}

const encoder = new TextEncoder();

async function hmacKey(): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    "raw",
    encoder.encode(secret()),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
}

async function sign(payload: string): Promise<string> {
  const signature = await crypto.subtle.sign(
    "HMAC",
    await hmacKey(),
    encoder.encode(payload),
  );
  return [...new Uint8Array(signature)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

/** Mint a cookie value that encodes when the session was created. */
export async function createSessionToken(
  now: number = Date.now(),
): Promise<string> {
  const payload = String(now);
  return `${payload}.${await sign(payload)}`;
}

/** True when the token is well formed, correctly signed, and not expired. */
export async function verifySessionToken(
  token: string | undefined,
  now: number = Date.now(),
): Promise<boolean> {
  if (!token) return false;
  const separator = token.lastIndexOf(".");
  if (separator <= 0) return false;

  const payload = token.slice(0, separator);
  const signature = token.slice(separator + 1);
  if (!constantTimeEqual(signature, await sign(payload))) return false;

  const issuedAt = Number(payload);
  if (!Number.isFinite(issuedAt)) return false;
  const ageSeconds = (now - issuedAt) / 1000;
  return ageSeconds >= 0 && ageSeconds < SESSION_MAX_AGE_SECONDS;
}

/** Compare the submitted password with the configured one. */
export function passwordMatches(submitted: string): boolean {
  const expected = process.env.DASHBOARD_PASSWORD;
  if (!expected) return false;
  return constantTimeEqual(submitted, expected);
}

/** True when no password is configured, which we surface rather than hide. */
export function isPasswordConfigured(): boolean {
  return Boolean(process.env.DASHBOARD_PASSWORD);
}

/**
 * Compare two strings without an early return on the first differing byte.
 * Length still differs observably; that is acceptable for a shared password.
 */
function constantTimeEqual(a: string, b: string): boolean {
  const bytesA = encoder.encode(a);
  const bytesB = encoder.encode(b);
  if (bytesA.length !== bytesB.length) return false;

  let difference = 0;
  for (let i = 0; i < bytesA.length; i++) {
    difference |= bytesA[i] ^ bytesB[i];
  }
  return difference === 0;
}
