/**
 * Sesión admin firmada con HMAC-SHA256 vía Web Crypto.
 * Funciona tanto en el runtime Edge (middleware) como en Node (route handlers).
 * NUNCA importar desde componentes client: usa secretos del servidor.
 */
export const ADMIN_SESSION_COOKIE = "neutrottt_admin_session";

/** Duración de la sesión: 10 horas. */
export const ADMIN_SESSION_TTL_SECONDS = 10 * 60 * 60;

function bytesToBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function base64UrlToBytes(value: string): Uint8Array {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized + "=".repeat((4 - (normalized.length % 4)) % 4);
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

/** Comparación en tiempo constante para evitar timing attacks. */
export function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let result = 0;
  for (let i = 0; i < a.length; i += 1) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return result === 0;
}

async function hmacSign(secret: string, data: string): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(data));
  return new Uint8Array(signature);
}

/** Crea un token de sesión firmado. El payload solo contiene la expiración. */
export async function signSessionToken(
  secret: string,
  ttlSeconds = ADMIN_SESSION_TTL_SECONDS,
): Promise<string> {
  const exp = Date.now() + ttlSeconds * 1000;
  const payload = bytesToBase64Url(new TextEncoder().encode(JSON.stringify({ exp })));
  const signature = bytesToBase64Url(await hmacSign(secret, payload));
  return `${payload}.${signature}`;
}

/** Verifica firma y expiración del token. */
export async function verifySessionToken(
  secret: string,
  token: string | undefined | null,
): Promise<boolean> {
  if (!secret || !token) return false;
  const [payload, signature] = token.split(".");
  if (!payload || !signature) return false;

  const expected = bytesToBase64Url(await hmacSign(secret, payload));
  if (!timingSafeEqual(signature, expected)) return false;

  try {
    const data = JSON.parse(new TextDecoder().decode(base64UrlToBytes(payload))) as {
      exp?: number;
    };
    if (typeof data.exp !== "number" || Date.now() > data.exp) return false;
    return true;
  } catch {
    return false;
  }
}

/** PIN principal (ADMIN_PIN) con ADMIN_PASSWORD como alias. */
export function getAdminCredential(): string | null {
  return process.env.ADMIN_PIN?.trim() || process.env.ADMIN_PASSWORD?.trim() || null;
}

export function getAdminSessionSecret(): string | null {
  return process.env.ADMIN_SESSION_SECRET?.trim() || null;
}

export function verifyAdminCredential(input: string): boolean {
  const expected = getAdminCredential();
  if (!expected) return false;
  return timingSafeEqual(input, expected);
}
