/**
 * Configuración de la integración opcional con Google Calendar.
 * - Si GOOGLE_CALENDAR_ENABLED no es "true" → integración deshabilitada (la app funciona igual).
 * - Si está habilitada pero faltan variables críticas → error claro (no silencioso).
 * Todo vive server-side; nunca se expone al cliente.
 */
export type GoogleCalendarConfig = {
  calendarId: string;
  clientEmail: string;
  privateKey: string;
  createMeet: boolean;
};

export function isGoogleCalendarEnabled(): boolean {
  return process.env.GOOGLE_CALENDAR_ENABLED?.trim().toLowerCase() === "true";
}

/**
 * Devuelve la config o null si la integración está deshabilitada.
 * Lanza error si está habilitada pero incompleta.
 */
export function getGoogleCalendarConfig(): GoogleCalendarConfig | null {
  if (!isGoogleCalendarEnabled()) return null;

  const calendarId = process.env.GOOGLE_CALENDAR_ID?.trim();
  const clientEmail = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL?.trim();
  const rawKey = process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY;

  if (!calendarId || !clientEmail || !rawKey?.trim()) {
    throw new Error(
      "GOOGLE_CALENDAR_ENABLED=true pero faltan variables críticas: " +
        "define GOOGLE_CALENDAR_ID, GOOGLE_SERVICE_ACCOUNT_EMAIL y GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY.",
    );
  }

  // Admite saltos de línea escapados (\n) o reales.
  const privateKey = rawKey.includes("\\n") ? rawKey.replace(/\\n/g, "\n") : rawKey;

  const createMeetSetting = process.env.GOOGLE_CALENDAR_CREATE_MEET?.trim().toLowerCase();
  const createMeet = createMeetSetting === undefined ? true : createMeetSetting === "true";

  return {
    calendarId,
    clientEmail,
    privateKey,
    createMeet,
  };
}
