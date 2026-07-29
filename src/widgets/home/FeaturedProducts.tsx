"use client";

import Image from "next/image";
import Link from "next/link";
import { useRef } from "react";
import gsap from "gsap";
import { useGSAP } from "@gsap/react";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { useReducedMotion } from "framer-motion";
import { BookOpen, GraduationCap } from "lucide-react";
import { getProductById } from "@/shared/config/products";
import { useSiteLanguage } from "@/shared/i18n/LanguageProvider";

gsap.registerPlugin(useGSAP, ScrollTrigger);

const SEMINAR = getProductById("seminario-lettering-online");
const BOOK = getProductById("el-poder-de-las-letras");

export function FeaturedProducts() {
  const { t } = useSiteLanguage();
  const reduceMotion = useReducedMotion();
  const rootRef = useRef<HTMLElement>(null);

  useGSAP(
    () => {
      const root = rootRef.current;
      if (!root || reduceMotion) return;

      const blocks = root.querySelectorAll<HTMLElement>("[data-featured-block]");
      blocks.forEach((block, index) => {
        gsap.from(block, {
          opacity: 0,
          x: index % 2 === 0 ? -48 : 48,
          rotateZ: index % 2 === 0 ? -1.2 : 1.2,
          duration: 0.9,
          ease: "power3.out",
          scrollTrigger: {
            trigger: block,
            start: "top 82%",
            once: true,
          },
        });
      });
    },
    { scope: rootRef, dependencies: [reduceMotion] },
  );

  if (!SEMINAR || !BOOK) return null;

  return (
    <section
      ref={rootRef}
      className="section-surface px-4 py-16 sm:px-6 md:py-24"
      aria-label="Productos insignia"
    >
      <div className="mx-auto grid max-w-[1400px] gap-10 lg:gap-14">
        <article
          id="seminario"
          data-featured-block
          className="scroll-mt-24 grid grid-cols-1 overflow-hidden border border-white/10 bg-[#120e0b] md:grid-cols-[1.05fr_0.95fr]"
        >
          <div className="relative aspect-[4/5] md:aspect-auto md:min-h-[28rem]">
            {SEMINAR.image ? (
              <Image
                src={SEMINAR.image}
                alt={SEMINAR.title}
                fill
                sizes="(max-width: 768px) 100vw, 50vw"
                className="object-cover contrast-[1.05] saturate-[0.85]"
              />
            ) : null}
            <div className="absolute inset-0 bg-gradient-to-t from-[#120e0b] via-transparent to-transparent md:bg-gradient-to-r" />
          </div>
          <div className="flex flex-col justify-center px-6 py-8 sm:px-8 md:px-10 md:py-12">
            <p className="inline-flex items-center gap-2 typo-eyebrow typo-eyebrow-muted">
              <GraduationCap className="h-3.5 w-3.5" strokeWidth={1.75} />
              {t("seminarTag")}
            </p>
            <h2
              className="mt-3 text-[clamp(1.85rem,4vw,2.8rem)] leading-none tracking-tight text-[rgba(243,230,215,0.96)]"
              style={{ fontFamily: "var(--font-stack-lettering)" }}
            >
              {t("seminarTitle")}
            </h2>
            <p className="mt-4 max-w-[48ch] text-sm leading-relaxed text-[rgba(var(--rgb-sand),0.72)]">
              {t("seminarBody")}
            </p>
            <div className="mt-7 flex flex-col gap-3 sm:flex-row sm:items-center">
              <Link
                href={`/tienda/${SEMINAR.id}`}
                className="btn-accent typo-cta inline-flex items-center justify-center rounded-xl px-5 py-3.5 active:scale-[0.98]"
              >
                {t("seminarCta")}
              </Link>
              <p className="font-mono text-xs uppercase tracking-[0.14em] text-zinc-500">
                {t("shopPricePending")}
              </p>
            </div>
          </div>
        </article>

        <article
          id="libro"
          data-featured-block
          className="scroll-mt-24 grid grid-cols-1 overflow-hidden border border-white/10 bg-[#100d0a] md:grid-cols-[0.95fr_1.05fr]"
        >
          <div className="order-2 flex flex-col justify-center px-6 py-8 sm:px-8 md:order-1 md:px-10 md:py-12">
            <p className="inline-flex items-center gap-2 typo-eyebrow typo-eyebrow-muted">
              <BookOpen className="h-3.5 w-3.5" strokeWidth={1.75} />
              {t("bookTag")}
            </p>
            <h2
              className="mt-3 text-[clamp(1.85rem,4vw,2.8rem)] leading-none tracking-tight text-[rgba(243,230,215,0.96)]"
              style={{ fontFamily: "var(--font-stack-lettering)" }}
            >
              {t("bookTitle")}
            </h2>
            <p className="mt-4 max-w-[48ch] text-sm leading-relaxed text-[rgba(var(--rgb-sand),0.72)]">
              {t("bookBody")}
            </p>
            <div className="mt-7 flex flex-col gap-3 sm:flex-row sm:items-center">
              <Link
                href={`/tienda/${BOOK.id}`}
                className="btn-accent typo-cta inline-flex items-center justify-center rounded-xl px-5 py-3.5 active:scale-[0.98]"
              >
                {t("bookCta")}
              </Link>
              <p className="font-mono text-xs uppercase tracking-[0.14em] text-zinc-500">
                {t("shopPricePending")}
              </p>
            </div>
          </div>
          <div className="relative order-1 aspect-[4/5] md:order-2 md:aspect-auto md:min-h-[28rem]">
            {BOOK.image ? (
              <Image
                src={BOOK.image}
                alt={BOOK.title}
                fill
                sizes="(max-width: 768px) 100vw, 50vw"
                className="object-cover [filter:sepia(0.18)_contrast(1.08)]"
              />
            ) : null}
            <div className="absolute inset-0 bg-gradient-to-t from-[#100d0a] via-transparent to-transparent md:bg-gradient-to-l" />
          </div>
        </article>
      </div>
    </section>
  );
}
