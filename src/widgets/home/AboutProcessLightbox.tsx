"use client";

import { useCallback, useEffect, useRef } from "react";
import Image from "next/image";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { ChevronLeft, ChevronRight, X } from "lucide-react";
import { useSiteLanguage } from "@/shared/i18n/LanguageProvider";
import {
  ABOUT_PROCESS_SLIDES,
  type AboutProcessSlide,
} from "@/shared/config/aboutProcessSlides";

const easeOut = [0.22, 1, 0.36, 1] as const;
const SWIPE_OFFSET_THRESHOLD = 56;
const SWIPE_VELOCITY_THRESHOLD = 420;

type AboutProcessLightboxProps = {
  index: number;
  onClose: () => void;
  onPrev: () => void;
  onNext: () => void;
};

function LightboxMedia({ slide }: { slide: AboutProcessSlide }) {
  const { t } = useSiteLanguage();
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    if (slide.type !== "video") return;
    const video = videoRef.current;
    if (!video) return;
    void video.play().catch(() => {});
    return () => {
      video.pause();
    };
  }, [slide]);

  if (slide.type === "video") {
    return (
      <div className="about-process-lightbox__media about-process-lightbox__media--video">
        <video
          ref={videoRef}
          src={slide.src}
          className="about-process-lightbox__video"
          controls
          autoPlay
          muted
          loop
          playsInline
          preload="auto"
          aria-label={t(slide.altKey)}
        />
        <span className="about-process-video__warm-filter" aria-hidden />
        <span className="about-process-video__veil" aria-hidden />
      </div>
    );
  }

  return (
    <div className="about-process-lightbox__media about-process-lightbox__media--image">
      <Image
        src={slide.src}
        alt={t(slide.altKey)}
        fill
        quality={96}
        sizes="(max-width: 768px) 92vw, 48rem"
        className="object-contain object-center"
        priority
      />
    </div>
  );
}

export function AboutProcessLightbox({
  index,
  onClose,
  onPrev,
  onNext,
}: AboutProcessLightboxProps) {
  const { t } = useSiteLanguage();
  const reduceMotion = useReducedMotion();
  const slide = ABOUT_PROCESS_SLIDES[index];
  const total = ABOUT_PROCESS_SLIDES.length;

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

  if (!slide) return null;

  return (
    <motion.div
      className="about-process-lightbox portfolio-lightbox fixed inset-0 z-[75] flex items-center justify-center"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.28, ease: easeOut }}
      role="dialog"
      aria-modal="true"
      aria-label={t(slide.captionKey)}
    >
      <motion.button
        type="button"
        className="absolute inset-0 bg-background/90 backdrop-blur-sm"
        aria-label={t("portfolioDetailClose")}
        onClick={onClose}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
      />

      <motion.div
        className="about-process-lightbox__panel portfolio-lightbox__panel relative z-10"
        initial={{ opacity: 0, y: 22, scale: 0.97 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 16, scale: 0.98 }}
        transition={{ duration: 0.38, ease: easeOut }}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="portfolio-lightbox__toolbar">
          <button
            type="button"
            onClick={onClose}
            className="focus-ring inline-flex h-10 w-10 items-center justify-center rounded-full text-zinc-100 transition hover:bg-white/8 active:scale-[0.98]"
            aria-label={t("portfolioDetailClose")}
          >
            <X className="h-5 w-5" strokeWidth={1.75} />
          </button>

          <div className="portfolio-lightbox__title">
            <p className="portfolio-lightbox__eyebrow">{t("aboutProcessLabel")}</p>
            <p className="portfolio-lightbox__heading">{t(slide.captionKey)}</p>
            <p className="portfolio-lightbox__counter">
              {t("portfolioDetailCounter", {
                current: String(index + 1),
                total: String(total),
              })}
            </p>
          </div>

          <span aria-hidden className="h-10 w-10" />
        </div>

        <div className="portfolio-lightbox__stage about-process-lightbox__stage">
          {total > 1 ? (
            <button
              type="button"
              className="portfolio-lightbox__nav portfolio-lightbox__nav--prev focus-ring"
              onClick={onPrev}
              aria-label={t("portfolioDetailPrev")}
            >
              <ChevronLeft className="h-5 w-5" strokeWidth={1.75} />
            </button>
          ) : null}

          <AnimatePresence mode="wait" initial={false}>
            <motion.div
              key={`${index}-${slide.src}`}
              className="about-process-lightbox__frame-wrap"
              initial={reduceMotion ? false : { opacity: 0, x: 28 }}
              animate={{ opacity: 1, x: 0 }}
              exit={reduceMotion ? undefined : { opacity: 0, x: -28 }}
              transition={{ duration: 0.32, ease: easeOut }}
              drag={reduceMotion ? false : "x"}
              dragConstraints={{ left: 0, right: 0 }}
              dragElastic={0.12}
              onDragEnd={(_, info) => {
                if (info.offset.x <= -SWIPE_OFFSET_THRESHOLD || info.velocity.x <= -SWIPE_VELOCITY_THRESHOLD) {
                  onNext();
                  return;
                }
                if (info.offset.x >= SWIPE_OFFSET_THRESHOLD || info.velocity.x >= SWIPE_VELOCITY_THRESHOLD) {
                  onPrev();
                }
              }}
            >
              <LightboxMedia slide={slide} />
            </motion.div>
          </AnimatePresence>

          {total > 1 ? (
            <button
              type="button"
              className="portfolio-lightbox__nav portfolio-lightbox__nav--next focus-ring"
              onClick={onNext}
              aria-label={t("portfolioDetailNext")}
            >
              <ChevronRight className="h-5 w-5" strokeWidth={1.75} />
            </button>
          ) : null}
        </div>

        <p className="portfolio-lightbox__caption">{t(slide.altKey)}</p>
        {!reduceMotion ? (
          <p className="about-process-lightbox__swipe-hint">{t("aboutProcessLightboxSwipeHint")}</p>
        ) : null}
      </motion.div>
    </motion.div>
  );
}

export function AboutProcessLightboxRoot({
  index,
  onClose,
  onChangeIndex,
}: {
  index: number | null;
  onClose: () => void;
  onChangeIndex: (index: number) => void;
}) {
  const total = ABOUT_PROCESS_SLIDES.length;

  const goPrev = useCallback(() => {
    onChangeIndex(((index ?? 0) - 1 + total) % total);
  }, [index, onChangeIndex, total]);

  const goNext = useCallback(() => {
    onChangeIndex(((index ?? 0) + 1) % total);
  }, [index, onChangeIndex, total]);

  return (
    <AnimatePresence>
      {index !== null ? (
        <AboutProcessLightbox
          key="about-process-lightbox"
          index={index}
          onClose={onClose}
          onPrev={goPrev}
          onNext={goNext}
        />
      ) : null}
    </AnimatePresence>
  );
}
