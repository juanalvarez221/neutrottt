import { BRAND } from "@/shared/config/brand";

/**
 * Transporte de email compartido (Resend + fallback preview en consola).
 * Mismo comportamiento que usaba advisoryNotifications: si no hay RESEND_API_KEY,
 * se loguea un preview y se considera ok (no rompe ningún flujo).
 */
export type EmailPayload = {
  to: string;
  subject: string;
  html: string;
  text: string;
};

export type EmailResult = { ok: boolean; preview: boolean };

export async function sendBrandedEmail(payload: EmailPayload): Promise<EmailResult> {
  const apiKey = process.env.RESEND_API_KEY?.trim();
  const from = process.env.RESEND_FROM_EMAIL?.trim() ?? `${BRAND.name} <onboarding@resend.dev>`;

  if (!apiKey) {
    console.info("[email:preview]", payload.subject, "→", payload.to);
    console.info(payload.text);
    return { ok: true, preview: true };
  }

  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from,
        to: [payload.to],
        subject: payload.subject,
        html: payload.html,
        text: payload.text,
      }),
    });

    if (!response.ok) {
      const detail = await response.text().catch(() => "");
      console.error("[email:error]", response.status, detail);
      return { ok: false, preview: false };
    }

    return { ok: true, preview: false };
  } catch (error) {
    console.error("[email:error]", error instanceof Error ? error.message : String(error));
    return { ok: false, preview: false };
  }
}

/**
 * Email del artista/estudio para notificaciones internas.
 * Si no está configurado, devuelve null (el llamador hace preview/log).
 */
export function getArtistNotificationsEmail(): string | null {
  return process.env.ARTIST_NOTIFICATIONS_EMAIL?.trim() || null;
}
