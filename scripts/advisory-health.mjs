/**
 * Diagnóstico rápido de Google Calendar desde terminal (sin depender de Next).
 * Uso: npm run advisory:health
 */
import { readFileSync } from "node:fs";
import { createSign } from "node:crypto";
import { join } from "node:path";

function loadEnvLocal() {
  try {
    const raw = readFileSync(join(process.cwd(), ".env.local"), "utf8");
    for (const line of raw.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eq = trimmed.indexOf("=");
      if (eq === -1) continue;
      const key = trimmed.slice(0, eq).trim();
      let value = trimmed.slice(eq + 1).trim();
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }
      if (!process.env[key]) process.env[key] = value;
    }
  } catch {
    console.warn("No se encontró .env.local");
  }
}

function base64url(input) {
  return Buffer.from(input)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

async function getAccessToken(clientEmail, privateKey) {
  const now = Math.floor(Date.now() / 1000);
  const header = base64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claims = base64url(
    JSON.stringify({
      iss: clientEmail,
      scope: "https://www.googleapis.com/auth/calendar",
      aud: "https://oauth2.googleapis.com/token",
      iat: now,
      exp: now + 3600,
    }),
  );
  const data = `${header}.${claims}`;
  const signer = createSign("RSA-SHA256");
  signer.update(data);
  signer.end();
  const signature = signer
    .sign(privateKey.replace(/\\n/g, "\n"))
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");

  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: `${data}.${signature}`,
    }),
  });

  const body = await response.text();
  if (!response.ok) {
    throw new Error(`Token falló (${response.status}): ${body}`);
  }
  const json = JSON.parse(body);
  if (!json.access_token) throw new Error("Sin access_token en respuesta.");
  return json.access_token;
}

async function main() {
  loadEnvLocal();

  const enabled = process.env.GOOGLE_CALENDAR_ENABLED?.trim().toLowerCase() === "true";
  console.log(`GOOGLE_CALENDAR_ENABLED: ${enabled}`);

  if (!enabled) {
    console.log("Calendar desactivado. La agenda interna funciona igual.");
    return;
  }

  const calendarId = process.env.GOOGLE_CALENDAR_ID?.trim();
  const clientEmail = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL?.trim();
  const rawKey = process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY;
  const privateKey = rawKey?.includes("\\n") ? rawKey.replace(/\\n/g, "\n") : rawKey;

  if (!calendarId || !clientEmail || !privateKey?.trim()) {
    console.error("Faltan GOOGLE_CALENDAR_ID, GOOGLE_SERVICE_ACCOUNT_EMAIL o PRIVATE_KEY.");
    process.exit(1);
  }

  console.log(`Calendar ID: ${calendarId}`);
  console.log(`Service account: ${clientEmail}`);

  try {
    const token = await getAccessToken(clientEmail, privateKey);
    console.log("Token: OK");

    const now = new Date();
    const response = await fetch("https://www.googleapis.com/calendar/v3/freeBusy", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        timeMin: now.toISOString(),
        timeMax: new Date(now.getTime() + 3_600_000).toISOString(),
        timeZone: "America/Bogota",
        items: [{ id: calendarId }],
      }),
    });

    const body = await response.text();
    if (!response.ok) {
      throw new Error(`freeBusy falló (${response.status}): ${body}`);
    }

    const json = JSON.parse(body);
    const busy = json.calendars?.[calendarId]?.busy ?? [];
    console.log(`freeBusy: OK (${busy.length} bloque(s) en la próxima hora)`);

    const testEvent = await fetch(
      `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          summary: "[TEST] Neutrottt — borrar",
          description: "Evento de prueba del diagnóstico. Puedes eliminarlo.",
          start: { dateTime: new Date(now.getTime() + 7 * 86_400_000).toISOString(), timeZone: "America/Bogota" },
          end: { dateTime: new Date(now.getTime() + 7 * 86_400_000 + 15 * 60_000).toISOString(), timeZone: "America/Bogota" },
        }),
      },
    );

    const eventBody = await testEvent.text();
    if (!testEvent.ok) {
      console.error(`\nCrear evento: FALLO (${testEvent.status})`);
      console.error(eventBody);
      if (testEvent.status === 403) {
        console.error(
          "\n→ Comparte el calendario con el service account y dale permiso de editar eventos.",
        );
      }
      process.exit(1);
    }

    const event = JSON.parse(eventBody);
    console.log(`Crear evento: OK (id ${event.id})`);
    console.log("\nIntegración lista. Elimina el evento [TEST] en Google Calendar si quieres.");
  } catch (error) {
    console.error("\nERROR:", error instanceof Error ? error.message : error);
    process.exit(1);
  }
}

main();
