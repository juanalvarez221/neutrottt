/**
 * Sesión admin firmada con HMAC-SHA256 vía Web Crypto.
 * Funciona en Edge (proxy) y Node. No importar desde Client Components.
 */
import { esCorreoValido, normalizarCorreo } from "@/shared/lib/adminEmail";

export const ADMIN_SESSION_COOKIE = "ntt_admin";

/** Nombre anterior; se borra al entrar o salir. */
export const ADMIN_SESSION_COOKIE_LEGACY = ["neutrottt_admin_session"] as const;

export const ADMIN_SESSION_COOKIE_CANDIDATES = [
  ADMIN_SESSION_COOKIE,
  ...ADMIN_SESSION_COOKIE_LEGACY,
] as const;

/** Duración de la sesión: 8 horas. */
export const ADMIN_SESSION_TTL_SECONDS = 8 * 60 * 60;

const SESSION_VERSION = 2;

export function adminSessionCookieAttrs(maxAge: number) {
  return {
    httpOnly: true as const,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/" as const,
    maxAge,
  };
}

export function readSessionCookieValue(
  getCookie: (name: string) => string | undefined,
): string | undefined {
  for (const name of ADMIN_SESSION_COOKIE_CANDIDATES) {
    const value = getCookie(name);
    if (value) return value;
  }
  return undefined;
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
  const normalized = normalizarCorreo(email);
  if (!esCorreoValido(normalized)) {
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
    if (typeof data.email !== "string" || !esCorreoValido(data.email)) return null;
    return data.email;
  } catch {
    return null;
  }
}

export function getAdminSessionSecret(): string | null {
  return process.env.ADMIN_SESSION_SECRET?.trim() || null;
}
