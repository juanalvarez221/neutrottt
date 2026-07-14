import type { AdjustmentOption, PersonalValue } from "@/shared/lib/quoteConnection";

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

/** Núcleo profundo por valor. */
export const VALUE_ESSENCE: Record<PersonalValue, LocalePack> = {
  duality: pack(
    [
      "Habitar la dualidad es aceptar que lo opuesto también te construye.",
      "La dualidad no te divide: te vuelve más legible en capas.",
      "Quien carga dualidad suele tatuarse con honestidad, no con pose.",
    ],
    [
      "Living duality means accepting that your opposite also builds you.",
      "Duality does not split you: it makes you readable in layers.",
      "Those who carry duality often tattoo with honesty, not posture.",
    ],
  ),
  joy: pack(
    [
      "La alegría como fuerza interior pide piezas que vibren sin perdón.",
      "Elegir alegría no es liviano: es decidir qué luz llevar encima.",
      "Cuando la alegría es tuya de verdad, el trazo busca vitalidad.",
    ],
    [
      "Joy as an inner force asks for pieces that vibrate without apology.",
      "Choosing joy is not light: it is deciding which light to wear.",
      "When joy is truly yours, the line looks for vitality.",
    ],
  ),
  light: pack(
    [
      "Elegir la luz es una decisión consciente, y eso se nota en la piel.",
      "La luz que buscas no ciega: ordena, limpia, sostiene.",
      "Quien elige luz suele querer piezas con presencia, no ruido.",
    ],
    [
      "Choosing light is a conscious decision, and skin shows it.",
      "The light you seek does not blind: it orders, clears, holds.",
      "Those who choose light usually want presence, not noise.",
    ],
  ),
  inner_darkness: pack(
    [
      "Nombrar tu oscuridad interna es honestidad pura; ahí se hace sombra con respeto.",
      "La oscuridad no es el enemigo: es material noble si se trabaja con cuidado.",
      "Quien mira hacia dentro sin miedo da espacio a piezas con peso real.",
    ],
    [
      "Naming your inner darkness is pure honesty; that is where shadow earns respect.",
      "Darkness is not the enemy: it is noble material when handled with care.",
      "Those who look inward without fear make room for pieces with real weight.",
    ],
  ),
  vulnerability: pack(
    [
      "Atreverte a la vulnerabilidad es coraje, y eso se traduce en piezas con alma.",
      "La vulnerabilidad bien dicha abre conversaciones que un tatuaje sabe guardar.",
      "Quien se deja ver de verdad suele pedir trabajo que no finja dureza.",
    ],
    [
      "Daring to be vulnerable is courage, and that becomes pieces with soul.",
      "Vulnerability spoken well opens conversations a tattoo can keep.",
      "Those who let themselves be seen usually ask for work that does not pretend hardness.",
    ],
  ),
  loyalty: pack(
    [
      "Tu lealtad habla de alguien que honra lo que elige, y eso importa en mi silla.",
      "La lealtad no es ruido: es constancia. Las mejores piezas también lo son.",
      "Quien es leal suele entender que un tatuaje es un pacto, no un capricho.",
    ],
    [
      "Your loyalty speaks of someone who honors what they choose, and that matters in my chair.",
      "Loyalty is not noise: it is constancy. The best pieces are the same.",
      "Those who are loyal usually understand a tattoo is a pact, not a whim.",
    ],
  ),
  freedom: pack(
    [
      "Libertad con raíces encaja con cómo pienso cada pieza: sin atajos.",
      "La libertad que te habita pide movimiento, aire y composición viva.",
      "Quien busca libertad suele querer un trazo que respire, no que aprisione.",
    ],
    [
      "Freedom with roots fits how I think each piece: no shortcuts.",
      "The freedom inside you asks for movement, air, and living composition.",
      "Those who seek freedom usually want a line that breathes, not one that cages.",
    ],
  ),
  resilience: pack(
    [
      "La resiliencia marca a quien entiende que lo que lleva encima también es historia.",
      "Resistir no es endurecerse: es seguir con sentido. Eso se tatúa distinto.",
      "Quien ha atravesado y sigue en pie suele pedir piezas con columna propia.",
    ],
    [
      "Resilience marks those who understand what they wear is also history.",
      "To endure is not to harden: it is to keep going with meaning. That tattoos differently.",
      "Those who have crossed and still stand usually ask for pieces with their own spine.",
    ],
  ),
  roots: pack(
    [
      "Llevar las raíces presentes es saber que un tatuaje puede ser legado.",
      "Las raíces piden anclaje: origen, linaje, algo que no se diluya.",
      "Quien honra sus raíces suele querer trabajo que se sienta casa.",
    ],
    [
      "Keeping roots present means knowing a tattoo can be legacy.",
      "Roots ask for anchorage: origin, lineage, something that will not dilute.",
      "Those who honor their roots usually want work that feels like home.",
    ],
  ),
  memory: pack(
    [
      "Honrar la memoria es uno de los motivos más honestos para tatuarse.",
      "La memoria pide cuidado: no es nostalgia barata, es presencia viva.",
      "Quien tatúa memoria suele buscar un lenguaje que no traicione lo que importa.",
    ],
    [
      "Honoring memory is one of the most honest reasons to get tattooed.",
      "Memory asks for care: it is not cheap nostalgia, it is living presence.",
      "Those who tattoo memory usually look for a language that will not betray what matters.",
    ],
  ),
  transcendence: pack(
    [
      "Buscar trascendencia demuestra que entiendes el peso de lo permanente.",
      "La trascendencia no grita: eleva. Pide piezas con intención limpia.",
      "Quien mira más allá suele querer un símbolo que aguante el tiempo.",
    ],
    [
      "Seeking transcendence shows you understand the weight of the permanent.",
      "Transcendence does not shout: it lifts. It asks for pieces with clean intent.",
      "Those who look beyond usually want a symbol that can hold time.",
    ],
  ),
  silence: pack(
    [
      "Elegir el silencio revela a quien sabe que lo esencial no siempre grita.",
      "El silencio es materia: espacio, pausa, contorno. Ahí nacen piezas serenas.",
      "Quien valora el silencio suele pedir un diseño que respire sin exceso.",
    ],
    [
      "Choosing silence reveals someone who knows the essential does not always shout.",
      "Silence is material: space, pause, contour. Calm pieces are born there.",
      "Those who value silence usually ask for a design that breathes without excess.",
    ],
  ),
};

