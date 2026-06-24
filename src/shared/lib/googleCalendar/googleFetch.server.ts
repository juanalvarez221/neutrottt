const DEFAULT_TIMEOUT_MS = 12_000;

/**
 * fetch con timeout para evitar que freeBusy/token cuelguen la agenda pública.
 */
export async function googleFetch(
  url: string,
  init?: RequestInit,
  timeoutMs = DEFAULT_TIMEOUT_MS,
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetch(url, {
      ...init,
      signal: controller.signal,
      cache: "no-store",
    });
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error(`Google Calendar no respondió a tiempo (${timeoutMs}ms).`);
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
}
