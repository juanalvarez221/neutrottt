/**
 * Identidad de correo Neutrottt.
 * - Los clientes reciben correo saliente de la cuenta de marca.
 * - El artista recibe avisos internos en su bandeja de trabajo.
 * Las variables de entorno pueden sobreescribir estos valores.
 */
export const STUDIO_MAIL = {
  fromName: "Neutrottt",
  fromAddress: "neutrottt.tech@gmail.com",
  artistInbox: "gonzalezcardo06@gmail.com",
} as const;

export function getStudioFromHeader(): string {
  const configured =
    process.env.GMAIL_FROM_EMAIL?.trim() || process.env.RESEND_FROM_EMAIL?.trim();
  if (configured) return configured;
  return `${STUDIO_MAIL.fromName} <${STUDIO_MAIL.fromAddress}>`;
}

export function getStudioReplyTo(): string {
  return (
    process.env.GMAIL_REPLY_TO?.trim() ||
    process.env.RESEND_REPLY_TO?.trim() ||
    STUDIO_MAIL.fromAddress
  );
}
