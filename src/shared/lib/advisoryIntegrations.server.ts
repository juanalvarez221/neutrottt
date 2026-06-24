import {
  getGoogleCalendarConfig,
  isGoogleCalendarEnabled,
} from "@/shared/lib/googleCalendar/googleCalendarConfig";
import { getGoogleAccessToken } from "@/shared/lib/googleCalendar/googleAuth.server";
import { queryBusyIntervals } from "@/shared/lib/googleCalendar/googleCalendarClient.server";
import { loadAdvisoryStore } from "@/shared/lib/advisoryStore.server";
import { getArtistNotificationsEmail } from "@/shared/lib/notifications/emailTransport.server";
import { resolveAdvisoryStorage } from "@/shared/lib/storage/resolveAdvisoryStorage.server";
import { hasUpstashConfig } from "@/shared/lib/storage/upstashRest.server";
import { getSiteOrigin } from "@/shared/lib/siteOrigin.server";

export type IntegrationState = "ok" | "preview" | "disabled" | "error";

export type IntegrationCheck = {
  id: string;
  label: string;
  state: IntegrationState;
  detail: string;
  hint?: string;
};

function googleErrorHint(message: string): string | undefined {
  const lower = message.toLowerCase();
  if (lower.includes("403") || lower.includes("forbidden")) {
    return `En Google Calendar, comparte el calendario con el service account y dale permiso de "Hacer cambios en eventos".`;
  }
  if (lower.includes("401") || lower.includes("invalid_grant") || lower.includes("unauthorized")) {
    return "Revisa GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY (comillas, \\n) y que el service account siga activo.";
  }
  if (lower.includes("404") || lower.includes("not found")) {
    return "Verifica GOOGLE_CALENDAR_ID (en calendarios personales suele ser tu correo de Gmail).";
  }
  if (lower.includes("no respondió a tiempo")) {
    return "Google tardó demasiado. La agenda interna sigue funcionando; el sync con Calendar puede fallar.";
  }
  return undefined;
}

async function checkGoogleCalendar(): Promise<IntegrationCheck> {
  if (!isGoogleCalendarEnabled()) {
    return {
      id: "google-calendar",
      label: "Google Calendar",
      state: "disabled",
      detail: "Integración desactivada (GOOGLE_CALENDAR_ENABLED no es true).",
      hint: "La agenda interna y las reservas funcionan sin Google.",
    };
  }

  try {
    const config = getGoogleCalendarConfig();
    if (!config) {
      return {
        id: "google-calendar",
        label: "Google Calendar",
        state: "disabled",
        detail: "Configuración incompleta.",
      };
    }

    await getGoogleAccessToken(config);
    const now = new Date();
    const busy = await queryBusyIntervals(
      config,
      now.toISOString(),
      new Date(now.getTime() + 3_600_000).toISOString(),
    );

    return {
      id: "google-calendar",
      label: "Google Calendar",
      state: "ok",
      detail: `Conectado a ${config.calendarId}. ${busy.length} bloque(s) ocupado(s) en la próxima hora.`,
      hint: config.createMeet
        ? "Meet activo para virtuales (requiere Google Workspace)."
        : "Meet desactivado (correcto para Gmail personal).",
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      id: "google-calendar",
      label: "Google Calendar",
      state: "error",
      detail: message,
      hint: googleErrorHint(message),
    };
  }
}

function checkEmail(): IntegrationCheck {
  const hasResend = Boolean(process.env.RESEND_API_KEY?.trim());
  const artistEmail = getArtistNotificationsEmail();

  if (!hasResend) {
    return {
      id: "email",
      label: "Correo (Resend)",
      state: "preview",
      detail: "Sin RESEND_API_KEY: los emails se imprimen en consola del servidor.",
      hint: "Define RESEND_API_KEY y RESEND_FROM_EMAIL para envío real.",
    };
  }

  return {
    id: "email",
    label: "Correo (Resend)",
    state: "ok",
    detail: artistEmail
      ? `Resend configurado. Notificaciones internas → ${artistEmail}`
      : "Resend configurado. Falta ARTIST_NOTIFICATIONS_EMAIL para avisos al artista.",
    hint: artistEmail ? undefined : "Añade ARTIST_NOTIFICATIONS_EMAIL en .env.local",
  };
}

