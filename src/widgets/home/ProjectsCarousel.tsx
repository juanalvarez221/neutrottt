"use client";

import Image from "next/image";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { ChevronLeft, ChevronRight, X } from "lucide-react";
import { useSiteLanguage } from "@/shared/i18n/LanguageProvider";
import type { SiteCopyKey } from "@/shared/i18n/siteLanguage";
import { scrollRevealViewport } from "@/shared/motion/scrollReveal";

const STAGGER_S = 0.14;

type PortfolioPiece = {
  src: string;
  altKey: SiteCopyKey;
  titleKey: SiteCopyKey;
  categoryKey: SiteCopyKey;
  rotate: number;
};

const PORTFOLIO_PIECES: PortfolioPiece[] = [
  {
    src: "/portfolio/piece-lettering-1.png",
    altKey: "portfolioPiece1Alt",
    titleKey: "portfolioPiece1Title",
    categoryKey: "portfolioCatLettering",
    rotate: -2.5,
  },
  {
    src: "/portfolio/piece-realism-1.png",
    altKey: "portfolioPiece2Alt",
    titleKey: "portfolioPiece2Title",
    categoryKey: "portfolioCatRealism",
    rotate: 2,
  },
  {
    src: "/portfolio/piece-lettering-2.png",
    altKey: "portfolioPiece3Alt",
    titleKey: "portfolioPiece3Title",
    categoryKey: "portfolioCatLettering",
    rotate: -1.5,
  },
  {
    src: "/portfolio/piece-realism-2.png",
    altKey: "portfolioPiece4Alt",
    titleKey: "portfolioPiece4Title",
    categoryKey: "portfolioCatShadows",
    rotate: 2.5,
  },
  {
    src: "/portfolio/piece-realism-3.png",
    altKey: "portfolioPiece5Alt",
    titleKey: "portfolioPiece5Title",
    categoryKey: "portfolioCatRealism",
    rotate: -2,
  },
  {
    src: "/portfolio/piece-peru-hannya.png",
    altKey: "portfolioPiece6Alt",
    titleKey: "portfolioPiece6Title",
    categoryKey: "portfolioCatShadows",
    rotate: 1.5,
  },
];

function PortfolioFramedImage({
  piece,
  sizes,
  priority = false,
}: {
  piece: PortfolioPiece;
  sizes: string;
  priority?: boolean;
}) {
  const { t } = useSiteLanguage();

  return (
    <div className="portfolio-frame relative w-full">
      <div className="portfolio-frame__mat">
        <div className="portfolio-frame__opening">
          <Image
            src={piece.src}
            alt={t(piece.altKey)}
            fill
            quality={92}
            sizes={sizes}
            className="object-contain"
            priority={priority}
          />
        </div>
      </div>
    </div>
  );
}

function PortfolioFramedPhoto({
  piece,
  index,
  t,
  reducedMotion,
  onOpen,
}: {
  piece: PortfolioPiece;
  index: number;
  t: (key: SiteCopyKey, vars?: Record<string, string>) => string;
  reducedMotion: boolean;
  onOpen: (index: number) => void;
}) {
  const delay = index * STAGGER_S;
  const flashDelay = delay;
  const stickDelay = delay + (reducedMotion ? 0 : 0.08);

  return (
    <motion.figure
      className={`portfolio-wall-cell portfolio-wall-cell--${index + 1}`}
      initial={
        reducedMotion
          ? { opacity: 1, rotate: piece.rotate, y: 0, scale: 1 }
          : { opacity: 0, rotate: piece.rotate + 4, y: -18, scale: 1.03 }
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
        mass: 0.82,
      }}
      style={{ transformOrigin: "50% 88%" }}
      whileHover={
        reducedMotion
          ? undefined
          : { y: -6, scale: 1.03, transition: { type: "spring", stiffness: 420, damping: 22 } }
      }
    >
      <motion.span
        aria-hidden
        className="portfolio-photo-flash pointer-events-none absolute -inset-[14%] z-20 rounded-sm"
        initial={{ opacity: 0 }}
        whileInView={{ opacity: [0, 1, 0] }}
        viewport={scrollRevealViewport}
        transition={{
          delay: flashDelay,
          duration: reducedMotion ? 0.2 : 0.38,
          times: [0, 0.15, 1],
          ease: "easeOut",
        }}
      />

      <button
        type="button"
        className="portfolio-wall-cell__trigger focus-ring"
        onClick={() => onOpen(index)}
        aria-label={`${t("portfolioViewDetail")}: ${t(piece.titleKey)}`}
      >
        <PortfolioFramedImage
          piece={piece}
          sizes="(max-width: 639px) 44vw, (max-width: 1023px) 30vw, 280px"
          priority={index < 2}
        />
        <span className="portfolio-wall-cell__hint">{t("portfolioViewDetail")}</span>
      </button>
    </motion.figure>
  );
}

