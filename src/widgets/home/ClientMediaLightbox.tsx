"use client";

import { useCallback, useEffect, useRef } from "react";
import Image from "next/image";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { ChevronLeft, ChevronRight, X } from "lucide-react";
import { useSiteLanguage } from "@/shared/i18n/LanguageProvider";
import type { SiteCopyKey } from "@/shared/i18n/siteLanguage";
import { MediaLightboxPortal } from "@/shared/ui/MediaLightboxPortal";

const springPanel = { type: "spring" as const, stiffness: 280, damping: 28, mass: 0.85 };
const easeOut = [0.22, 1, 0.36, 1] as const;
const SWIPE_OFFSET = 48;
const SWIPE_VELOCITY = 380;

export type ClientLightboxMedia =
  | { type: "image"; src: string; altKey: SiteCopyKey }
  | { type: "video"; src: string; altKey: SiteCopyKey; poster?: string };

type ClientMediaLightboxProps = {
  media: ClientLightboxMedia[];
  index: number;
  title: string;
  onClose: () => void;
  onChangeIndex: (index: number) => void;
};

function LightboxVideo({
  src,
  poster,
  label,
}: {
  src: string;
  poster?: string;
  label: string;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    void video.play().catch(() => {});
    return () => {
      video.pause();
    };
  }, [src]);

  return (
    <video
      ref={videoRef}
      src={src}
      poster={poster}
      className="client-media-lightbox__video"
      controls
      autoPlay
      muted
      loop
      playsInline
      preload="auto"
      aria-label={label}
    />
  );
}

