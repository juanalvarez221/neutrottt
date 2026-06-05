"use client";

import Image from "next/image";
import Link from "next/link";
import { motion, useReducedMotion } from "framer-motion";
import { Layers } from "lucide-react";
import { useSiteLanguage } from "@/shared/i18n/LanguageProvider";
import type { SiteCopyKey } from "@/shared/i18n/siteLanguage";

const STAGGER_S = 0.58;

const PORTFOLIO_PIECES: {
  src: string;
  titleKey: SiteCopyKey;
  altKey: SiteCopyKey;
  categoryKey: SiteCopyKey;
  objectPosition?: string;
  rotate: number;
  className: string;
}[] = [
  {
    src: "/portfolio/piece-lettering-1.png",
    titleKey: "portfolioPiece1Title",
    altKey: "portfolioPiece1Alt",
    categoryKey: "portfolioCatLettering",
    objectPosition: "center 45%",
    rotate: -5.5,
    className:
      "left-[4%] top-[1%] z-[11] w-[min(52vw,200px)] md:left-[5%] md:top-[4%] md:w-[240px]",
  },
  {
    src: "/portfolio/piece-realism-1.png",
    titleKey: "portfolioPiece2Title",
    altKey: "portfolioPiece2Alt",
    categoryKey: "portfolioCatShadows",
    objectPosition: "center 40%",
    rotate: 4,
    className:
      "right-[3%] top-[18%] z-[12] w-[min(50vw,190px)] md:left-[32%] md:right-auto md:top-[1%] md:w-[230px]",
  },
  {
    src: "/portfolio/piece-lettering-2.png",
    titleKey: "portfolioPiece3Title",
    altKey: "portfolioPiece3Alt",
    categoryKey: "portfolioCatLettering",
    objectPosition: "center center",
    rotate: -2.5,
    className:
      "left-[6%] top-[36%] z-[13] w-[min(48vw,185px)] md:left-auto md:right-[4%] md:top-[16%] md:w-[220px]",
  },
  {
    src: "/portfolio/piece-realism-2.png",
    titleKey: "portfolioPiece4Title",
    altKey: "portfolioPiece4Alt",
    categoryKey: "portfolioCatShadows",
    objectPosition: "center 35%",
    rotate: 5,
    className:
      "right-[5%] top-[52%] z-[14] w-[min(50vw,190px)] md:left-[10%] md:right-auto md:top-auto md:bottom-[8%] md:w-[225px]",
  },
  {
    src: "/portfolio/piece-realism-3.png",
    titleKey: "portfolioPiece5Title",
    altKey: "portfolioPiece5Alt",
    categoryKey: "portfolioCatShadows",
    objectPosition: "center 30%",
    rotate: -4,
    className:
      "left-[8%] top-[68%] z-[15] w-[min(52vw,200px)] md:left-auto md:right-[8%] md:top-auto md:bottom-[4%] md:w-[235px]",
  },
];

function PortfolioPolaroid({
  piece,
  index,
  t,
  reducedMotion,
}: {
  piece: (typeof PORTFOLIO_PIECES)[number];
  index: number;
  t: (key: SiteCopyKey) => string;
  reducedMotion: boolean;
}) {
  const delay = index * STAGGER_S;
  const flashDelay = delay;
  const photoDelay = delay + (reducedMotion ? 0 : 0.14);

  return (
    <motion.figure
      className={`absolute ${piece.className}`}
      initial={
        reducedMotion
          ? { opacity: 1, rotate: piece.rotate, y: 0, scale: 1 }
          : { opacity: 0, rotate: piece.rotate + 10, y: -28, scale: 1.12 }
      }
      whileInView={
        reducedMotion
          ? { opacity: 1, rotate: piece.rotate, y: 0, scale: 1 }
          : { opacity: 1, rotate: piece.rotate, y: 0, scale: 1 }
      }
      viewport={{ once: true, amount: 0.35 }}
      transition={{
        delay: photoDelay,
        duration: 0.55,
        ease: [0.22, 1, 0.36, 1],
      }}
      style={{ transformOrigin: "50% 120%" }}
    >
      {/* Flash previo al pegado */}
      <motion.span
        aria-hidden
        className="portfolio-photo-flash pointer-events-none absolute -inset-[18%] z-20 rounded-sm"
        initial={{ opacity: 0 }}
        whileInView={{ opacity: [0, 1, 0] }}
        viewport={{ once: true, amount: 0.35 }}
        transition={{
          delay: flashDelay,
          duration: reducedMotion ? 0.2 : 0.42,
          times: [0, 0.18, 1],
          ease: "easeOut",
        }}
      />

      {/* Cinta */}
      <span
        aria-hidden
        className="portfolio-polaroid-tape absolute -top-2 left-1/2 z-30 h-5 w-14 -translate-x-1/2 rotate-[-2deg] rounded-[2px] opacity-90"
      />

      <motion.div
        className="portfolio-polaroid relative overflow-hidden rounded-[3px] p-2 pb-3 sm:p-2.5 sm:pb-3.5"
        whileHover={{ y: -4, transition: { duration: 0.25 } }}
      >
        <div className="relative aspect-[4/5] overflow-hidden bg-zinc-900">
          <Image
            src={piece.src}
            alt={t(piece.altKey)}
            fill
            quality={92}
            sizes="240px"
            className="object-cover"
            style={{ objectPosition: piece.objectPosition ?? "center" }}
            priority={index < 2}
          />
        </div>
        <figcaption className="mt-2 px-0.5">
          <p className="typo-polaroid-tag">{t(piece.categoryKey)}</p>
          <p className="typo-polaroid-title mt-0.5">{t(piece.titleKey)}</p>
        </figcaption>
      </motion.div>
    </motion.figure>
  );
}

