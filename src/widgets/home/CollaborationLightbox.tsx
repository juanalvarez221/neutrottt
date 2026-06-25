"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Image from "next/image";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { ChevronLeft, ChevronRight, X } from "lucide-react";
import { useSiteLanguage } from "@/shared/i18n/LanguageProvider";
import {
  FEATURED_COLLABORATIONS,
  type FeaturedCollaboration,
} from "@/shared/config/featuredCollaborations";

const easeOut = [0.22, 1, 0.36, 1] as const;

export type CollabLightboxView = "process" | "result";

type CollaborationLightboxProps = {
  projectIndex: number;
  view: CollabLightboxView;
  onClose: () => void;
  onPrevProject: () => void;
  onNextProject: () => void;
  onViewChange: (view: CollabLightboxView) => void;
};

function CollabLightboxVideo({ src, label }: { src: string; label: string }) {
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
      className="collab-lightbox__video"
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

function CollabViewToggle({
  view,
  onChange,
  processLabel,
  resultLabel,
}: {
  view: CollabLightboxView;
  onChange: (view: CollabLightboxView) => void;
  processLabel: string;
  resultLabel: string;
}) {
  return (
    <div className="collab-lightbox__toggle" role="tablist" aria-label={processLabel}>
      {(["process", "result"] as const).map((tab) => {
        const active = view === tab;
        return (
          <button
            key={tab}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(tab)}
            className={[
              "collab-lightbox__toggle-btn focus-ring",
              active ? "collab-lightbox__toggle-btn--active" : "",
            ].join(" ")}
          >
            {tab === "process" ? processLabel : resultLabel}
          </button>
        );
      })}
    </div>
  );
}

function CollaborationLightboxPanel({
  project,
  view,
  onClose,
  onPrevProject,
  onNextProject,
  onViewChange,
  projectIndex,
}: CollaborationLightboxProps & { project: FeaturedCollaboration }) {
  const { t } = useSiteLanguage();
  const reduceMotion = useReducedMotion();
  const total = FEATURED_COLLABORATIONS.length;

  return (
    <motion.div
      className="collab-lightbox portfolio-lightbox fixed inset-0 z-[75] flex items-center justify-center"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.28, ease: easeOut }}
      role="dialog"
      aria-modal="true"
      aria-label={t(project.titleKey)}
    >
      <button
        type="button"
        className="absolute inset-0 bg-background/92 backdrop-blur-sm"
        aria-label={t("portfolioDetailClose")}
        onClick={onClose}
      />

      <motion.div
        className="collab-lightbox__panel portfolio-lightbox__panel relative z-10"
        initial={{ opacity: 0, y: 20, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 14, scale: 0.99 }}
        transition={{ duration: 0.36, ease: easeOut }}
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
            <p className="portfolio-lightbox__eyebrow">{t(project.tagKey)}</p>
            <p className="portfolio-lightbox__heading">{t(project.titleKey)}</p>
            <p className="portfolio-lightbox__counter">
              {t("portfolioDetailCounter", {
                current: String(projectIndex + 1),
                total: String(total),
              })}
            </p>
          </div>

          <span aria-hidden className="h-10 w-10" />
        </div>

        <CollabViewToggle
          view={view}
          onChange={onViewChange}
          processLabel={t("collabProcessLabel")}
          resultLabel={t("collabResultLabel")}
        />

        <div className="portfolio-lightbox__stage collab-lightbox__stage">
          {total > 1 ? (
            <button
              type="button"
              className="portfolio-lightbox__nav portfolio-lightbox__nav--prev focus-ring"
              onClick={onPrevProject}
              aria-label={t("portfolioDetailPrev")}
            >
              <ChevronLeft className="h-5 w-5" strokeWidth={1.75} />
            </button>
          ) : null}

          <AnimatePresence mode="wait" initial={false}>
            <motion.div
              key={`${project.id}-${view}`}
              className="collab-lightbox__frame-wrap"
              initial={reduceMotion ? false : { opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={reduceMotion ? undefined : { opacity: 0, y: -8 }}
              transition={{ duration: 0.3, ease: easeOut }}
            >
              {view === "process" ? (
                <CollabLightboxVideo src={project.video} label={t(project.videoAltKey)} />
              ) : (
                <div className="collab-lightbox__result">
                  <Image
                    src={project.resultImage}
                    alt={t(project.resultAltKey)}
                    fill
                    quality={96}
                    sizes="(max-width: 768px) 92vw, 46rem"
                    className="object-contain object-center"
                    priority
                  />
                </div>
              )}
            </motion.div>
          </AnimatePresence>

          {total > 1 ? (
            <button
              type="button"
              className="portfolio-lightbox__nav portfolio-lightbox__nav--next focus-ring"
              onClick={onNextProject}
              aria-label={t("portfolioDetailNext")}
            >
              <ChevronRight className="h-5 w-5" strokeWidth={1.75} />
            </button>
          ) : null}
        </div>

        <p className="portfolio-lightbox__caption">{t(project.hookKey)}</p>
      </motion.div>
    </motion.div>
  );
}

export function CollaborationLightboxRoot({
  projectIndex,
  view,
  onClose,
  onChangeProject,
  onViewChange,
}: {
  projectIndex: number | null;
  view: CollabLightboxView;
  onClose: () => void;
  onChangeProject: (index: number) => void;
  onViewChange: (view: CollabLightboxView) => void;
}) {
  const total = FEATURED_COLLABORATIONS.length;

  const goPrev = useCallback(() => {
    if (projectIndex === null) return;
    onChangeProject((projectIndex - 1 + total) % total);
  }, [onChangeProject, projectIndex, total]);

  const goNext = useCallback(() => {
    if (projectIndex === null) return;
    onChangeProject((projectIndex + 1) % total);
  }, [onChangeProject, projectIndex, total]);

  useEffect(() => {
    if (projectIndex === null) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
      if (event.key === "ArrowLeft") goPrev();
      if (event.key === "ArrowRight") goNext();
    };
    window.addEventListener("keydown", onKeyDown);

    return () => {
      document.body.style.overflow = previous;
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [goNext, goPrev, onClose, projectIndex]);

  const project =
    projectIndex !== null ? FEATURED_COLLABORATIONS[projectIndex] : null;

  return (
    <AnimatePresence>
      {project && projectIndex !== null ? (
        <CollaborationLightboxPanel
          key="collab-lightbox"
          project={project}
          projectIndex={projectIndex}
          view={view}
          onClose={onClose}
          onPrevProject={goPrev}
          onNextProject={goNext}
          onViewChange={onViewChange}
        />
      ) : null}
    </AnimatePresence>
  );
}
