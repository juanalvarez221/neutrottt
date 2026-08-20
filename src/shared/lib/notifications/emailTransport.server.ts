import { STUDIO_MAIL, getStudioFromHeader, getStudioReplyTo } from "@/shared/config/mail";
import { getGmailSmtpConfig, sendViaGmailSmtp } from "@/shared/lib/notifications/gmailSmtp.server";

/**
 * Transporte de email (Gmail SMTP).
 * Si faltan credenciales, se loguea un preview y no se rompe el flujo.
 *
 * From: cuenta de marca (neutrottt.tech@gmail.com).
 * To interno: bandeja del artista (gonzalezcardo06@gmail.com).
 */
export type EmailPayload = {
  to: string;
  subject: string;
  html: string;
  text: string;
  replyTo?: string;
};

export type EmailResult = { ok: boolean; preview: boolean };

export async function sendBrandedEmail(payload: EmailPayload): Promise<EmailResult> {
  const from = getStudioFromHeader();
  const fromAddress = STUDIO_MAIL.fromAddress;
  const replyTo = payload.replyTo?.trim() || getStudioReplyTo();
  const smtp = getGmailSmtpConfig();

  if (!smtp) {
    console.info("[email:preview]", payload.subject, "→", payload.to, "replyTo:", replyTo);
    console.info(payload.text);
    return { ok: true, preview: true };
  }

  try {
    await sendViaGmailSmtp({
      fromHeader: from,
      fromAddress,
      to: payload.to,
      replyTo,
      subject: payload.subject,
      text: payload.text,
      html: payload.html,
    });
    return { ok: true, preview: false };
  } catch (error) {
    console.error("[email:error]", error instanceof Error ? error.message : String(error));
    return { ok: false, preview: false };
  }
}

/**
 * Email del artista/estudio para notificaciones internas.
 * Prioriza ARTIST_NOTIFICATIONS_EMAIL; si falta, usa la bandeja de trabajo configurada.
 */
export function getArtistNotificationsEmail(): string | null {
  return process.env.ARTIST_NOTIFICATIONS_EMAIL?.trim() || STUDIO_MAIL.artistInbox;
}
