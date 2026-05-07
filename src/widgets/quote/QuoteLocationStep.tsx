"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { QuoteShell } from "@/widgets/quote/QuoteShell";
import { ArrowRight } from "lucide-react";
import { BodyAreaSelector, type ZoneId } from "@/widgets/quote/BodyAreaSelector";

export function QuoteLocationStep({ size }: { size: string }) {
  const router = useRouter();
  const [zone, setZone] = useState<ZoneId>("brazo");

  const nextHref = useMemo(
    () =>
      `/cotizacion/estilo?size=${encodeURIComponent(size)}&zone=${encodeURIComponent(zone)}`,
    [size, zone],
  );

  return (
    <QuoteShell brand="MALIANTEO">
      <section className="relative mb-8">
        <div className="pointer-events-none absolute -left-10 -top-10 h-40 w-40 rounded-full bg-violet-600/15 blur-[60px]" />
        <h2 className="typo-section text-[2.2rem] leading-[1.05] md:text-[3.2rem]">
          Ubicación
          <br />
          <span className="bg-gradient-to-r from-white to-zinc-400 bg-clip-text text-transparent">
            de tu diseño
          </span>
        </h2>
        <p className="typo-body mt-3 max-w-xl">
          Cuéntame en qué zona quieres tatuarte para ajustar técnica, detalle y
          propuesta visual con mayor precisión.
        </p>
      </section>

      <section className="mb-8">
        <div className="glass-card rounded-2xl p-5">
          <div className="mb-4 flex items-center gap-3">
            <div className="flex h-6 w-6 items-center justify-center rounded-full border border-violet-500/30 bg-violet-600/10">
              <span className="text-[10px] font-bold text-white">2</span>
            </div>
            <h3 className="typo-subtitle text-sm uppercase tracking-[0.14em] text-zinc-200">
              Ubicación en el cuerpo
            </h3>
          </div>
          <BodyAreaSelector zone={zone} onZoneChange={setZone} />
        </div>
      </section>

      <div className="mt-6 flex items-center justify-between gap-3">
        <button
          type="button"
          onClick={() => router.push("/cotizacion/tamano")}
          className="rounded-xl border border-white/10 bg-white/5 px-5 py-3 text-sm font-semibold text-zinc-100 transition hover:bg-white/8"
        >
          Anterior
        </button>

        <button
          type="button"
          onClick={() => router.push(nextHref)}
          className="group inline-flex items-center justify-center gap-2 rounded-xl border border-violet-500/35 bg-gradient-to-r from-violet-700 to-fuchsia-600 px-6 py-3 text-sm font-bold uppercase tracking-[0.2em] text-white transition hover:-translate-y-0.5 hover:shadow-[0_0_20px_rgba(139,92,246,0.35)]"
        >
          Continuar
          <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
        </button>
      </div>
    </QuoteShell>
  );
}

