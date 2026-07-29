const STACK = [
  {
    id: "gothic",
    role: "Brand · Lettering gótico",
    name: "Unifraktur Maguntia",
    stack: "var(--font-stack-brand)",
    sample: "Danniel Cuervo",
    note: "Blackletter de marca. Mismo lenguaje visual que el lettering en piel.",
  },
  {
    id: "display",
    role: "Display elegante",
    name: "Syncopate",
    stack: "var(--font-stack-display)",
    sample: "TRAYECTORIA",
    note: "Títulos de sección, eyebrows y CTAs. Amplio, arquitectónico, limpio.",
  },
  {
    id: "sans",
    role: "Cuerpo UI",
    name: "Inter",
    stack: "var(--font-stack-sans)",
    sample: "Tatuador especializado en lettering. Medellín, Colombia.",
    note: "Párrafos, formularios y lectura continua. Neutro frente al gótico.",
  },
  {
    id: "mono",
    role: "Tech / meta",
    name: "Space Mono",
    stack: "var(--font-mono), ui-monospace, monospace",
    sample: "50+ · 17 años · COP",
    note: "Precios, stats y etiquetas técnicas.",
  },
] as const;

export default function DevFontsPage() {
  return (
    <main className="min-h-[100dvh] bg-[#0e0a0b] text-[rgba(244,239,232,0.96)]">
      <div className="mx-auto max-w-[1400px] px-4 py-10 sm:px-6 md:py-14">
        <header className="mb-10 max-w-2xl space-y-3">
          <p className="typo-eyebrow typo-eyebrow-muted">Dev · Type system</p>
          <h1 className="typo-section">Sistema tipográfico</h1>
          <p className="max-w-[55ch] text-sm leading-relaxed text-[rgba(var(--rgb-ivory),0.65)]">
            Stack bloqueado: Unifraktur (gótico) + Syncopate (elegante) + Inter
            (cuerpo) + Space Mono (tech).
          </p>
        </header>

        <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
          {STACK.map((font) => (
            <section
              key={font.id}
              className="border border-[rgba(var(--rgb-sand),0.18)] bg-[#120c0e] p-6 shadow-[inset_0_1px_0_rgba(244,239,232,0.06)]"
            >
              <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-[rgba(var(--rgb-sand),0.55)]">
                {font.role}
              </p>
              <p className="mt-2 text-sm font-semibold text-[rgba(var(--rgb-ivory),0.9)]">
                {font.name}
              </p>
              <p
                className="mt-8 text-[clamp(2rem,4.5vw,3.2rem)] leading-[1.1] tracking-tight text-[rgba(var(--rgb-sand),0.96)]"
                style={{ fontFamily: font.stack }}
              >
                {font.sample}
              </p>
              <p className="mt-5 max-w-[42ch] text-sm leading-relaxed text-[rgba(var(--rgb-ivory),0.55)]">
                {font.note}
              </p>
            </section>
          ))}
        </div>

        <section className="mt-12 border border-[rgba(var(--rgb-terracotta),0.25)] bg-[#120c0e] p-6 sm:p-8">
          <p className="typo-eyebrow">Composición</p>
          <h2
            className="typo-gothic mt-4 text-[clamp(2.4rem,6vw,4rem)] text-[rgba(var(--rgb-sand),0.96)]"
          >
            Salón de la fama
          </h2>
          <p className="typo-section mt-6 text-[rgba(var(--rgb-ivory),0.92)]">
            Más de 17 años de oficio
          </p>
          <p className="mt-4 max-w-[52ch] text-sm leading-relaxed text-[rgba(var(--rgb-ivory),0.65)]">
            El gótico firma la identidad; Syncopate ordena la jerarquía; Inter
            sostiene la lectura. Así se lee lettering de oficio sin perder
            elegancia.
          </p>
        </section>
      </div>
    </main>
  );
}