/** Cómo se traduce al proceso de tatuar. */
export const VALUE_CRAFT: Record<PersonalValue, LocalePack> = {
  duality: pack(
    [
      "En tinta, eso se vuelve contraste, tensión y equilibrio consciente.",
      "Ahí el negro y la luz se dialogan sin pelear por protagonismo.",
    ],
    [
      "In ink, that becomes contrast, tension, and conscious balance.",
      "There black and light converse without fighting for the lead.",
    ],
  ),
  joy: pack(
    [
      "En la piel, eso pide ritmo, vida y una composición que no se apague.",
      "Ahí el trazo busca energía limpia, no decoración vacía.",
    ],
    [
      "On skin, that asks for rhythm, life, and a composition that will not fade into noise.",
      "There the line seeks clean energy, not empty decoration.",
    ],
  ),
  light: pack(
    [
      "En el diseño, eso se traduce en claridad de forma y presencia serena.",
      "Ahí la luz guía la composición más que el exceso de detalle.",
    ],
    [
      "In design, that becomes clarity of form and calm presence.",
      "There light guides composition more than excess detail.",
    ],
  ),
  inner_darkness: pack(
    [
      "En el trabajo, eso se vuelve sombra profunda, textura y respeto por lo denso.",
      "Ahí lo oscuro no se maquilla: se nombra con precisión.",
    ],
    [
      "In the work, that becomes deep shadow, texture, and respect for density.",
      "There the dark is not painted over: it is named with precision.",
    ],
  ),
  vulnerability: pack(
    [
      "En una pieza, eso pide suavidad estructural y una lectura íntima.",
      "Ahí el diseño no protege con armadura: acompaña con verdad.",
    ],
    [
      "In a piece, that asks for structural softness and an intimate read.",
      "There the design does not protect with armor: it accompanies with truth.",
    ],
  ),
  loyalty: pack(
    [
      "En el proceso, eso se nota en decisiones firmes y un lenguaje que perdura.",
      "Ahí cada línea se elige como un compromiso, no como un ensayo.",
    ],
    [
      "In the process, that shows in firm decisions and a language that lasts.",
      "There each line is chosen as a commitment, not a draft.",
    ],
  ),
  freedom: pack(
    [
      "En composición, eso pide escala viva, flujo y espacio para respirar.",
      "Ahí la pieza no se encierra: se abre al cuerpo.",
    ],
    [
      "In composition, that asks for living scale, flow, and room to breathe.",
      "There the piece does not box itself in: it opens to the body.",
    ],
  ),
  resilience: pack(
    [
      "En la piel, eso se vuelve estructura firme y un relato que no se quiebra fácil.",
      "Ahí el diseño sostiene, no solo adorna.",
    ],
    [
      "On skin, that becomes firm structure and a story that does not break easy.",
      "There the design holds, it does not only decorate.",
    ],
  ),
  roots: pack(
    [
      "En el tatuaje, eso pide anclaje: forma clara, peso simbólico, origen.",
      "Ahí la pieza se siente como lugar, no como moda.",
    ],
    [
      "In the tattoo, that asks for anchorage: clear form, symbolic weight, origin.",
      "There the piece feels like place, not trend.",
    ],
  ),
  memory: pack(
    [
      "En tinta, eso pide cuidado narrativa: cada gesto cuenta algo real.",
      "Ahí lo esencial se protege del relleno.",
    ],
    [
      "In ink, that asks for narrative care: every gesture tells something real.",
      "There the essential is protected from filler.",
    ],
  ),
  transcendence: pack(
    [
      "En la pieza, eso pide intención limpia y una forma que aguante el tiempo.",
      "Ahí se evita lo efímero: se busca símbolo con aliento largo.",
    ],
    [
      "In the piece, that asks for clean intent and a form that can hold time.",
      "There the ephemeral is avoided: we look for a symbol with long breath.",
    ],
  ),
  silence: pack(
    [
      "En el diseño, eso se vuelve margen, pausa y contorno exacto.",
      "Ahí lo que no se dibuja también habla.",
    ],
    [
      "In design, that becomes margin, pause, and exact contour.",
      "There what is not drawn also speaks.",
    ],
  ),
};

