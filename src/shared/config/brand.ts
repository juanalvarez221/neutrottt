export const BRAND = {
  name: "Neutrottt",
  nameUpper: "NEUTROTTT",
  instagramHandle: "neutrottt",
  instagramUrl: "https://www.instagram.com/neutrottt/",
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
