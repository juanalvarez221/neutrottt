export type LocalizedText = {
  es: string;
  en: string;
};

export type ProductTestimonial = {
  id: string;
  name: string;
  quote: LocalizedText;
};

/** Course — natural Colombian voice, names + quotes only. */
export const COURSE_TESTIMONIALS: ProductTestimonial[] = [
  {
    id: "course-valeria",
    name: "Valeria Rincón",
    quote: {
      es: "Llegué con miedo de quedar como copia de alguien. Danniel no te presta un estilo, te hace decidir. Salí con algo mío de verdad. Si estás dudando, métete, yo me hubiese quedado meses dando vueltas sola.",
      en: "I arrived scared of looking like a copy of someone. Danniel doesn’t lend you a style—he makes you decide. I left with something that was actually mine. If you’re hesitating, go in. I would’ve wasted months alone.",
    },
  },
  {
    id: "course-mateo",
    name: "Mateo Quintero",
    quote: {
      es: "Lo que más me pegó no fue solo el trazo, fue cómo hablar de plata y filtrar clientes sin quedar raro. En unas semanas se notó en la agenda. En el taller me preguntaron qué había cambiado y les pasé el seminario. Vale cada peso.",
      en: "What hit me most wasn’t only the stroke—it was how to talk money and filter clients without sounding weird. In a few weeks the agenda showed it. People at the shop asked what changed and I sent them the seminar. Worth every peso.",
    },
  },
  {
    id: "course-short-1",
    name: "Isa Cano",
    quote: {
      es: "Te corrige de frente. Sin teatro.",
      en: "He corrects you straight up. No theater.",
    },
  },
  {
    id: "course-camila",
    name: "Camila Ordóñez",
    quote: {
      es: "Nadie me había explicado la cicatrización así de claro. Antes entregaba y a rezar. Ahora sé qué hacer y la gente lo nota. Si alguien cerca tuyo está inseguro, dile que no es humo, es oficio de verdad.",
      en: "Nobody had explained healing this clearly. Before I delivered and hoped for the best. Now I know what to do and people notice. If someone near you is unsure, tell them it’s not fluff—it’s real craft.",
    },
  },
  {
    id: "course-short-2",
    name: "Bruno Salas",
    quote: {
      es: "Subí el precio a la segunda semana y se llenó.",
      en: "Raised my price week two and it filled.",
    },
  },
  {
    id: "course-andres",
    name: "Andrés Beltrán",
    quote: {
      es: "Años viendo lettering lindo en Instagram y el mío no aguantaba. Acá entendí ritmo, contraste y cómo se lee de lejos. Ahora me piden “como el tuyo”. Si estás frustrado con las letras, esto te ahorra mucha vuelta.",
      en: "Years watching pretty lettering on Instagram while mine didn’t hold up. Here I got rhythm, contrast, and how it reads from afar. Now people ask for “yours.” If you’re frustrated with letters, this saves you a lot of circling.",
    },
  },
  {
    id: "course-short-3",
    name: "Renata Hoyos",
    quote: {
      es: "Por fin alguien que corrige de verdad.",
      en: "Finally someone who actually corrects you.",
    },
  },
  {
    id: "course-sofia",
    name: "Sofía Mendoza",
    quote: {
      es: "Antes cada pieza era un invento distinto. Ahora tengo un método: primero estructura, después lo bonito. Mis compañeros del estudio me pedían que les explicara y yo les mandé el link. Listo.",
      en: "Before every piece was a different invention. Now I have a method: structure first, then the pretty stuff. Studio peers asked me to explain and I just sent the link. Done.",
    },
  },
  {
    id: "course-short-4",
    name: "Leo Patiño",
    quote: {
      es: "Menos retoques. Más tranquilidad.",
      en: "Fewer touch-ups. More peace of mind.",
    },
  },
  {
    id: "course-julian",
    name: "Julián Ocampo",
    quote: {
      es: "Yo pensaba que ya lo tenía controlado. Me equivoqué. El tema del contraste me destapó errores que traía hace años. Salí un poco bravo conmigo… y agradecido. Si llevas rato en esto y sientes que te estancaste, te empuja.",
      en: "I thought I already had it under control. I was wrong. The contrast block exposed mistakes I’d carried for years. I left a bit mad at myself… and grateful. If you’ve been at this a while and feel stuck, it pushes you.",
    },
  },
  {
    id: "course-short-5",
    name: "Mila Duarte",
    quote: {
      es: "Ahora filtro mejor. Y duermo mejor.",
      en: "I filter better now. And sleep better.",
    },
  },
  {
    id: "course-hector",
    name: "Héctor Rivas",
    quote: {
      es: "Mandé a dos del taller. En un mes el nivel de letras del estudio cambió. No es para “inspirarse un rato”, es corrección y criterio. Ya tengo gente preguntando por el próximo.",
      en: "I sent two from the shop. In a month the studio’s lettering level changed. It’s not for “getting inspired for a bit”—it’s correction and judgment. I already have people asking about the next one.",
    },
  },
  {
    id: "course-short-6",
    name: "Pau Lerma",
    quote: {
      es: "Corrección real. Agenda más cara. Punto.",
      en: "Real correction. Higher bookings. Period.",
    },
  },
  {
    id: "course-ines",
    name: "Inés Cabrera",
    quote: {
      es: "Yo me enredaba en el detalle fino y perdía la lectura. Acá entendí jerarquía en piel. Mis fotos de lejos ahora se entienden. Eso sola no lo sacaba en un año.",
      en: "I got lost in fine detail and lost readability. Here I got hierarchy on skin. My far-away photos finally make sense. I wouldn’t have gotten that alone in a year.",
    },
  },
  {
    id: "course-short-7",
    name: "Omar Vélez",
    quote: {
      es: "Dejé de parecer una referencia de otro.",
      en: "I stopped looking like someone else’s reference.",
    },
  },
  {
    id: "course-daniela",
    name: "Daniela Forero",
    quote: {
      es: "Actualicé el book después del seminario y me abrieron dos guest que antes ni me respondían. No fue suerte, fue coherencia en las letras. Si quieres que afuera te tomen en serio, ayuda un montón.",
      en: "I updated my book after the seminar and two guest spots that used to ignore me opened up. Not luck—coherence in the lettering. If you want to be taken seriously abroad, it helps a lot.",
    },
  },
  {
    id: "course-short-8",
    name: "Cris Molina",
    quote: {
      es: "Clientes contentos = menos dolores de cabeza.",
      en: "Happy clients = fewer headaches.",
    },
  },
  {
    id: "course-raul",
    name: "Raúl Espinosa",
    quote: {
      es: "Yo venía del tradicional y las letras me fallaban. Acá no me cambiaron el gusto, me dieron estructura. Mis piezas mixtas ahora se ven hechas a propósito, no improvisadas.",
      en: "I came from traditional and lettering kept failing me. They didn’t change my taste—they gave me structure. My mixed pieces now look intentional, not improvised.",
    },
  },
  {
    id: "course-short-9",
    name: "Yuli Arango",
    quote: {
      es: "Se lo pasé a tres. Las tres entraron.",
      en: "I passed it to three people. All three joined.",
    },
  },
  {
    id: "course-felipe",
    name: "Felipe Navarro",
    quote: {
      es: "Llevo poquito en el oficio y esto me ahorró el típico camino de prueba y error. No te vuelven mago, te enseñan a mirar. Al principio eso vale oro.",
      en: "I’m early in the craft and this saved me the usual trial-and-error path. They don’t make you a wizard—they teach you how to look. Early on, that’s gold.",
    },
  },
  {
    id: "course-short-10",
    name: "Tania Ruiz",
    quote: {
      es: "Cero humo. Todo útil.",
      en: "Zero fluff. All useful.",
    },
  },
  {
    id: "course-gabriel",
    name: "Gabriel Peña",
    quote: {
      es: "El bloque de agenda y clientes me cambió el mes. Antes rebajaba por no perder el cupo. Ahora explico el valor y el cliente serio se queda. Eso no lo aprendí en ningún reel.",
      en: "The agenda-and-clients block changed my month. Before I’d discount so I wouldn’t lose the slot. Now I explain the value and serious clients stay. No reel taught me that.",
    },
  },
  {
    id: "course-short-11",
    name: "Noelia Sáenz",
    quote: {
      es: "Mi book por fin se ve de una sola mano.",
      en: "My book finally looks like one hand.",
    },
  },
  {
    id: "course-marcos",
    name: "Marcos Delgado",
    quote: {
      es: "Trabajo chicano lettering y tenía miedo de que me empujaran a otro look. No pasó. Me afinaron ritmo y contraste sin tocar lo mío. Eso es raro… y se lo dije a todo el crew.",
      en: "I work Chicano lettering and feared they’d push another look. Didn’t happen. They tuned rhythm and contrast without touching what’s mine. That’s rare… and I told the whole crew.",
    },
  },
  {
    id: "course-laura",
    name: "Laura Castaño",
    quote: {
      es: "Uno se pone a ver reels y cree que ya sabe. Entré y me bajaron a tierra. Bacano, duro, pero bacano.",
      en: "You watch reels and think you already know. I went in and got grounded. Tough, but worth it.",
    },
  },
  {
    id: "course-short-12",
    name: "Santi Mejía",
    quote: {
      es: "Parce, ojalá lo hubiera hecho antes.",
      en: "Man, I wish I’d done this sooner.",
    },
  },
];

