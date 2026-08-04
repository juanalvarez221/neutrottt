/** Identidad y canales oficiales Neutrottt. */
export const BRAND = {
  name: "Neutrottt",
  instagramHandle: "neutrottt",
  instagramUrl: "https://www.instagram.com/neutrottt/",
  whatsappPhone: "573127311382",
} as const;

export function whatsappUrl(message: string): string {
  return `https://wa.me/${BRAND.whatsappPhone}?text=${encodeURIComponent(message)}`;
}

/** Mensajes prearmados para WhatsApp. */
export const WHATSAPP_MESSAGES = {
  contact: "Hola quiero cotizar un tatuaje",
  quoteFollowUp: "Hola quiero seguir con mi cotización",
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
  return `Hola Neutro, soy ${clientName}. Tengo una consulta sobre mi asesoría ${modality} del ${slotLabel}.`;
}