export function ClientMediaLightbox({
  media,
  index,
  title,
  onClose,
  onChangeIndex,
}: ClientMediaLightboxProps) {
  const { t } = useSiteLanguage();
  const reduceMotion = useReducedMotion();
  const closeRef = useRef<HTMLButtonElement>(null);
  const total = media.length;
  const item = media[index];

  const goPrev = useCallback(() => {
    if (total <= 1) return;
    onChangeIndex((index - 1 + total) % total);
  }, [index, onChangeIndex, total]);

  const goNext = useCallback(() => {
    if (total <= 1) return;
    onChangeIndex((index + 1) % total);
  }, [index, onChangeIndex, total]);

  useEffect(() => {
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeRef.current?.focus();
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
        goPrev();
      }
      if (event.key === "ArrowRight") {
        event.preventDefault();
        goNext();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [goNext, goPrev, onClose]);

  if (!item) return null;

  return (
    <motion.div
      className="client-media-lightbox"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: reduceMotion ? 0.12 : 0.26, ease: easeOut }}
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
      <button
        type="button"
        className="client-media-lightbox__backdrop"
        aria-label={t("famousModalClose")}
        onClick={onClose}
      />

      <motion.div
        className="client-media-lightbox__shell"
        initial={reduceMotion ? false : { opacity: 0, y: 24, scale: 0.985 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={reduceMotion ? undefined : { opacity: 0, y: 14, scale: 0.99 }}
        transition={reduceMotion ? { duration: 0.14 } : springPanel}
        onClick={(event) => event.stopPropagation()}
      >
        <header className="client-media-lightbox__chrome">
          <button
            ref={closeRef}
            type="button"
            onClick={onClose}
            className="client-media-lightbox__icon-btn focus-ring"
            aria-label={t("famousModalClose")}
          >
            <X className="h-5 w-5" strokeWidth={1.75} />
          </button>

          <div className="client-media-lightbox__heading">
            <p className="client-media-lightbox__title">{title}</p>
            {total > 1 ? (
              <p className="client-media-lightbox__counter typo-tech">
                {t("portfolioDetailCounter", {
                  current: String(index + 1),
                  total: String(total),
                })}
              </p>
            ) : null}
          </div>

          <span className="client-media-lightbox__chrome-spacer" aria-hidden />
        </header>

        <div
          className="client-media-lightbox__stage"
          onClick={onClose}
          role="presentation"
        >
          {total > 1 ? (
            <button
              type="button"
              className="client-media-lightbox__nav client-media-lightbox__nav--prev focus-ring"
              onClick={(event) => {
                event.stopPropagation();
                goPrev();
              }}
              aria-label={t("famousGalleryPrev")}
            >
              <ChevronLeft className="h-5 w-5" strokeWidth={1.75} />
            </button>
          ) : null}

          <div
            className="client-media-lightbox__viewport"
            onClick={(event) => event.stopPropagation()}
          >
            <AnimatePresence mode="wait" initial={false}>
              <motion.div
                key={`${item.type}-${item.src}`}
                className="client-media-lightbox__frame"
                initial={reduceMotion ? false : { opacity: 0, scale: 0.985 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={reduceMotion ? undefined : { opacity: 0, scale: 0.99 }}
                transition={
                  reduceMotion
                    ? { duration: 0.12 }
                    : { type: "spring", stiffness: 320, damping: 32 }
                }
                drag={
                  reduceMotion || total <= 1 || item.type === "video" ? false : "x"
                }
                dragConstraints={{ left: 0, right: 0 }}
                dragElastic={0.16}
                onDragEnd={(_, info) => {
                  if (info.offset.x <= -SWIPE_OFFSET || info.velocity.x <= -SWIPE_VELOCITY) {
                    goNext();
                    return;
                  }
                  if (info.offset.x >= SWIPE_OFFSET || info.velocity.x >= SWIPE_VELOCITY) {
                    goPrev();
                  }
                }}
              >
                {item.type === "video" ? (
                  <div className="client-media-lightbox__media client-media-lightbox__media--video">
                    <LightboxVideo
                      src={item.src}
                      poster={item.poster}
                      label={t(item.altKey)}
                    />
                  </div>
                ) : (
                  <div className="client-media-lightbox__media client-media-lightbox__media--image">
                    <Image
                      src={item.src}
                      alt={t(item.altKey)}
                      fill
                      quality={96}
                      sizes="100vw"
                      className="object-contain object-center"
                      priority
                      draggable={false}
                    />
                  </div>
                )}
              </motion.div>
            </AnimatePresence>
          </div>

          {total > 1 ? (
            <button
              type="button"
              className="client-media-lightbox__nav client-media-lightbox__nav--next focus-ring"
              onClick={(event) => {
                event.stopPropagation();
                goNext();
              }}
              aria-label={t("famousGalleryNext")}
            >
              <ChevronRight className="h-5 w-5" strokeWidth={1.75} />
            </button>
          ) : null}
        </div>

        <footer className="client-media-lightbox__footer">
          <p className="client-media-lightbox__caption">{t(item.altKey)}</p>
          {total > 1 ? (
            <div className="client-media-lightbox__dots" role="tablist" aria-label={title}>
              {media.map((dot, dotIndex) => (
                <button
                  key={`${dot.src}-dot`}
                  type="button"
                  role="tab"
                  aria-selected={dotIndex === index}
                  aria-label={t("famousGallerySlide", { index: String(dotIndex + 1) })}
                  className={[
                    "client-media-lightbox__dot focus-ring",
                    dotIndex === index ? "client-media-lightbox__dot--active" : "",
                  ].join(" ")}
                  onClick={() => onChangeIndex(dotIndex)}
                />
              ))}
            </div>
          ) : null}
        </footer>
      </motion.div>
    </motion.div>
  );
}

export function ClientMediaLightboxRoot({
  media,
  index,
  title,
  onClose,
  onChangeIndex,
}: {
  media: ClientLightboxMedia[] | null;
  index: number;
  title: string;
  onClose: () => void;
  onChangeIndex: (index: number) => void;
}) {
  return (
    <MediaLightboxPortal>
      <AnimatePresence>
        {media && media.length > 0 ? (
          <ClientMediaLightbox
            key="client-media-lightbox"
            media={media}
            index={Math.min(index, media.length - 1)}
            title={title}
            onClose={onClose}
            onChangeIndex={onChangeIndex}
          />
        ) : null}
      </AnimatePresence>
    </MediaLightboxPortal>
  );
}
