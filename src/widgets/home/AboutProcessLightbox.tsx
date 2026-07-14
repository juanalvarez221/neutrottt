"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Image from "next/image";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { ChevronLeft, ChevronRight, X } from "lucide-react";
import { useSiteLanguage } from "@/shared/i18n/LanguageProvider";
import {
  ABOUT_PROCESS_SLIDES,
  type AboutProcessSlide,
} from "@/shared/config/aboutProcessSlides";
import { MediaLightboxPortal } from "@/shared/ui/MediaLightboxPortal";

const springPanel = { type: "spring" as const, stiffness: 280, damping: 28, mass: 0.85 };
const easeOut = [0.22, 1, 0.36, 1] as const;
const SWIPE_OFFSET_THRESHOLD = 48;
const SWIPE_VELOCITY_THRESHOLD = 380;

type AboutProcessLightboxProps = {
  index: number;
  onClose: () => void;
  onPrev: () => void;
  onNext: () => void;
  onSelectIndex: (index: number) => void;
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
      <div
        className="about-process-lightbox__media about-process-lightbox__media--video"
        onClick={(event) => event.stopPropagation()}
      >
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
        <span className="about-process-lightbox__media-haze" aria-hidden />
      </div>
    );
  }

  return (
    <div
      className="about-process-lightbox__media about-process-lightbox__media--image"
      onClick={(event) => event.stopPropagation()}
    >
      <Image
        src={slide.src}
        alt={t(slide.altKey)}
        fill
        quality={96}
        sizes="(max-width: 639px) 100vw, (max-width: 1023px) 88vw, min(70vw, 56rem)"
        className="object-contain object-center"
        priority
        draggable={false}
      />
    </div>
  );
}