function PortfolioPhotoWall({ t }: { t: (key: SiteCopyKey) => string }) {
  const reducedMotion = useReducedMotion();

  return (
    <motion.div
      className="portfolio-photo-wall page-bleed-x relative mt-8 min-h-[42rem] w-full overflow-hidden border-y border-white/[0.08] sm:mt-10 md:min-h-[38rem] lg:min-h-[40rem]"
      initial={{ opacity: 0 }}
      whileInView={{ opacity: 1 }}
      viewport={{ once: true, amount: 0.12 }}
      transition={{ duration: 0.5 }}
    >
      {PORTFOLIO_PIECES.map((piece, i) => (
        <PortfolioPolaroid
          key={piece.src}
          piece={piece}
          index={i}
          t={t}
          reducedMotion={!!reducedMotion}
        />
      ))}
    </motion.div>
  );
}

export function ProjectsCarousel() {
  const { t } = useSiteLanguage();

  return (
    <section className="page-section relative w-full overflow-hidden border-t border-white/[0.06] bg-black/80">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(500px_220px_at_15%_0%,rgba(251,191,36,0.28),transparent_58%),radial-gradient(700px_280px_at_95%_100%,rgba(217,119,6,0.2),transparent_60%)]" />

      <div className="page-section-pad relative z-10 py-10 sm:py-12 md:py-16">
        <p className="typo-eyebrow">{t("projectsTag")}</p>

        <div className="mt-4 flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between sm:gap-8">
          <div className="min-w-0 flex-1">
            <h3 className="typo-section mt-4 sm:mt-0">{t("projectsTitle")}</h3>
            <p className="typo-body typo-body-emphasis mt-3">{t("projectsBody")}</p>
          </div>

          <div className="relative flex shrink-0 items-center gap-3 sm:flex-col sm:items-end sm:gap-1">
            <div className="portfolio-one-pct-glow absolute inset-0 -m-4 rounded-full" aria-hidden />
            <p className="typo-stat relative">1%</p>
            <p className="typo-micro relative text-right text-zinc-400 sm:max-w-[9rem]">
              {t("projectsOnePercentNote")}
            </p>
          </div>
        </div>

        <PortfolioPhotoWall t={t} />

        <p className="typo-micro typo-eyebrow-muted mt-5 flex items-center justify-center gap-2 px-2 text-center font-medium">
          <Layers className="h-3.5 w-3.5 shrink-0 text-amber-500/70" strokeWidth={2} />
          {t("projectsFootnote")}
        </p>
      </div>

      <div className="relative border-t border-amber-400/20 bg-[radial-gradient(560px_220px_at_8%_0%,rgba(251,191,36,0.24),transparent_62%),linear-gradient(180deg,rgba(255,255,255,0.06),transparent_30%),#0d0d10]">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(420px_180px_at_100%_100%,rgba(217,119,6,0.18),transparent_64%)]" />
        <div className="page-section-pad relative z-10 py-10 sm:py-12 md:py-14">
          <p className="typo-eyebrow">{t("projectsCtaTag")}</p>
          <h4 className="typo-section-md mt-2">{t("projectsCtaTitle")}</h4>
          <p className="typo-body mt-3">{t("projectsCtaBody")}</p>

          <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
            <Link
              href="/cotizacion"
              className="typo-cta inline-flex w-full items-center justify-center rounded-xl border border-amber-500/35 bg-gradient-to-r from-amber-700 to-orange-600 px-5 py-3.5 text-white transition hover:-translate-y-0.5 hover:shadow-[0_0_22px_rgba(245,158,11,0.35)] sm:w-auto"
            >
              {t("projectsCta1")}
            </Link>
            <Link
              href="/contacto"
              className="typo-cta inline-flex w-full items-center justify-center rounded-xl border border-white/15 bg-white/5 px-5 py-3.5 text-zinc-100 transition hover:bg-white/10 sm:w-auto"
            >
              {t("projectsCta2")}
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}
