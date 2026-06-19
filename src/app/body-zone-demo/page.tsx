"use client";

import { useState } from "react";
import { BodyZoneSelector, type BodyZoneResult } from "@/widgets/quote/BodyZoneSelector";

export default function BodyZoneDemoPage() {
  const [result, setResult] = useState<BodyZoneResult | null>(null);

  return (
    <main className="min-h-[100dvh] bg-[#150F0A] px-4 py-8 lg:px-8 lg:py-12">
      <div className="mx-auto max-w-[1400px] space-y-6">
        <header className="space-y-2">
          <p className="text-[12px] font-semibold uppercase tracking-[0.28em] text-[#A07840]">
            Neutrott · Mapa corporal
          </p>
          <h1 className="text-3xl font-bold tracking-tight text-zinc-50 md:text-4xl">
            ¿Dónde llevará tu diseño?
          </h1>
          <p className="max-w-[60ch] text-[15px] leading-relaxed text-zinc-400">
            Toca el cuerpo o responde paso a paso. El maniquí se ilumina con cada elección.
          </p>
        </header>

        <BodyZoneSelector onConfirm={setResult} />

        {result ? (
          <section className="rounded-2xl border border-[#5C4A32]/40 bg-[#1C1410] p-4 lg:p-5">
            <p className="mb-2 text-[12px] font-semibold uppercase tracking-[0.18em] text-[#A07840]">
              Resultado emitido a onConfirm
            </p>
            <pre className="overflow-x-auto rounded-xl bg-black/40 p-4 font-mono text-[12px] leading-relaxed text-[#E8A84E]">
              {JSON.stringify(result, null, 2)}
            </pre>
          </section>
        ) : null}
      </div>
    </main>
  );
}
