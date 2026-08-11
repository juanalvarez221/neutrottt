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

/** Mensajes prearmados para WhatsApp (listos para enviar, origen: sitio web). */
export const WHATSAPP_MESSAGES = {
  contact:
    "Hola Neutrottt, te contacto desde la web. Me interesa cotizar un proyecto de tatuaje y conocer disponibilidad.",
  quoteFollowUp:
    "Hola Neutrottt, te contacto desde la web. Completé el proceso de cotización y quiero continuar con la revisión de mi proyecto.",
  quoteInProgress:
    "Hola Neutrottt, te contacto desde la web. Estoy en medio de una cotización y necesito orientación para continuar.",
  quoteInProgressNamed:
    "Hola Neutrottt, soy {name}. Te contacto desde la web: estoy en medio de una cotización y necesito orientación para continuar.",
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
  return `Hola Neutrottt, soy ${clientName}. Te contacto desde la web: reservé una asesoría ${modality} para el ${slotLabel}.`;
}