/** Puentes para 2 valores (claves ordenadas alfabéticamente). */
export const PAIR_BRIDGES: Record<string, LocalePack> = {
  "duality|light": pack(
    ["Entre dualidad y luz aparece un equilibrio raro: contraste con claridad."],
    ["Between duality and light a rare balance appears: contrast with clarity."],
  ),
  "duality|inner_darkness": pack(
    ["Dualidad y oscuridad interna se reconocen: no niegas ninguna cara de ti."],
    ["Duality and inner darkness recognize each other: you do not deny either face of yourself."],
  ),
  "duality|silence": pack(
    ["La dualidad en silencio se vuelve madurez: dos verdades, sin alarde."],
    ["Duality in silence becomes maturity: two truths, without show."],
  ),
  "joy|light": pack(
    ["Alegría y luz juntas no son decorado: son una decisión de tono."],
    ["Joy and light together are not decoration: they are a decision of tone."],
  ),
  "joy|freedom": pack(
    ["Alegría y libertad se empujan: quieren movimiento, no fórmulas."],
    ["Joy and freedom push each other: they want movement, not formulas."],
  ),
  "light|silence": pack(
    ["Luz y silencio hacen una presencia limpia: brilla sin gritar."],
    ["Light and silence make clean presence: it shines without shouting."],
  ),
  "inner_darkness|vulnerability": pack(
    ["Oscuridad y vulnerabilidad juntas son coraje crudo: raro y valioso."],
    ["Darkness and vulnerability together are raw courage: rare and valuable."],
  ),
  "inner_darkness|resilience": pack(
    ["Oscuridad y resiliencia cuentan una historia que ya sobrevivió algo."],
    ["Darkness and resilience tell a story that already survived something."],
  ),
  "vulnerability|loyalty": pack(
    ["Vulnerabilidad y lealtad: te abres, pero no traicionas lo que amas."],
    ["Vulnerability and loyalty: you open up, but you do not betray what you love."],
  ),
  "loyalty|roots": pack(
    ["Lealtad y raíces piden piezas con linaje: algo que se pueda honrar."],
    ["Loyalty and roots ask for pieces with lineage: something that can be honored."],
  ),
  "freedom|roots": pack(
    ["Libertad con raíces no es contradicción: es vuelo con dirección."],
    ["Freedom with roots is not a contradiction: it is flight with direction."],
  ),
  "freedom|silence": pack(
    ["Libertad y silencio: espacio propio, sin necesidad de justificarlo."],
    ["Freedom and silence: a space of your own, with no need to explain it."],
  ),
  "resilience|memory": pack(
    ["Resiliencia y memoria se cruzan: lo vivido se vuelve fuerza, no herida abierta."],
    ["Resilience and memory meet: what was lived becomes strength, not an open wound."],
  ),
  "roots|memory": pack(
    ["Raíces y memoria construyen legado: una pieza que sostiene origen."],
    ["Roots and memory build legacy: a piece that holds origin."],
  ),
  "memory|transcendence": pack(
    ["Memoria y trascendencia quieren lo permanente con alma, no con eslogan."],
    ["Memory and transcendence want the permanent with soul, not with slogan."],
  ),
  "transcendence|silence": pack(
    ["Trascendencia en silencio: lo sagrado sin teatro."],
    ["Transcendence in silence: the sacred without theater."],
  ),
  "joy|vulnerability": pack(
    ["Alegría y vulnerabilidad: puedes brillar y seguir siendo humano."],
    ["Joy and vulnerability: you can shine and still remain human."],
  ),
  "light|loyalty": pack(
    ["Luz y lealtad: claridad con compromiso, no con pose."],
    ["Light and loyalty: clarity with commitment, not with pose."],
  ),
};