/** Book — natural Colombian voice, names + quotes only. */
export const BOOK_TESTIMONIALS: ProductTestimonial[] = [
  {
    id: "book-lucia",
    name: "Lucía Paredes",
    quote: {
      es: "No es de esos libros para “inspirarse un ratico”. Lo abro cuando estoy armando una pieza y me ordena la cabeza. Se lo presté a dos compañeras y ahora cada una quiere el suyo.",
      en: "It’s not one of those books for “a quick inspiration hit.” I open it when I’m building a piece and it clears my head. I lent it to two colleagues and now each wants their own.",
    },
  },
  {
    id: "book-short-1",
    name: "Esteban Ríos",
    quote: {
      es: "Vive en mi mesa. No en el estante.",
      en: "Lives on my desk. Not the shelf.",
    },
  },
  {
    id: "book-kevin",
    name: "Kevin Morán",
    quote: {
      es: "Venía del diseño y me faltaba el criterio de piel. Este libro me bajó a tierra: estructura, contraste, errores típicos. Lo leí dos veces. A los del estudio les digo lo mismo: no lo dejen de adorno, úsenlo.",
      en: "I came from design and lacked skin judgment. This book grounded me: structure, contrast, typical mistakes. I read it twice. I tell the studio the same: don’t leave it as decoration—use it.",
    },
  },
  {
    id: "book-short-2",
    name: "Abril Soto",
    quote: {
      es: "Cero paja. Todo aplicable.",
      en: "Zero fluff. All usable.",
    },
  },
  {
    id: "book-natalia",
    name: "Natalia Vélez",
    quote: {
      es: "Pensé que a estas alturas ya sabía. Me equivoqué. Hay capítulos que me corrigieron vicios que ni veía. Se lo regalé a una aprendiz y ahora hablamos el mismo idioma.",
      en: "I thought at this stage I already knew. I was wrong. Some chapters fixed habits I couldn’t even see. I gifted it to an apprentice and now we speak the same language.",
    },
  },
  {
    id: "book-short-3",
    name: "Iván Correa",
    quote: {
      es: "Ya está manchado de tinta. Señal de que sirve.",
      en: "Already stained with ink. Proof it works.",
    },
  },
  {
    id: "book-diego",
    name: "Diego Farfán",
    quote: {
      es: "Viajo mucho y la digital me salva. Lo abro en el hotel antes de una sesión jodida. No promete magia, te da criterio. Si estás entre comprarlo o no, cómpralo.",
      en: "I travel a lot and the digital edition saves me. I open it in the hotel before a hard session. It doesn’t promise magic—it gives judgment. If you’re on the fence, buy it.",
    },
  },
  {
    id: "book-short-4",
    name: "Laura Benítez",
    quote: {
      es: "Mi mentor me dijo: cómpralo ya.",
      en: "My mentor said: buy it now.",
    },
  },
  {
    id: "book-paola",
    name: "Paola Jiménez",
    quote: {
      es: "Trabajo tipografía en pantalla y quería entender piel. Este libro es el puente. Claro, técnico, sin pose. Lo tengo subrayado como si fueran apuntes de clase.",
      en: "I work type on screen and wanted to understand skin. This book is the bridge. Clear, technical, no pose. Mine is underlined like class notes.",
    },
  },
  {
    id: "book-short-5",
    name: "Nico Vargas",
    quote: {
      es: "No es de leer una vez. Es de consultar.",
      en: "Not a one-read. It’s a reference.",
    },
  },
  {
    id: "book-elena",
    name: "Elena Quiroga",
    quote: {
      es: "Lo puse en la mesa del estudio. Los aprendices lo abren antes de bocetar. Nos ahorramos discusiones bobas porque ahora hay un criterio compartido. Eso solo ya pagó el libro.",
      en: "I put it on the studio table. Apprentices open it before sketching. We skip silly arguments because there’s shared judgment now. That alone paid for the book.",
    },
  },
  {
    id: "book-short-6",
    name: "Samir Ortiz",
    quote: {
      es: "Tengo los dos. No me arrepiento.",
      en: "I own both. No regrets.",
    },
  },
  {
    id: "book-rocio",
    name: "Rocío Aguilar",
    quote: {
      es: "No tatuo, pero diseño letras todo el día. Este libro me ordenó contraste y ritmo como ningún curso online. Se lo regalé a dos amigas y las tres lo citamos en reuniones.",
      en: "I don’t tattoo, but I design letters all day. This book ordered contrast and rhythm better than any online course. I gifted it to two friends and all three of us cite it in meetings.",
    },
  },
  {
    id: "book-short-7",
    name: "Hugo Méndez",
    quote: {
      es: "Me señaló errores que ni veía.",
      en: "It pointed out mistakes I couldn’t see.",
    },
  },
  {
    id: "book-carmen",
    name: "Carmen Ulloa",
    quote: {
      es: "Cuando doy intro a lettering siempre lo nombro. No porque esté de moda, porque la gente vuelve con mejores preguntas. Eso es señal de herramienta seria.",
      en: "When I teach lettering intro I always name it. Not because it’s trendy—because people come back with better questions. That’s a serious tool signal.",
    },
  },
  {
    id: "book-short-8",
    name: "Piero Castillo",
    quote: {
      es: "Lo abro. Respiro. Trabajo.",
      en: "I open it. Breathe. Work.",
    },
  },
  {
    id: "book-ximena",
    name: "Ximena Prado",
    quote: {
      es: "Fine line con lettering me costaba: se veía delicado pero ilegible. El libro me forzó a priorizar lectura. Ahora a un metro se entiende. Eso cambió reseñas y referidos.",
      en: "Fine line with lettering was hard: delicate but illegible. The book forced readability first. Now it reads from a meter away. That changed reviews and referrals.",
    },
  },
  {
    id: "book-short-9",
    name: "Damián Cruz",
    quote: {
      es: "Se presta. Vuelve. Se vuelve a prestar.",
      en: "Gets lent. Comes back. Gets lent again.",
    },
  },
  {
    id: "book-alejandro",
    name: "Alejandro Rueda",
    quote: {
      es: "Mis scripts se veían bien en papel y se caían en piel. Acá entendí por qué. Volví a piezas viejas y ya sé qué no repetir. Si haces script, esto te ahorra clientes bravos.",
      en: "My scripts looked fine on paper and fell apart on skin. Here I understood why. I revisited old pieces and now know what not to repeat. If you do script, this saves you angry clients.",
    },
  },
  {
    id: "book-short-10",
    name: "Vera Montes",
    quote: {
      es: "Mi Google de lettering. Pero mejor.",
      en: "My lettering Google. But better.",
    },
  },
  {
    id: "book-tomas",
    name: "Tomás Herrera",
    quote: {
      es: "Compré cuatro: uno mío y tres para el equipo. En dos meses el lenguaje del taller cambió. Menos “me gusta / no me gusta”, más estructura. Inversión chiquita, retorno claro.",
      en: "I bought four: one for me, three for the team. In two months the shop language changed. Less “I like / I don’t,” more structure. Small investment, clear return.",
    },
  },
  {
    id: "book-short-11",
    name: "Jimena Solís",
    quote: {
      es: "Teoría que sí se usa. Raro y bueno.",
      en: "Theory you actually use. Rare and good.",
    },
  },
  {
    id: "book-ricardo",
    name: "Ricardo Belmonte",
    quote: {
      es: "En cada guest lo abro la noche anterior. Me ordena antes de piezas difíciles. No es magia, es checklist mental. Si viajas y tatúas letras, la digital te acompaña sin peso.",
      en: "On every guest spot I open it the night before. It clears my head before hard pieces. Not magic—a mental checklist. If you travel and tattoo letters, digital comes with no weight.",
    },
  },
  {
    id: "book-short-12",
    name: "Camila Restrepo",
    quote: {
      es: "Presté el mío. Compré otro. Fin.",
      en: "Lent mine. Bought another. Done.",
    },
  },
  {
    id: "book-juan",
    name: "Juan David Ospina",
    quote: {
      es: "Uno lo abre pensando “otro libro más” y resulta que sí sirve. Lo tengo al lado de la máquina. En serio.",
      en: "You open it thinking “another book” and it actually helps. I keep it next to the machine. Seriously.",
    },
  },
  {
    id: "book-short-13",
    name: "Mariana Giraldo",
    quote: {
      es: "Me lo recomendó una amiga de Medellín. Tenía razón.",
      en: "A friend from Medellín recommended it. She was right.",
    },
  },
];
