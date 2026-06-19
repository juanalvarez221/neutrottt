/**
 * Helper compartido para hablar con Upstash Redis vía su API REST.
 * No requiere instalar @upstash/redis: usa fetch directo.
 */
export function hasUpstashConfig() {
  return Boolean(
    process.env.UPSTASH_REDIS_REST_URL?.trim() &&
      process.env.UPSTASH_REDIS_REST_TOKEN?.trim(),
  );
}

export async function upstashCommand<T = unknown>(
  command: (string | number)[],
): Promise<T | null> {
  const baseUrl = process.env.UPSTASH_REDIS_REST_URL?.trim();
  const token = process.env.UPSTASH_REDIS_REST_TOKEN?.trim();

  if (!baseUrl || !token) {
    throw new Error("Upstash Redis no está configurado (faltan URL o token).");
  }

  const response = await fetch(baseUrl, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(command),
    cache: "no-store",
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(`Upstash Redis respondió ${response.status}. ${detail}`.trim());
  }

  const payload = (await response.json()) as { result?: T };
  return payload.result ?? null;
}

export function isProductionRuntime() {
  return process.env.NODE_ENV === "production";
}
