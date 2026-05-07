"use client";

import Link from "next/link";
import { motion } from "framer-motion";

const REELS = [
  { kind: "video", src: "/reels/reel-DTlrOHUCbNq.mp4" },
  { kind: "video", src: "/reels/reel-DRCx8l4jTDd.mp4" },
  { kind: "instagram", src: "https://www.instagram.com/reel/DC-QB2th-3o/embed/" },
] as const;

export function ProjectsCarousel() {
  const reelTrack = [...REELS, ...REELS, ...REELS];

  return (
    <section className="relative overflow-hidden rounded-3xl border border-white/10 bg-black/65 p-5 md:p-8">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(500px_220px_at_15%_0%,rgba(168,85,247,0.28),transparent_58%),radial-gradient(700px_280px_at_95%_100%,rgba(124,58,237,0.2),transparent_60%)]" />

      <div className="relative z-10">
        <p className="text-xs font-semibold uppercase tracking-[0.24em] text-violet-200/80">
          Portafolio en movimiento
        </p>
        <h3 className="typo-section mt-2 text-[2rem] md:text-[2.5rem]">
          Una muestra de lo que hago
        </h3>
        <p className="typo-body mt-3 max-w-3xl">
          Este feed presenta una selección de trabajos reales: composición,
          limpieza técnica y dirección artística aplicada a cada pieza.
        </p>
      </div>

      <div className="relative mt-6 overflow-hidden rounded-3xl border border-white/10 bg-black/45 p-3">
        <div className="pointer-events-none absolute inset-y-0 left-0 z-20 w-10 bg-gradient-to-r from-black/85 to-transparent md:w-16" />
        <div className="pointer-events-none absolute inset-y-0 right-0 z-20 w-10 bg-gradient-to-l from-black/85 to-transparent md:w-16" />

        <motion.div
          className="flex w-max gap-4"
          animate={{ x: ["-66.666%", "0%"] }}
          transition={{ duration: 90, ease: "linear", repeat: Infinity }}
        >
          {reelTrack.map((reel, i) => (
            <article
              key={`${reel.src}-${i}`}
              className="relative overflow-hidden rounded-3xl border border-white/10 bg-black/60 shadow-[0_20px_45px_-30px_rgba(0,0,0,0.9)]"
            >
              <div className="pointer-events-none absolute inset-0 z-10 bg-gradient-to-t from-black/35 via-transparent to-transparent" />
              <div className="relative h-[74dvh] w-[82vw] sm:w-[62vw] md:h-[80dvh] md:w-[44vw] lg:w-[30vw]">
                {reel.kind === "video" ? (
                  <video
                    title={`Reel ${i + 1} de Malianteo`}
                    src={reel.src}
                    className="h-full w-full object-cover"
                    autoPlay
                    muted
                    loop
                    playsInline
                    preload="auto"
                  />
                ) : (
                  <iframe
                    title={`Reel ${i + 1} de Instagram`}
                    src={reel.src}
                    className="h-full w-full border-0"
                    loading="eager"
                    allow="autoplay; encrypted-media; clipboard-write; picture-in-picture; web-share"
                    referrerPolicy="strict-origin-when-cross-origin"
                  />
                )}
              </div>
            </article>
          ))}
        </motion.div>
      </div>

      <div className="relative mt-6 overflow-hidden rounded-2xl border border-violet-400/20 bg-[radial-gradient(560px_220px_at_8%_0%,rgba(168,85,247,0.24),transparent_62%),linear-gradient(180deg,rgba(255,255,255,0.06),transparent_30%),#0d0d10] p-5 md:p-6">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(420px_180px_at_100%_100%,rgba(124,58,237,0.18),transparent_64%)]" />
        <div className="relative z-10">
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-violet-200/80">
            Carta de presentación
          </p>
          <h4 className="typo-section mt-2 text-[1.6rem] md:text-[2rem]">
            Si esta línea visual es para ti, avancemos
          </h4>
          <p className="typo-body mt-3 max-w-2xl">
            Recibe una cotización inteligente con enfoque profesional: sesiones
            estimadas, rango de inversión y propuesta creativa adaptada a tu idea.
          </p>

          <div className="mt-4 grid gap-2 sm:grid-cols-3">
            <div className="rounded-xl border border-white/10 bg-white/5 px-3 py-2">
              <p className="typo-tech text-zinc-200">Estimación por sesiones</p>
            </div>
            <div className="rounded-xl border border-white/10 bg-white/5 px-3 py-2">
              <p className="typo-tech text-zinc-200">Rango de inversión claro</p>
            </div>
            <div className="rounded-xl border border-white/10 bg-white/5 px-3 py-2">
              <p className="typo-tech text-zinc-200">Respuesta personalizada</p>
            </div>
          </div>

          <div className="mt-5 flex flex-col gap-3 sm:flex-row">
            <Link
              href="/cotizacion"
              className="typo-cta inline-flex items-center justify-center rounded-xl border border-violet-500/35 bg-gradient-to-r from-violet-700 to-fuchsia-600 px-5 py-3.5 text-white transition hover:-translate-y-0.5 hover:shadow-[0_0_22px_rgba(139,92,246,0.35)]"
            >
              Cotizar mi proyecto
            </Link>
            <Link
              href="/contacto"
              className="typo-cta inline-flex items-center justify-center rounded-xl border border-white/15 bg-white/5 px-5 py-3.5 text-zinc-100 transition hover:bg-white/10"
            >
              Resolver dudas por contacto
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}