function PortfolioPieceLightbox({
  index,
  t,
  onClose,
  onPrev,
  onNext,
}: {
  index: number;
  t: (key: SiteCopyKey, vars?: Record<string, string>) => string;
  onClose: () => void;
  onPrev: () => void;
  onNext: () => void;
}) {
  const piece = PORTFOLIO_PIECES[index];
  const total = PORTFOLIO_PIECES.length;

  useEffect(() => {
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, []);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
      if (event.key === "ArrowLeft") onPrev();
      if (event.key === "ArrowRight") onNext();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose, onNext, onPrev]);

  return (
    <motion.div
      className="portfolio-lightbox fixed inset-0 z-[75] flex items-center justify-center"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      role="dialog"
      aria-modal="true"
      aria-label={t(piece.titleKey)}
    >
      <button
        type="button"
        className="absolute inset-0 bg-background/90 backdrop-blur-sm"
        aria-label={t("portfolioDetailClose")}
        onClick={onClose}
      />

      <motion.div
        key={piece.src}
        initial={{ opacity: 0, y: 20, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 14, scale: 0.98 }}
        transition={{ duration: 0.32, ease: [0.22, 1, 0.36, 1] }}
        className="portfolio-lightbox__panel relative z-10"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="portfolio-lightbox__toolbar">
          <button
            type="button"
            onClick={onClose}
            className="focus-ring inline-flex h-11 w-11 items-center justify-center rounded-full border border-white/10 bg-white/5 text-zinc-100 transition hover:bg-white/10 active:scale-[0.98]"
            aria-label={t("portfolioDetailClose")}
          >
            <X className="h-5 w-5" strokeWidth={1.75} />
          </button>

          <div className="portfolio-lightbox__title">
            <p className="portfolio-lightbox__eyebrow">{t(piece.categoryKey)}</p>
            <p className="portfolio-lightbox__heading">{t(piece.titleKey)}</p>
            <p className="portfolio-lightbox__counter">
              {t("portfolioDetailCounter", {
                current: String(index + 1),
                total: String(total),
              })}
            </p>
          </div>

          <span aria-hidden className="h-11 w-11" />
        </div>

        <div
          className="portfolio-lightbox__stage"
          onClick={onClose}
          role="presentation"
        >
          {total > 1 ? (
            <button
              type="button"
              className="portfolio-lightbox__nav portfolio-lightbox__nav--prev focus-ring"
              onClick={(event) => {
                event.stopPropagation();
                onPrev();
              }}
              aria-label={t("portfolioDetailPrev")}
            >
              <ChevronLeft className="h-5 w-5" strokeWidth={1.75} />
            </button>
          ) : null}

          <div
            className="portfolio-lightbox__frame-wrap"
            onClick={(event) => event.stopPropagation()}
          >
            <PortfolioFramedImage piece={piece} sizes="(max-width: 768px) 92vw, 52rem" priority />
          </div>

          {total > 1 ? (
            <button
              type="button"
              className="portfolio-lightbox__nav portfolio-lightbox__nav--next focus-ring"
              onClick={(event) => {
                event.stopPropagation();
                onNext();
              }}
              aria-label={t("portfolioDetailNext")}
            >
              <ChevronRight className="h-5 w-5" strokeWidth={1.75} />
            </button>
          ) : null}
        </div>

        <p className="portfolio-lightbox__caption">{t(piece.altKey)}</p>
      </motion.div>
    </motion.div>
  );
}

function PortfolioPhotoWall({ t }: { t: (key: SiteCopyKey, vars?: Record<string, string>) => string }) {
  const reducedMotion = useReducedMotion();
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);

  const closeLightbox = useCallback(() => setSelectedIndex(null), []);

  const goPrev = useCallback(() => {
    setSelectedIndex((current) => {
      if (current === null) return null;
      return (current - 1 + PORTFOLIO_PIECES.length) % PORTFOLIO_PIECES.length;
    });
  }, []);

  const goNext = useCallback(() => {
    setSelectedIndex((current) => {
      if (current === null) return null;
      return (current + 1) % PORTFOLIO_PIECES.length;
    });
  }, []);

  return (
    <>
      <motion.div
        className="portfolio-photo-wall portfolio-photo-wall--gallery page-bleed-x relative mt-8 w-full border-y border-white/[0.08] sm:mt-10"
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
            onOpen={setSelectedIndex}
          />
        ))}
      </motion.div>

      <AnimatePresence>
        {selectedIndex !== null ? (
          <PortfolioPieceLightbox
            key="portfolio-lightbox"
            index={selectedIndex}
            t={t}
            onClose={closeLightbox}
            onPrev={goPrev}
            onNext={goNext}
          />
        ) : null}
      </AnimatePresence>
    </>
  );
}

export function ProjectsCarousel() {
  const { t } = useSiteLanguage();

  return (
    <section className="page-section section-surface section-surface--portfolio section-divider relative w-full overflow-x-clip">
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
