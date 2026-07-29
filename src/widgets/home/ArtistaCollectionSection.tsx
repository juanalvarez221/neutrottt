"use client";

import Image from "next/image";
import Link from "next/link";
import { motion, useReducedMotion } from "framer-motion";
import { ArrowRight } from "lucide-react";
import { formatProductPrice, getProductById } from "@/shared/config/products";
import { useSiteLanguage } from "@/shared/i18n/LanguageProvider";

const ARTISTA = getProductById("camiseta-artista");

const SHOWCASE = [
  { src: "/danniel/products/camiseta-artista/1.png", className: "md:col-span-2 md:row-span-2" },
  { src: "/danniel/products/camiseta-artista/2.png", className: "" },
  { src: "/danniel/products/camiseta-artista/5.png", className: "" },
  { src: "/danniel/products/camiseta-artista/7.png", className: "md:col-span-2" },
] as const;

export function ArtistaCollectionSection() {
  const { t, language } = useSiteLanguage();
  const reduceMotion = useReducedMotion();
  const locale = language === "en" ? "en-US" : "es-CO";
  const pendingLabel = t("shopPricePending");

  if (!ARTISTA) return null;

  return (
    <section
      id="artista"
      className="section-surface section-surface--portfolio relative scroll-mt-24 px-4 py-16 sm:px-6 md:py-24"
      aria-labelledby="merch-heading"
    >
      <div className="relative z-[1] mx-auto max-w-[1400px]">
        <div className="grid grid-cols-1 gap-10 lg:grid-cols-[0.95fr_1.05fr] lg:items-end lg:gap-14">
          <header className="max-w-xl">
            <p className="typo-eyebrow typo-eyebrow-muted">{t("merchTag")}</p>
            <p
              className="mt-4 max-w-[28ch] text-[clamp(1.35rem,3.2vw,1.85rem)] font-bold uppercase leading-[1.2] tracking-[0.08em] text-[rgba(var(--rgb-ivory),0.88)]"
              style={{ fontFamily: "var(--font-stack-display)" }}
            >
              {t("merchHook")}
            </p>
            <h2
              id="merch-heading"
              className="typo-gothic mt-5 text-[clamp(2.4rem,6vw,4rem)] text-[rgba(var(--rgb-sand),0.96)]"
            >
              {t("merchTitle")}
            </h2>

            <ul className="mt-6 flex flex-wrap gap-x-5 gap-y-2">
              {(["merchLine1", "merchLine2", "merchLine3"] as const).map((key) => (
                <li
                  key={key}
                  className="font-mono text-[0.65rem] uppercase tracking-[0.16em] text-[rgba(var(--rgb-sand),0.7)]"
                >
                  {t(key)}
                </li>
              ))}
            </ul>

            <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:items-center">
              <Link
                href={`/tienda/${ARTISTA.id}`}
                className="btn-accent typo-cta group inline-flex items-center justify-center gap-2 rounded-xl px-5 py-3.5 active:scale-[0.98]"
              >
                {t("merchCta")}
                <ArrowRight
                  className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5"
                  strokeWidth={1.75}
                />
              </Link>
              <p className="font-mono text-xs uppercase tracking-[0.14em] text-[rgba(var(--rgb-sand),0.85)]">
                {formatProductPrice(ARTISTA, locale, pendingLabel)}
              </p>
            </div>
          </header>

          <div className="grid grid-cols-2 gap-2 md:grid-cols-4 md:grid-rows-2 md:gap-3">
            {SHOWCASE.map((shot, index) => (
              <motion.div
                key={shot.src}
                initial={reduceMotion ? false : { opacity: 0, y: 16 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, amount: 0.35 }}
                transition={{
                  duration: reduceMotion ? 0.01 : 0.45,
                  delay: reduceMotion ? 0 : index * 0.06,
                  ease: [0.22, 1, 0.36, 1],
                }}
                className={`relative overflow-hidden border border-[rgba(var(--rgb-sand),0.14)] bg-[#120c0e] ${shot.className} ${
                  index === 0 ? "aspect-[4/5] md:aspect-auto md:min-h-[22rem]" : "aspect-square"
                }`}
              >
                <Image
                  src={shot.src}
                  alt={`${ARTISTA.title} ${index + 1}`}
                  fill
                  sizes="(max-width: 768px) 50vw, 28vw"
                  className="object-cover transition duration-500 hover:scale-[1.03]"
                />
                <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(180deg,transparent_55%,rgba(8,4,5,0.45))]" />
              </motion.div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
