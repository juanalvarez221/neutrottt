import { BRAND } from "@/shared/config/brand";
import { formatCop } from "@/shared/lib/quoteSessionPricing";
import type { QuoteRequestRecord } from "@/shared/lib/storage/quoteRequestStore.server";
import { sendBrandedEmail } from "@/shared/lib/notifications/emailTransport.server";
import {
  wrapStudioEmail,
  type EmailFact,
} from "@/shared/lib/notifications/emailBrandLayout.server";

export type OfficialQuoteEmailInput = {
  clientName: string;
  email: string;
  projectSize: string;
  bodyPlacement: string;
  sessionPrice: number;
  sessionCount: number;
  note?: string;
};

export function buildOfficialQuoteFacts(input: OfficialQuoteEmailInput): EmailFact[] {
  const total = input.sessionPrice * input.sessionCount;
  const facts: EmailFact[] = [
    { label: "Pieza", value: [input.projectSize, input.bodyPlacement].filter(Boolean).join(" · ") || "Por definir" },
    { label: "Sesiones", value: `${input.sessionCount} aprox.` },
    { label: "Por sesión", value: formatCop(input.sessionPrice) },
    { label: "Total", value: formatCop(total) },
  ];
  if (input.note?.trim()) {
    facts.push({ label: "Nota de Neutro", value: input.note.trim() });
  }
  return facts;
}

export function buildOfficialQuoteDetailsText(input: OfficialQuoteEmailInput) {
  return buildOfficialQuoteFacts(input)
    .map((fact) => `${fact.label}: ${fact.value}`)
    .join("\n");
}

export async function sendOfficialQuoteEmail(record: QuoteRequestRecord) {
  const email = record.email?.trim();
  if (!email) {
    return { ok: false as const, preview: false, reason: "sin_correo" as const };
  }
  if (!record.officialSessionPrice || !record.officialSessionCount) {
    return { ok: false as const, preview: false, reason: "sin_cifra" as const };
  }

  const payload: OfficialQuoteEmailInput = {
    clientName: record.clientName,
    email,
    projectSize: record.projectSize,
    bodyPlacement: record.bodyPlacement,
    sessionPrice: record.officialSessionPrice,
    sessionCount: record.officialSessionCount,
    note: record.officialNote,
  };

  const total = formatCop(payload.sessionPrice * payload.sessionCount);
  const subject = `${BRAND.name} · Cotización lista · ${total}`;
  const closing =
    "Si quieres sentarte, responde este correo. Neutro te escribe para agendar.";
  const text = [
    `${BRAND.name}`,
    "Experto en sombras y lettering",
    "",
    `${payload.clientName},`,
    "",
    "Ya está lista tu cotización.",
    "",
    buildOfficialQuoteDetailsText(payload),
    "",
    closing,
    "",
    BRAND.name,
  ].join("\n");

  return sendBrandedEmail({
    to: email,
    subject,
    html: wrapStudioEmail({
      kicker: "Cotización",
      headline: payload.clientName,
      lead: "Ya está lista tu cotización. Esta es la cifra oficial.",
      facts: buildOfficialQuoteFacts(payload),
      closing,
    }),
    text,
  });
}
