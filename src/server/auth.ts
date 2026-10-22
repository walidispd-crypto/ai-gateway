export const SESSION_COOKIE = "ai_session";
export const SESSION_TTL_SECONDS = 60 * 60 * 24 * 30;

const encoder = new TextEncoder();

function toBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/** Hashes both inputs first so the comparison never depends on their length. */
export async function constantTimeEqual(a: string, b: string): Promise<boolean> {
  const [left, right] = await Promise.all([
    crypto.subtle.digest("SHA-256", encoder.encode(a)),
    crypto.subtle.digest("SHA-256", encoder.encode(b)),
  ]);
  const aBytes = new Uint8Array(left);
  const bBytes = new Uint8Array(right);
  let diff = 0;
  for (let i = 0; i < aBytes.length; i += 1) diff |= aBytes[i]! ^ bBytes[i]!;
  return diff === 0;
}

async function hmac(secret: string, payload: string): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(payload));
  return new Uint8Array(signature);
}

export async function createSessionToken(
  secret: string,
  now = Date.now(),
  ttlSeconds = SESSION_TTL_SECONDS,
): Promise<string> {
  const expiresAt = String(now + ttlSeconds * 1000);
  const signature = toBase64Url(await hmac(secret, expiresAt));
  return `${expiresAt}.${signature}`;
}

export async function verifySessionToken(
  token: string | undefined,
  secret: string,
  now = Date.now(),
): Promise<boolean> {
  if (!token) return false;
  const [expiresAt, signature] = token.split(".");
  if (!expiresAt || !signature) return false;

  const expires = Number(expiresAt);
  if (!Number.isSafeInteger(expires) || expires <= now) return false;

  const expected = toBase64Url(await hmac(secret, expiresAt));
  if (expected.length !== signature.length) return false;
  let diff = 0;
  for (let i = 0; i < expected.length; i += 1) {
    diff |= expected.charCodeAt(i) ^ signature.charCodeAt(i);
  }
  return diff === 0;
}

export function getSessionSecret(): string | null {
  const secret = process.env.SESSION_SECRET;
  return secret && secret.length >= 32 ? secret : null;
}
