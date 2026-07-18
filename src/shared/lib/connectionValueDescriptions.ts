import type { PersonalValue } from "@/shared/lib/quoteConnection";
import type { PraiseLang } from "@/shared/lib/connectionPraiseBank";

type LocalePack = Record<PraiseLang, string[]>;

function pack(es: string[], en: string[]): LocalePack {
  return { es, en };
}

/**
 * 5 variantes por valor/concepto. Se elige una de forma determinista
 * por sesión para que cada valor seleccionado tenga su propia descripción.
 */
export const VALUE_DESCRIPTIONS: Record<PersonalValue, LocalePack> = {
  duality: pack(
    [
      "Quiero explorar contigo esas dos partes que conviven dentro de ti. Mi intención es entender cómo se relacionan y convertir esa dualidad en un diseño que realmente te represente.",
      "Me interesa conocer esos contrastes que hacen parte de quien eres. Quiero tomar esa idea y llevarla hacia una imagen donde ambos lados puedan encontrarse.",
      "Quiero entender qué significa para ti vivir entre dos fuerzas, dos mundos o dos versiones de ti. Desde ahí, podemos construir un diseño que hable de ese equilibrio.",
      "Tu dualidad puede contar mucho de ti sin necesidad de explicarlo todo. Quiero descubrir contigo cómo darle una forma que se sienta honesta y personal.",
      "Quiero conectar con esas partes opuestas que también te complementan. Juntos podemos transformar esa idea en un diseño que represente todo lo que convive dentro de ti.",
    ],
    [
      "I want to explore with you those two parts that live inside you. My aim is to understand how they relate and turn that duality into a design that truly represents you.",
      "I'm interested in the contrasts that make you who you are. I want to take that idea and shape an image where both sides can meet.",
      "I want to understand what it means for you to live between two forces, two worlds, or two versions of yourself. From there, we can build a design that speaks of that balance.",
      "Your duality can say a lot about you without explaining everything. I want to discover with you how to give it a form that feels honest and personal.",
      "I want to connect with those opposite parts that also complete you. Together we can turn that idea into a design that represents everything living inside you.",
    ],
  ),
  joy: pack(
    [
      "Quiero saber qué es eso que te llena de alegría y te hace sentir más vivo. Desde ahí, quiero convertir esa emoción en un diseño que puedas llevar siempre contigo.",
      "Cuéntame qué significa la alegría para ti. Quiero explorar esa sensación contigo y encontrar una forma de representarla de una manera auténtica.",
      "Quiero conocer ese recuerdo, persona o momento que despierta algo bonito en ti. Mi intención es transformar esa emoción en una imagen que conserve su esencia.",
      "Hay alegrías que merecen quedarse para siempre. Quiero entender cuál es la tuya y ayudarte a convertirla en algo que tenga sentido para ti.",
      "Quiero conectar con eso que te hace sonreír incluso cuando pasa el tiempo. A partir de tu historia, podemos crear un diseño que nazca de esa emoción.",
    ],
    [
      "I want to know what fills you with joy and makes you feel more alive. From there, I want to turn that emotion into a design you can always carry with you.",
      "Tell me what joy means to you. I want to explore that feeling with you and find an authentic way to represent it.",
      "I want to know that memory, person, or moment that awakens something beautiful in you. My aim is to turn that emotion into an image that keeps its essence.",
      "There are joys that deserve to stay forever. I want to understand yours and help you turn it into something that makes sense for you.",
      "I want to connect with what makes you smile even as time passes. From your story, we can create a design born from that emotion.",
    ],
  ),
  light: pack(
    [
      "Quiero descubrir contigo qué es eso que ilumina tu camino. Puede ser una persona, una experiencia o algo que encontraste dentro de ti, y quiero ayudarte a darle una forma.",
      "Cuéntame qué representa la luz en tu historia. Quiero entender su significado y convertirlo contigo en un diseño que conserve esa sensación de claridad.",
      "Quiero explorar aquello que te guía cuando todo parece incierto. Desde esa idea, podemos construir una imagen que hable de tu propia manera de encontrar la luz.",
      "Para ti, la luz puede significar esperanza, calma o un nuevo comienzo. Quiero escuchar tu historia y encontrar una forma de llevar ese significado a tu piel.",
      "Quiero saber qué encendió nuevamente algo dentro de ti. Desde ahí, quiero ayudarte a transformar esa luz en una imagen que se sienta profundamente tuya.",
    ],
    [
      "I want to discover with you what lights your path. It may be a person, an experience, or something you found within yourself, and I want to help you give it form.",
      "Tell me what light represents in your story. I want to understand its meaning and turn it with you into a design that keeps that sense of clarity.",
      "I want to explore what guides you when everything feels uncertain. From that idea, we can build an image that speaks of your own way of finding light.",
      "For you, light may mean hope, calm, or a new beginning. I want to hear your story and find a way to carry that meaning onto your skin.",
      "I want to know what lit something inside you again. From there, I want to help you turn that light into an image that feels deeply yours.",
    ],
  ),
  inner_darkness: pack(
    [
      "Quiero explorar contigo esas partes que no siempre son fáciles de mostrar. Mi intención es entenderlas y ayudarte a convertirlas en una imagen que hable de ti con honestidad.",
      "También quiero escuchar aquello que normalmente guardas en silencio. Podemos tomar esa oscuridad y transformarla en un diseño que represente lo que has vivido por dentro.",
      "Quiero entender qué habita en esa parte más profunda de ti. Desde ahí, podemos crear algo que no esconda tu oscuridad, sino que la convierta en una forma de expresión.",
      "No todo lo que sentimos necesita ser bonito para tener valor. Quiero explorar contigo esa parte de tu historia y encontrar una forma de representarla con intención.",
      "Quiero acercarme contigo a esas emociones que a veces cuesta explicar. Desde ahí, podemos construir un diseño que nazca de algo real y profundamente personal.",
    ],
    [
      "I want to explore with you those parts that are not always easy to show. My aim is to understand them and help you turn them into an image that speaks of you with honesty.",
      "I also want to hear what you usually keep in silence. We can take that darkness and turn it into a design that represents what you have lived inside.",
      "I want to understand what lives in that deeper part of you. From there, we can create something that does not hide your darkness, but turns it into expression.",
      "Not everything we feel needs to be pretty to have value. I want to explore that part of your story with you and find a way to represent it with intention.",
      "I want to approach with you those emotions that are sometimes hard to explain. From there, we can build a design born from something real and deeply personal.",
    ],
  ),
  vulnerability: pack(
    [
      "Quiero conocer todo lo que tuviste que atravesar para llegar hasta donde estás hoy. Desde tu historia, quiero construir un diseño que te recuerde la fuerza que encontraste en el camino.",
      "Cuéntame qué cambió en ti después de todo lo vivido. Quiero ayudarte a convertir ese proceso de crecimiento en una imagen que represente tu evolución.",
      "Quiero entender no solo lo que superaste, sino también en quién te convertiste después. Desde ahí, podemos darle forma a un diseño que tenga un significado realmente tuyo.",
      "Tu historia de superación tiene momentos que solo tú conoces. Quiero escucharlos y encontrar contigo una forma de representar todo lo que construiste a partir de ellos.",
      "Quiero explorar ese punto de tu vida en el que decidiste seguir adelante. Desde esa experiencia, podemos crear un diseño que represente tu transformación.",
    ],
    [
      "I want to know everything you had to go through to get where you are today. From your story, I want to build a design that reminds you of the strength you found along the way.",
      "Tell me what changed in you after everything you lived. I want to help you turn that growth into an image that represents your evolution.",
      "I want to understand not only what you overcame, but who you became afterward. From there, we can shape a design with a meaning that is truly yours.",
      "Your story of growth has moments only you know. I want to hear them and find with you a way to represent everything you built from them.",
      "I want to explore that point in your life when you chose to keep going. From that experience, we can create a design that represents your transformation.",
    ],
  ),
  loyalty: pack(
    [
      "Quiero entender qué significa para ti permanecer al lado de alguien, de una idea o de ti mismo. Desde ahí, podemos transformar la lealtad en un diseño con un significado personal.",
      "Cuéntame qué vínculo representa la lealtad para ti. Quiero explorar esa conexión contigo y encontrar una manera de llevarla a una imagen.",
      "Quiero conocer aquello que para ti merece mantenerse firme incluso cuando todo cambia. Desde esa historia, podemos construir un diseño que hable de compromiso y permanencia.",
      "La lealtad puede significar muchas cosas dependiendo de quién la vive. Quiero entender la tuya y ayudarte a convertirla en algo que realmente te identifique.",
      "Quiero descubrir qué persona, promesa o principio está detrás de esta idea. Desde ahí, podemos darle una forma que conserve todo su significado.",
    ],
    [
      "I want to understand what it means for you to stay beside someone, an idea, or yourself. From there, we can turn loyalty into a design with personal meaning.",
      "Tell me what bond loyalty represents for you. I want to explore that connection with you and find a way to carry it into an image.",
      "I want to know what for you deserves to stay firm even when everything changes. From that story, we can build a design that speaks of commitment and permanence.",
      "Loyalty can mean many things depending on who lives it. I want to understand yours and help you turn it into something that truly identifies you.",
      "I want to discover which person, promise, or principle sits behind this idea. From there, we can give it a form that keeps all of its meaning.",
    ],
  ),
  freedom: pack(
    [
      "Quiero saber qué significa para ti sentirte libre. Juntos podemos explorar esa sensación y convertirla en una imagen que represente tu propia forma de vivir.",
      "Cuéntame de qué te liberaste o hacia dónde quieres volar. Quiero tomar esa historia y ayudarte a transformarla en un diseño que se sienta completamente tuyo.",
      "Quiero explorar contigo ese momento en el que decidiste vivir bajo tus propias reglas. Desde ahí, podemos crear algo que represente tu manera de entender la libertad.",
      "La libertad puede ser soltar, comenzar de nuevo o simplemente elegir tu propio camino. Quiero descubrir qué significa para ti y darle una forma.",
      "Quiero entender qué cambió cuando empezaste a sentirte realmente libre. Desde esa experiencia, podemos construir una imagen que represente ese nuevo espacio en tu vida.",
    ],
    [
      "I want to know what it means for you to feel free. Together we can explore that feeling and turn it into an image that represents your own way of living.",
      "Tell me what you freed yourself from, or where you want to fly. I want to take that story and help you turn it into a design that feels completely yours.",
      "I want to explore with you the moment you chose to live by your own rules. From there, we can create something that represents how you understand freedom.",
      "Freedom can mean letting go, starting over, or simply choosing your own path. I want to discover what it means for you and give it form.",
      "I want to understand what changed when you began to feel truly free. From that experience, we can build an image that represents that new space in your life.",
    ],
  ),
  resilience: pack(
    [
      "Quiero conocer esa parte de ti que aprendió a levantarse después de caer. Desde tu historia, quiero ayudarte a crear un diseño que represente todo lo que fuiste capaz de reconstruir.",
      "Cuéntame qué tuviste que atravesar para descubrir tu propia fuerza. Quiero transformar esa experiencia contigo en una imagen que hable de resistencia y transformación.",
      "Quiero entender cómo cambiaste después de los momentos difíciles. Desde ahí, podemos construir un diseño que represente no solo lo que sobreviviste, sino también cómo volviste a empezar.",
      "Hay historias que dejan marcas, pero también enseñan a renacer. Quiero escuchar la tuya y encontrar contigo una forma de representar esa capacidad de seguir adelante.",
      "Quiero explorar contigo todo lo que tuviste que reconstruir dentro de ti. Desde esa historia, podemos crear algo que represente la fuerza que hoy llevas contigo.",
    ],
    [
      "I want to know the part of you that learned to rise after falling. From your story, I want to help you create a design that represents everything you were able to rebuild.",
      "Tell me what you had to go through to discover your own strength. I want to turn that experience with you into an image that speaks of endurance and transformation.",
      "I want to understand how you changed after the hard moments. From there, we can build a design that represents not only what you survived, but how you began again.",
      "There are stories that leave marks, but also teach you how to be reborn. I want to hear yours and find with you a way to represent that capacity to keep going.",
      "I want to explore with you everything you had to rebuild inside yourself. From that story, we can create something that represents the strength you carry today.",
    ],
  ),
  roots: pack(
    [
      "Quiero saber de dónde vienes y qué parte de ese origen sigue viviendo en ti. Desde ahí, podemos construir un diseño que te conecte con tus raíces.",
      "Cuéntame qué personas, lugares o historias te hicieron ser quien eres. Quiero explorar ese origen contigo y transformarlo en una imagen con un significado profundo.",
      "Quiero entender qué parte de tu historia nunca quieres olvidar. Desde tus raíces, podemos crear un diseño que te recuerde siempre de dónde vienes.",
      "Tu origen puede estar lleno de personas, recuerdos y lugares importantes. Quiero escucharlos y ayudarte a encontrar una forma de unirlos en algo que se sienta tuyo.",
      "Quiero explorar contigo aquello que te mantiene conectado con tu historia. Desde ahí, podemos convertir tus raíces en un diseño que conserve todo lo que llevas contigo.",
    ],
    [
      "I want to know where you come from and what part of that origin still lives in you. From there, we can build a design that connects you to your roots.",
      "Tell me which people, places, or stories made you who you are. I want to explore that origin with you and turn it into an image with deep meaning.",
      "I want to understand which part of your story you never want to forget. From your roots, we can create a design that always reminds you where you come from.",
      "Your origin may be full of important people, memories, and places. I want to hear them and help you find a way to bring them together into something that feels yours.",
      "I want to explore with you what keeps you connected to your story. From there, we can turn your roots into a design that holds everything you carry with you.",
    ],
  ),
  memory: pack(
    [
      "Quiero conocer ese recuerdo que todavía vive dentro de ti. Mi intención es ayudarte a transformarlo en una imagen que conserve su significado sin perder lo que lo hace especial.",
      "Cuéntame qué momento, persona o sensación no quieres dejar atrás. Quiero explorar esa memoria contigo y encontrar una forma de mantenerla presente.",
      "Quiero entender por qué ese recuerdo sigue siendo importante para ti. Desde ahí, podemos construir un diseño que te permita llevar una parte de él contigo.",
      "Hay memorias que cambian con el tiempo, pero nunca desaparecen del todo. Quiero escuchar la tuya y ayudarte a convertirla en algo que tenga sentido para ti.",
      "Quiero explorar contigo eso que el tiempo no ha podido borrar. Desde esa memoria, podemos crear una imagen que conserve su esencia de una manera muy personal.",
    ],
    [
      "I want to know that memory that still lives inside you. My aim is to help you turn it into an image that keeps its meaning without losing what makes it special.",
      "Tell me which moment, person, or feeling you do not want to leave behind. I want to explore that memory with you and find a way to keep it present.",
      "I want to understand why that memory still matters to you. From there, we can build a design that lets you carry a part of it with you.",
      "There are memories that change with time, but never fully disappear. I want to hear yours and help you turn it into something that makes sense for you.",
      "I want to explore with you what time has not been able to erase. From that memory, we can create an image that keeps its essence in a deeply personal way.",
    ],
  ),
  transcendence: pack(
    [
      "Quiero entender qué quieres dejar más allá de este momento. Desde esa idea, podemos construir un diseño que represente tu manera de trascender.",
      "Cuéntame qué huella quieres dejar en tu historia o en la de los demás. Quiero explorar ese significado contigo y convertirlo en una imagen que pueda acompañarte.",
      "Quiero descubrir qué parte de ti quieres que permanezca incluso cuando todo cambie. Desde ahí, podemos crear un diseño conectado con tu propósito.",
      "Para mí, trascender comienza por entender qué queremos que permanezca de nosotros. Quiero explorar esa idea contigo y encontrar una forma auténtica de representarla.",
      "Quiero saber qué significa para ti ir más allá del tiempo, de una etapa o incluso de ti mismo. Desde esa reflexión, podemos construir algo que tenga un significado profundo.",
    ],
    [
      "I want to understand what you want to leave beyond this moment. From that idea, we can build a design that represents your way of transcending.",
      "Tell me what mark you want to leave on your story or on others'. I want to explore that meaning with you and turn it into an image that can stay with you.",
      "I want to discover which part of you you want to remain even when everything changes. From there, we can create a design connected to your purpose.",
      "For me, transcending begins by understanding what we want to remain of ourselves. I want to explore that idea with you and find an authentic way to represent it.",
      "I want to know what it means for you to go beyond time, a chapter, or even yourself. From that reflection, we can build something with deep meaning.",
    ],
  ),
  silence: pack(
    [
      "Quiero explorar contigo todo aquello que existe en los momentos donde no hacen falta palabras. Desde ese silencio, podemos crear un diseño íntimo y profundamente tuyo.",
      "Cuéntame qué significa el silencio para ti: calma, distancia, refugio o introspección. Quiero entenderlo contigo y encontrar una forma de representarlo.",
      "Quiero descubrir qué dices cuando decides no hablar. Desde ahí, podemos construir una imagen que represente todo aquello que llevas dentro.",
      "Hay cosas que solo pueden entenderse cuando todo alrededor se queda en silencio. Quiero explorar ese espacio contigo y convertirlo en un diseño que tenga tu propia interpretación.",
      "Quiero saber qué encuentras cuando te quedas a solas contigo mismo. Desde ese silencio, podemos crear algo que represente aquello que no necesitas explicar con palabras.",
    ],
    [
      "I want to explore with you everything that exists in the moments when words are not needed. From that silence, we can create an intimate design that feels deeply yours.",
      "Tell me what silence means to you: calm, distance, refuge, or introspection. I want to understand it with you and find a way to represent it.",
      "I want to discover what you say when you choose not to speak. From there, we can build an image that represents everything you carry inside.",
      "There are things that can only be understood when everything around goes quiet. I want to explore that space with you and turn it into a design with your own interpretation.",
      "I want to know what you find when you are alone with yourself. From that silence, we can create something that represents what you do not need to explain with words.",
    ],
  ),
};
