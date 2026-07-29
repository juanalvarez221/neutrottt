const CANDIDATES = [
  {
    id: "marck",
    name: "Marck Script",
    stack: "var(--font-lettering-marck), cursive, serif",
  },
  {
    id: "meddon",
    name: "Meddon",
    stack: "var(--font-lettering-meddon), cursive, serif",
  },
  {
    id: "alex",
    name: "Alex Brush",
    stack: "var(--font-lettering-alex), cursive, serif",
  },
] as const;

export default function DevFontsPage() {
  return (
    <main className="min-h-[100dvh] bg-[#17110d] text-[rgba(243,230,215,0.96)]">
      <div className="mx-auto max-w-[1400px] px-4 py-10 sm:px-6 md:py-14">
        <header className="mb-10 max-w-2xl space-y-2">
          <p className="font-mono text-[11px] font-semibold uppercase tracking-[0.18em] text-zinc-500">
            Dev · Lettering candidates
          </p>
          <h1
            className="text-2xl font-semibold tracking-tight sm:text-3xl"
            style={{ fontFamily: "var(--font-stack-display)" }}
          >
            Comparativa de lettering
          </h1>
          <p className="text-sm leading-relaxed text-zinc-500">
            Tres candidatas para --font-lettering. No está en el nav público.
            Elige una antes de Fase 5.
          </p>
        </header>

        <div className="grid grid-cols-1 gap-8 lg:grid-cols-3">
          {CANDIDATES.map((font) => (
            <section
              key={font.id}
              className="border border-white/10 bg-[#1c1410] p-6 shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]"
            >
              <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-zinc-500">
                {font.name}
              </p>
              <p
                className="mt-6 text-[clamp(2.4rem,5vw,3.6rem)] leading-none tracking-tight text-[rgba(243,230,215,0.98)]"
                style={{ fontFamily: font.stack }}
              >
                Danniel Cuervo
              </p>
              <h2
                className="mt-8 text-[clamp(1.75rem,3.5vw,2.75rem)] leading-[1.05] tracking-tight text-[rgba(212,160,102,0.95)]"
                style={{ fontFamily: font.stack }}
              >
                Premios y lettering
              </h2>
              <p className="mt-4 max-w-[36ch] text-sm leading-relaxed text-zinc-500">
                Muestra de título de sección en tamaño grande para comparar
                ritmo y legibilidad.
              </p>
            </section>
          ))}
        </div>
      </div>
    </main>
  );
}