function checkWhatsApp(): IntegrationCheck {
  const sid = process.env.TWILIO_ACCOUNT_SID?.trim();
  const token = process.env.TWILIO_AUTH_TOKEN?.trim();
  const from = process.env.TWILIO_WHATSAPP_FROM?.trim();

  if (!sid || !token || !from) {
    return {
      id: "whatsapp",
      label: "WhatsApp (Twilio)",
      state: "preview",
      detail: "Twilio no configurado: los mensajes de recordatorio se loguean en consola.",
      hint: "Define TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN y TWILIO_WHATSAPP_FROM.",
    };
  }

  return {
    id: "whatsapp",
    label: "WhatsApp (Twilio)",
    state: "ok",
    detail: `Twilio activo. Remitente: ${from}`,
  };
}

async function checkStorage(): Promise<IntegrationCheck> {
  try {
    const adapter = resolveAdvisoryStorage();
    const store = await loadAdvisoryStore();
    const activeBookings = store.bookings.filter(
      (b) => b.status === "reserved" || b.status === "confirmed",
    ).length;

    return {
      id: "storage",
      label: "Almacenamiento",
      state: "ok",
      detail:
        adapter.name === "redis"
          ? `Upstash Redis · ${activeBookings} reserva(s) activa(s)`
          : `Archivo local (dev) · ${activeBookings} reserva(s) activa(s)`,
      hint:
        adapter.name === "file" && process.env.NODE_ENV === "production"
          ? "En producción debes usar Upstash Redis."
          : hasUpstashConfig()
            ? undefined
            : "En local se usa data/advisory-store.json",
    };
  } catch (error) {
    return {
      id: "storage",
      label: "Almacenamiento",
      state: "error",
      detail: error instanceof Error ? error.message : "No se pudo cargar la agenda.",
      hint: "En Vercel define UPSTASH_REDIS_REST_URL y UPSTASH_REDIS_REST_TOKEN.",
    };
  }
}

function checkSiteOrigin(): IntegrationCheck {
  const configured = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  const origin = getSiteOrigin();

  if (!configured && !process.env.VERCEL_URL?.trim()) {
    return {
      id: "site-url",
      label: "Enlaces en mensajes",
      state: "preview",
      detail: `Usando ${origin} (local). En producción define NEXT_PUBLIC_SITE_URL.`,
      hint: "Los links de confirmar/reagendar en emails salen de esta URL.",
    };
  }

  return {
    id: "site-url",
    label: "Enlaces en mensajes",
    state: "ok",
    detail: `Origen: ${origin}`,
  };
}

function checkCron(): IntegrationCheck {
  const secret = process.env.CRON_SECRET?.trim();
  if (process.env.NODE_ENV === "production" && !secret) {
    return {
      id: "cron",
      label: "Recordatorios automáticos",
      state: "error",
      detail: "Falta CRON_SECRET en producción.",
      hint: "Vercel Cron llama /api/cron/advisory-reminders con Bearer CRON_SECRET.",
    };
  }

  return {
    id: "cron",
    label: "Recordatorios automáticos",
    state: secret ? "ok" : "preview",
    detail: secret
      ? "Cron configurado (Vercel: diario 14:00 UTC)."
      : "En local puedes ejecutar recordatorios desde el panel admin.",
  };
}

export async function getAdvisoryIntegrationHealth() {
  const [googleCalendar, storage] = await Promise.all([checkGoogleCalendar(), checkStorage()]);
  const checks = [
    storage,
    googleCalendar,
    checkEmail(),
    checkWhatsApp(),
    checkSiteOrigin(),
    checkCron(),
  ];

  const hasError = checks.some((check) => check.state === "error");
  const hasPreview = checks.some((check) => check.state === "preview");

  return {
    ok: !hasError,
    mode: hasError ? "error" : hasPreview ? "preview" : "live",
    checks,
    checkedAt: new Date().toISOString(),
  };
}
