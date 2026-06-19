export const BRAND = {
  name: "Neutrottt",
  nameUpper: "NEUTROTTT",
  instagramHandle: "neutrottt",
  instagramUrl: "https://www.instagram.com/neutrottt/",
  tiktokHandle: "neutrottt",
  tiktokUrl: "https://www.tiktok.com/@neutrottt",
  whatsappPhone: "573127311382",
} as const;

export function whatsappUrl(message: string): string {
  return `https://wa.me/${BRAND.whatsappPhone}?text=${encodeURIComponent(message)}`;
}

export const WHATSAPP_MESSAGES = {
  quote: "Hola quiero cotizar un tatuaje ✴️🔥",
  quoteContinue: "Hola quiero continuar mi cotización ✴️🔥",
  quoteFollowUp: "Hola quiero seguir con mi cotización ✴️🔥",
  contact: "Hola quiero cotizar un tatuaje ✴️🔥",
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
  const modality = mode === "presencial" ? "presencial (30 min)" : "virtual (15 min)";
  return `Hola Neutro, soy ${clientName}. Confirmo mi asesoría ${modality} para ${slotLabel} ✴️`;
}
