export const BRAND = {
  name: "Danniel Cuervo",
  nameUpper: "DANNIEL CUERVO",
  logoSrc: "/brand/logo-dc-monogram.png",
  logoMarkSrc: "/brand/logo-dc-mark.png",
  instagramHandle: "dannielcuervo",
  instagramUrl: "https://www.instagram.com/dannielcuervo/",
  tiktokHandle: "dannielcuervoletters",
  tiktokUrl: "https://www.tiktok.com/@dannielcuervoletters",
  /** E.164 sin + ni espacios — usado en wa.me */
  whatsappPhone: "573150451494",
  whatsappDisplay: "+57 315 0451494",
} as const;

export function whatsappUrl(message: string): string {
  return `https://wa.me/${BRAND.whatsappPhone}?text=${encodeURIComponent(message)}`;
}

export const WHATSAPP_MESSAGES = {
  quote:
    "Hola Danniel, ¿cómo estás? Me gustaría cotizar un tatuaje contigo. Te cuento mi idea, el tamaño aproximado y la zona del cuerpo:",
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
