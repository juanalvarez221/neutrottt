export type PraiseLang = "es" | "en";

type LocalePack = Record<PraiseLang, string[]>;

function pack(es: string[], en: string[]): LocalePack {
  return { es, en };
}

/** Saludos con/sin nombre. Usa {name} cuando aplica. */
export const GREETINGS_NAMED = pack(
  [
    "{name}, gracias por abrirte con tanta honestidad.",
    "{name}, se siente bien leerte así de claro.",
    "{name}, eso que compartiste tiene peso. Gracias.",
    "{name}, gracias por venir sin máscara.",
    "{name}, me llega cómo te presentas. De verdad.",
  ],
  [
    "{name}, thank you for opening up with such honesty.",
    "{name}, it feels good to read you this clearly.",
    "{name}, what you shared carries weight. Thank you.",
    "{name}, thank you for showing up without a mask.",
    "{name}, the way you present yourself lands. Truly.",
  ],
);

export const GREETINGS_ANON = pack(
  [
    "Gracias por abrirte con tanta honestidad.",
    "Se siente bien leerte así de claro.",
    "Eso que compartiste tiene peso. Gracias.",
    "Gracias por venir sin máscara.",
    "Me llega cómo te presentas. De verdad.",
  ],
  [
    "Thank you for opening up with such honesty.",
    "It feels good to read you this clearly.",
    "What you shared carries weight. Thank you.",
    "Thank you for showing up without a mask.",
    "The way you present yourself lands. Truly.",
  ],
);

export const SUBTITLES = pack(
  [
    "Así empieza una conexión que vale la pena.",
    "Hay sintonía. Sigamos con cuidado.",
    "Esto ya suena como un proceso real.",
    "Me gusta el tono. Aquí hay espacio para construir.",
    "Entre nosotros ya hay un idioma en común.",
  ],
  [
    "This is how a connection worth keeping starts.",
    "There is chemistry. Let's continue with care.",
    "This already sounds like a real process.",
    "I like the tone. There is room here to build.",
    "Between us, there is already a shared language.",
  ],
);

export const VALUES_LABEL = pack(
  ["Resuenas con", "En tu mapa aparecen", "Llevas contigo", "Te define"],
  ["You resonate with", "On your map appear", "You carry", "This shapes you"],
);

export const NOTE_ACK = pack(
  [
    "Lo que escribiste al final también cuenta. Gracias por decirlo.",
    "Tu nota final se siente: no era relleno. Gracias.",
    "Eso que agregaste al cierre aporta contexto de verdad. Gracias.",
  ],
  [
    "What you wrote at the end also counts. Thank you for saying it.",
    "Your final note lands: it was not filler. Thank you.",
    "What you added at the close brings real context. Thank you.",
  ],
);

export const FALLBACK_INSIGHT = pack(
  [
    "Hay una lectura clara en cómo llegaste hasta aquí. Sigamos con cuidado.",
    "Tu forma de responder ya dice bastante. El proceso puede empezar bien.",
  ],
  [
    "There is a clear read in how you arrived here. Let's continue with care.",
    "The way you answered already says a lot. The process can start well.",
  ],
);