/** Aperturas cuando hay varios valores. */
export const MULTI_OPENERS = pack(
  [
    "En tu selección hay un mapa personal, no una lista al azar.",
    "Lo que elegiste no suena a checklist: suena a identidad.",
    "Esos conceptos juntos ya dibujan un carácter.",
    "Hay coherencia en lo que trajiste: se siente tuyo.",
  ],
  [
    "Your selection is a personal map, not a random list.",
    "What you chose does not sound like a checklist: it sounds like identity.",
    "Those concepts together already draw a character.",
    "There is coherence in what you brought: it feels like yours.",
  ],
);

/** Puentes genéricos 2 valores cuando no hay par especial. */
export const GENERIC_PAIR = pack(
  [
    "Cuando se encuentran {a} y {b}, aparece una tensión fértil.",
    "Entre {a} y {b} hay un diálogo que una buena pieza puede sostener.",
    "{a} y {b} no se anulan: se afilan.",
    "Juntas, {a} y {b} piden un diseño con más de una lectura.",
  ],
  [
    "When {a} and {b} meet, a fertile tension appears.",
    "Between {a} and {b} there is a dialogue a good piece can hold.",
    "{a} and {b} do not cancel each other: they sharpen each other.",
    "Together, {a} and {b} ask for a design with more than one reading.",
  ],
);

export const GENERIC_MANY = pack(
  [
    "Llevas {list}: un acorde, no notas sueltas.",
    "Con {list}, el proceso pide escucha profunda antes del trazo.",
    "{list} juntos piden una pieza con capas, no un símbolo plano.",
  ],
  [
    "You carry {list}: a chord, not loose notes.",
    "With {list}, the process asks for deep listening before the line.",
    "{list} together ask for a layered piece, not a flat symbol.",
  ],
);

export const CLOSINGS = pack(
  [
    "Así trabajo mejor: con personas que saben por qué se sientan.",
    "Eso es el tipo de conexión con el que sí construyo.",
    "Desde aquí, el diseño puede nacer con sentido.",
    "Con este punto de partida, hay terreno fértil.",
  ],
  [
    "That is how I work best: with people who know why they sit down.",
    "That is the kind of connection I build with.",
    "From here, the design can be born with meaning.",
    "With this starting point, the ground is fertile.",
  ],
);

export const ADJUST_LINES: Record<Exclude<AdjustmentOption, "fixed_idea_only">, LocalePack> = {
  trust_artist: pack(
    [
      "Además, confiar en que yo guíe la idea habla de apertura real.",
      "Y dejarme orientar el diseño es una forma seria de colaborar.",
    ],
    [
      "Plus, trusting me to guide the idea speaks of real openness.",
      "And letting me steer the design is a serious way to collaborate.",
    ],
  ),
  open_composition: pack(
    [
      "Además, abrirte a escala y composición da aire para que la idea crezca.",
      "Y dejar espacio a la composición es señal de visión, no de duda.",
    ],
    [
      "Plus, opening to scale and composition gives the idea room to grow.",
      "And making room for composition is a sign of vision, not doubt.",
    ],
  ),
  approve_each: pack(
    [
      "Además, querer revisar cada paso muestra cuidado sin cerrarte al diálogo.",
      "Y pedir aprobación en cada ajuste habla de respeto por el proceso.",
    ],
    [
      "Plus, wanting to review each step shows care without closing dialogue.",
      "And asking approval on each adjustment speaks of respect for the process.",
    ],
  ),
};

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

/** Nombres gramaticales para insertar en frases. */
export const VALUE_NOUN: Record<PersonalValue, Record<PraiseLang, string>> = {
  duality: { es: "la dualidad", en: "duality" },
  joy: { es: "la alegría", en: "joy" },
  light: { es: "la luz", en: "light" },
  inner_darkness: { es: "la oscuridad interna", en: "inner darkness" },
  vulnerability: { es: "la vulnerabilidad", en: "vulnerability" },
  loyalty: { es: "la lealtad", en: "loyalty" },
  freedom: { es: "la libertad", en: "freedom" },
  resilience: { es: "la resiliencia", en: "resilience" },
  roots: { es: "las raíces", en: "roots" },
  memory: { es: "la memoria", en: "memory" },
  transcendence: { es: "la trascendencia", en: "transcendence" },
  silence: { es: "el silencio", en: "silence" },
};
