"use client";

import Image from "next/image";
import Link from "next/link";
import { motion, useReducedMotion } from "framer-motion";
import { useSiteLanguage } from "@/shared/i18n/LanguageProvider";
import type { SiteCopyKey } from "@/shared/i18n/siteLanguage";
import { scrollRevealViewport } from "@/shared/motion/scrollReveal";

const STAGGER_S = 0.58;

const PORTFOLIO_PIECES: {
  src: string;
  altKey: SiteCopyKey;
  rotate: number;
  className: string;
}[] = [
  {
    src: "/portfolio/piece-lettering-1.png",
    altKey: "portfolioPiece1Alt",
    rotate: -5.5,
    className:
      "left-[4%] top-[1%] z-[11] w-[min(52vw,200px)] md:left-[5%] md:top-[4%] md:w-[240px]",
  },
  {
    src: "/portfolio/piece-realism-1.png",
    altKey: "portfolioPiece2Alt",
    rotate: 4,
    className:
      "right-[3%] top-[18%] z-[12] w-[min(50vw,190px)] md:left-[32%] md:right-auto md:top-[1%] md:w-[230px]",
  },
  {
    src: "/portfolio/piece-lettering-2.png",
    altKey: "portfolioPiece3Alt",
    rotate: -2.5,
    className:
      "left-[6%] top-[36%] z-[13] w-[min(48vw,185px)] md:left-auto md:right-[4%] md:top-[16%] md:w-[220px]",
  },
  {
    src: "/portfolio/piece-realism-2.png",
    altKey: "portfolioPiece4Alt",
    rotate: 5,
    className:
      "right-[5%] top-[52%] z-[14] w-[min(50vw,190px)] md:left-[10%] md:right-auto md:top-auto md:bottom-[8%] md:w-[225px]",
  },
  {
    src: "/portfolio/piece-realism-3.png",
    altKey: "portfolioPiece5Alt",
    rotate: -4,
    className:
      "left-[8%] top-[68%] z-[15] w-[min(52vw,200px)] md:left-auto md:right-[8%] md:top-auto md:bottom-[4%] md:w-[235px]",
  },
];

function PortfolioFramedPhoto({
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
  const stickDelay = delay + (reducedMotion ? 0 : 0.12);

  return (
    <motion.figure
      className={`absolute ${piece.className}`}
      initial={
        reducedMotion
          ? { opacity: 1, rotate: piece.rotate, y: 0, scale: 1 }
          : { opacity: 0, rotate: piece.rotate + 12, y: -42, scale: 1.2 }
      }
      whileInView={
        reducedMotion
          ? { opacity: 1, rotate: piece.rotate, y: 0, scale: 1 }
          : { opacity: 1, rotate: piece.rotate, y: 0, scale: 1 }
      }
      viewport={scrollRevealViewport}
      transition={{
        delay: stickDelay,
        type: reducedMotion ? "tween" : "spring",
        duration: reducedMotion ? 0.35 : undefined,
        stiffness: 380,
        damping: 24,
        mass: 0.85,
      }}
      style={{ transformOrigin: "50% 115%" }}
    >
      <motion.span
        aria-hidden
        className="portfolio-photo-flash pointer-events-none absolute -inset-[18%] z-20 rounded-sm"
        initial={{ opacity: 0 }}
        whileInView={{ opacity: [0, 1, 0] }}
        viewport={scrollRevealViewport}
        transition={{
          delay: flashDelay,
          duration: reducedMotion ? 0.2 : 0.4,
          times: [0, 0.15, 1],
          ease: "easeOut",
        }}
      />

      <motion.div
        className="portfolio-frame relative"
        whileHover={{ y: -4, transition: { duration: 0.25 } }}
      >
        <div className="portfolio-frame__mat">
          <div className="portfolio-frame__opening">
            <Image
              src={piece.src}
              alt={t(piece.altKey)}
              fill
              quality={92}
              sizes="240px"
              className="object-contain"
              priority={index < 2}
            />
          </div>
        </div>
      </motion.div>
    </motion.figure>
  );
}

function PortfolioPhotoWall({ t }: { t: (key: SiteCopyKey) => string }) {
  const reducedMotion = useReducedMotion();

  return (
    <motion.div
      className="portfolio-photo-wall page-bleed-x relative mt-8 min-h-[clamp(26rem,128vw,34rem)] w-full overflow-hidden border-y border-white/[0.08] sm:mt-10 md:min-h-[34rem] lg:min-h-[36rem]"
      initial={{ opacity: 0 }}
      whileInView={{ opacity: 1 }}
      viewport={scrollRevealViewport}
      transition={{ duration: 0.5 }}
    >
      {PORTFOLIO_PIECES.map((piece, i) => (
        <PortfolioFramedPhoto
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
    <section className="page-section section-surface section-surface--portfolio section-divider relative w-full overflow-hidden">

      <div className="page-section-pad relative z-10 page-section-y">
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
      </div>

      <div className="section-surface section-surface--portfolio-cta section-divider relative border-t border-honey/15">
        <div className="page-section-pad relative z-10 py-10 sm:py-12 md:py-14">
          <p className="typo-eyebrow">{t("projectsCtaTag")}</p>
          <h4 className="typo-section-md mt-2">{t("projectsCtaTitle")}</h4>
          <p className="typo-body mt-3">{t("projectsCtaBody")}</p>

          <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
            <Link
              href="/cotizacion"
              className="typo-cta inline-flex w-full items-center justify-center rounded-xl px-5 py-3.5 sm:w-auto btn-accent focus-ring active:scale-[0.98]"
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
