export const BRAND = {
  name: "Danniel Cuervo",
  nameUpper: "DANNIEL CUERVO",
  instagramHandle: "dannielcuervo",
  instagramUrl: "https://www.instagram.com/dannielcuervo/",
  tiktokHandle: "TODO: confirmar TikTok", // was dannielcuervo — unconfirmed
  tiktokUrl: "https://www.tiktok.com/@TODO-confirmar-TikTok",
  whatsappPhone: "573127311382",
} as const;

export function whatsappUrl(message: string): string {
  return `https://wa.me/${BRAND.whatsappPhone}?text=${encodeURIComponent(message)}`;
}

export const WHATSAPP_MESSAGES = {
  quote: "Hola quiero cotizar un tatuaje",
  quoteContinue: "Hola quiero continuar mi cotizacion",
  quoteFollowUp: "Hola quiero seguir con mi cotizacion",
  contact: "Hola quiero cotizar un tatuaje",
} as const;

export function buildAdvisoryWhatsAppMessage({
  mode,
  slotLabel,
  clientName,
}: {
  mode: "presencial" | "virtual";
  slotLabel: string;
  clientName: string;
}) {
  const modality = mode === "presencial" ? "presencial" : "virtual";
  return `Hola Danniel, soy ${clientName}. Tengo una consulta sobre mi asesoria ${modality} del ${slotLabel}.`;
}
