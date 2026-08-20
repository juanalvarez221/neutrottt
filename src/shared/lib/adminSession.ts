/**
 * Sesión admin firmada con HMAC-SHA256 vía Web Crypto.
 * Funciona en Edge (proxy) y Node. No importar desde Client Components.
 */
import { esCorreoAdmin } from "@/shared/lib/adminEmail";

export const LEGACY_ADMIN_SESSION_COOKIE = "neutrottt_admin_session";

/** Prefijo __Host- exige Secure, Path=/ y sin Domain. Solo en producción. */
export const ADMIN_SESSION_COOKIE =
  process.env.NODE_ENV === "production" ? "__Host-ntt_admin" : LEGACY_ADMIN_SESSION_COOKIE;

/** Duración de la sesión: 4 horas. */
export const ADMIN_SESSION_TTL_SECONDS = 4 * 60 * 60;

const SESSION_VERSION = 1;

export function adminSessionCookieAttrs(maxAge: number) {
  return {
    httpOnly: true as const,
    sameSite: "strict" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/" as const,
    maxAge,
  };
}

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

/** Crea un token de sesión firmado. El correo nominado es obligatorio. */
export async function signSessionToken(
  secret: string,
  email: string,
  ttlSeconds = ADMIN_SESSION_TTL_SECONDS,
): Promise<string> {
  const normalized = email.trim().toLowerCase();
  if (!esCorreoAdmin(normalized)) {
    throw new Error("invalid admin email");
  }
  const exp = Date.now() + ttlSeconds * 1000;
  const payload = bytesToBase64Url(
    new TextEncoder().encode(JSON.stringify({ v: SESSION_VERSION, exp, email: normalized })),
  );
  const signature = bytesToBase64Url(await hmacSign(secret, payload));
  return `${payload}.${signature}`;
}

type SessionPayload = {
  v?: number;
  exp?: number;
  email?: string;
};

/** Verifica firma, versión, expiración y correo nominado. */
export async function verifySessionToken(
  secret: string,
  token: string | undefined | null,
): Promise<boolean> {
  return (await readSessionEmail(secret, token)) !== null;
}

export async function readSessionEmail(
  secret: string,
  token: string | undefined | null,
): Promise<string | null> {
  if (!secret || !token) return null;
  const [payload, signature] = token.split(".");
  if (!payload || !signature) return null;

  const expected = bytesToBase64Url(await hmacSign(secret, payload));
  if (!timingSafeEqual(signature, expected)) return null;

  try {
    const data = JSON.parse(new TextDecoder().decode(base64UrlToBytes(payload))) as SessionPayload;
    if (data.v !== SESSION_VERSION) return null;
    if (typeof data.exp !== "number" || Date.now() > data.exp) return null;
    if (typeof data.email !== "string" || !esCorreoAdmin(data.email)) return null;
    return data.email;
  } catch {
    return null;
  }
}

export function getAdminSessionSecret(): string | null {
  return process.env.ADMIN_SESSION_SECRET?.trim() || null;
}