export function AboutProcessLightbox({
  index,
  onClose,
  onPrev,
  onNext,
  onSelectIndex,
}: AboutProcessLightboxProps) {
  const { t } = useSiteLanguage();
  const reduceMotion = useReducedMotion();
  const slide = ABOUT_PROCESS_SLIDES[index];
  const total = ABOUT_PROCESS_SLIDES.length;
  const [direction, setDirection] = useState(0);
  const closeButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeButtonRef.current?.focus();
    return () => {
      document.body.style.overflow = previous;
    };
  }, []);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
      }
      if (event.key === "ArrowLeft") {
        event.preventDefault();
        setDirection(-1);
        onPrev();
      }
      if (event.key === "ArrowRight") {
        event.preventDefault();
        setDirection(1);
        onNext();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose, onNext, onPrev]);

  const goPrev = useCallback(() => {
    setDirection(-1);
    onPrev();
  }, [onPrev]);

  const goNext = useCallback(() => {
    setDirection(1);
    onNext();
  }, [onNext]);

  if (!slide) return null;

  const slideOffset = direction >= 0 ? 36 : -36;

  return (
    <motion.div
      className="about-process-lightbox"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: reduceMotion ? 0.12 : 0.28, ease: easeOut }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="about-process-lightbox-title"
    >
      <motion.button
        type="button"
        className="about-process-lightbox__backdrop"
        aria-label={t("portfolioDetailClose")}
        onClick={onClose}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
      />

      <motion.div
        className="about-process-lightbox__shell"
        initial={reduceMotion ? false : { opacity: 0, y: 28, scale: 0.985 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={reduceMotion ? undefined : { opacity: 0, y: 18, scale: 0.99 }}
        transition={reduceMotion ? { duration: 0.15 } : springPanel}
        onClick={(event) => event.stopPropagation()}
      >
        <header className="about-process-lightbox__chrome">
          <button
            ref={closeButtonRef}
            type="button"
            onClick={onClose}
            className="about-process-lightbox__icon-btn focus-ring"
            aria-label={t("portfolioDetailClose")}
          >
            <X className="h-5 w-5" strokeWidth={1.75} />
          </button>

          <div className="about-process-lightbox__heading-block">
            <p className="about-process-lightbox__eyebrow">{t("aboutProcessLabel")}</p>
            <h2 id="about-process-lightbox-title" className="about-process-lightbox__title">
              {t(slide.captionKey)}
            </h2>
            <p className="about-process-lightbox__counter typo-tech">
              {t("portfolioDetailCounter", {
                current: String(index + 1),
                total: String(total),
              })}
            </p>
          </div>

          <div className="about-process-lightbox__chrome-actions">
            {total > 1 ? (
              <>
                <button
                  type="button"
                  className="about-process-lightbox__icon-btn about-process-lightbox__icon-btn--desktop focus-ring"
                  onClick={goPrev}
                  aria-label={t("portfolioDetailPrev")}
                >
                  <ChevronLeft className="h-5 w-5" strokeWidth={1.75} />
                </button>
                <button
                  type="button"
                  className="about-process-lightbox__icon-btn about-process-lightbox__icon-btn--desktop focus-ring"
                  onClick={goNext}
                  aria-label={t("portfolioDetailNext")}
                >
                  <ChevronRight className="h-5 w-5" strokeWidth={1.75} />
                </button>
              </>
            ) : null}
            <span className="about-process-lightbox__chrome-spacer" aria-hidden />
          </div>
        </header>

        <div
          className="about-process-lightbox__stage"
          onClick={onClose}
          role="presentation"
        >
          {total > 1 ? (
            <button
              type="button"
              className="about-process-lightbox__nav about-process-lightbox__nav--prev focus-ring"
              onClick={(event) => {
                event.stopPropagation();
                goPrev();
              }}
              aria-label={t("portfolioDetailPrev")}
            >
              <ChevronLeft className="h-5 w-5" strokeWidth={1.75} />
            </button>
          ) : null}

          <div className="about-process-lightbox__viewport">
            <AnimatePresence mode="wait" initial={false}>
              <motion.div
                key={`${index}-${slide.src}`}
                className="about-process-lightbox__frame"
                initial={
                  reduceMotion ? false : { opacity: 0, x: slideOffset, scale: 0.985 }
                }
                animate={{ opacity: 1, x: 0, scale: 1 }}
                exit={
                  reduceMotion
                    ? undefined
                    : { opacity: 0, x: -slideOffset * 0.65, scale: 0.99 }
                }
                transition={
                  reduceMotion
                    ? { duration: 0.12 }
                    : { type: "spring", stiffness: 320, damping: 32, mass: 0.8 }
                }
                drag={
                  reduceMotion || total <= 1 || slide.type === "video" ? false : "x"
                }
                dragConstraints={{ left: 0, right: 0 }}
                dragElastic={0.18}
                dragTransition={{ bounceStiffness: 420, bounceDamping: 28 }}
                onDragEnd={(_, info) => {
                  if (
                    info.offset.x <= -SWIPE_OFFSET_THRESHOLD ||
                    info.velocity.x <= -SWIPE_VELOCITY_THRESHOLD
                  ) {
                    goNext();
                    return;
                  }
                  if (
                    info.offset.x >= SWIPE_OFFSET_THRESHOLD ||
                    info.velocity.x >= SWIPE_VELOCITY_THRESHOLD
                  ) {
                    goPrev();
                  }
                }}
              >
                <LightboxMedia slide={slide} />
              </motion.div>
            </AnimatePresence>
          </div>

          {total > 1 ? (
            <button
              type="button"
              className="about-process-lightbox__nav about-process-lightbox__nav--next focus-ring"
              onClick={(event) => {
                event.stopPropagation();
                goNext();
              }}
              aria-label={t("portfolioDetailNext")}
            >
              <ChevronRight className="h-5 w-5" strokeWidth={1.75} />
            </button>
          ) : null}
        </div>

        <footer className="about-process-lightbox__footer">
          <p className="about-process-lightbox__caption">{t(slide.altKey)}</p>

          {total > 1 ? (
            <div
              className="about-process-lightbox__dots"
              role="tablist"
              aria-label={t("aboutProcessLabel")}
            >
              {ABOUT_PROCESS_SLIDES.map((item, dotIndex) => (
                <button
                  key={`${item.src}-dot`}
                  type="button"
                  role="tab"
                  aria-selected={dotIndex === index}
                  aria-label={t("famousGallerySlide", { index: String(dotIndex + 1) })}
                  className={[
                    "about-process-lightbox__dot focus-ring",
                    dotIndex === index ? "about-process-lightbox__dot--active" : "",
                  ].join(" ")}
                  onClick={() => {
                    if (dotIndex === index) return;
                    setDirection(dotIndex > index ? 1 : -1);
                    onSelectIndex(dotIndex);
                  }}
                />
              ))}
            </div>
          ) : null}

          {!reduceMotion && total > 1 ? (
            <p className="about-process-lightbox__swipe-hint">
              {t("aboutProcessLightboxSwipeHint")}
            </p>
          ) : null}
        </footer>
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
    <MediaLightboxPortal>
      <AnimatePresence>
        {index !== null ? (
          <AboutProcessLightbox
            key="about-process-lightbox"
            index={index}
            onClose={onClose}
            onPrev={goPrev}
            onNext={goNext}
            onSelectIndex={onChangeIndex}
          />
        ) : null}
      </AnimatePresence>
    </MediaLightboxPortal>
  );
}
