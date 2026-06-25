"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import Image from "next/image";
import { motion, useReducedMotion } from "framer-motion";
import { Expand, Play } from "lucide-react";
import { useSiteLanguage } from "@/shared/i18n/LanguageProvider";
import type { SiteCopyKey } from "@/shared/i18n/siteLanguage";
import {
  FEATURED_COLLABORATIONS,
  type FeaturedArtist,
  type FeaturedCollaboration,
} from "@/shared/config/featuredCollaborations";
import { scrollRevealViewport } from "@/shared/motion/scrollReveal";
import {
  CollaborationLightboxRoot,
  type CollabLightboxView,
} from "@/widgets/home/CollaborationLightbox";

const SPOTLIGHT_INTERVAL_MS = 7200;

function VerifiedBadge({ alt }: { alt: string }) {
  return (
    <span className="famous-badge-wrap relative inline-flex shrink-0">
      <span className="famous-badge-glow" aria-hidden />
      <Image
        src="/brand/verified-badge.png"
        alt={alt}
        width={12}
        height={12}
        className="relative z-10 h-3 w-3 object-contain"
      />
    </span>
  );
}

function CollabArtistChip({
  artist,
  t,
}: {
  artist: FeaturedArtist;
  t: (key: SiteCopyKey) => string;
}) {
  return (
    <a
      href={artist.instagramUrl}
      target="_blank"
      rel="noreferrer"
      aria-label={`${t(artist.nameKey)} — Instagram`}
      className="collab-artist-chip group"
      onClick={(event) => event.stopPropagation()}
    >
      <span className="collab-artist-chip__avatar">
        <Image
          src={artist.avatar}
          alt={t(artist.altKey)}
          fill
          className="object-cover"
          style={{ objectPosition: artist.avatarPosition ?? "center" }}
          sizes="28px"
        />
      </span>
      <span className="collab-artist-chip__name">{t(artist.nameKey)}</span>
      <VerifiedBadge alt={t("famousVerifiedAlt")} />
    </a>
  );
}

function CollabCardVideo({
  src,
  poster,
  label,
  enabled,
}: {
  src: string;
  poster: string;
  label: string;
  enabled: boolean;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const sync = () => {
      if (!enabled) {
        video.pause();
        return;
      }
      if (video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) {
        void video.play().catch(() => {});
        return;
      }
      video.load();
      void video.play().catch(() => {});
    };

    sync();
    video.addEventListener("loadeddata", sync);
    return () => video.removeEventListener("loadeddata", sync);
  }, [enabled, src]);

  return (
    <video
      ref={videoRef}
      src={src}
      poster={poster}
      className="absolute inset-0 h-full w-full object-cover object-center"
      autoPlay
      muted
      loop
      playsInline
      preload="auto"
      aria-label={label}
    />
  );
}

function CollabMediaPair({
  project,
  t,
  isSpotlight,
  onOpen,
}: {
  project: FeaturedCollaboration;
  t: (key: SiteCopyKey) => string;
  isSpotlight: boolean;
  onOpen: (view: CollabLightboxView) => void;
}) {
  return (
    <div className="collab-compact__media">
      <button
        type="button"
        className="collab-compact__frame collab-compact__frame--interactive focus-ring"
        onClick={() => onOpen("process")}
        aria-label={`${t("collabOpenProcess")} — ${t(project.titleKey)}`}
      >
        <span className="collab-compact__label">{t("collabProcessLabel")}</span>
        <div className="relative aspect-[4/5] w-full overflow-hidden">
          <CollabCardVideo
            src={project.video}
            poster={project.poster}
            label={t(project.videoAltKey)}
            enabled={isSpotlight}
          />
          <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/55 via-transparent to-black/15" />
          <span className="collab-compact__open-badge" aria-hidden>
            <Play className="h-3 w-3 fill-current" strokeWidth={0} />
            <Expand className="h-3 w-3" strokeWidth={1.75} />
          </span>
        </div>
      </button>

      <button
        type="button"
        className="collab-compact__frame collab-compact__frame--interactive focus-ring"
        onClick={() => onOpen("result")}
        aria-label={`${t("collabOpenResult")} — ${t(project.titleKey)}`}
      >
        <span className="collab-compact__label">{t("collabResultLabel")}</span>
        <div className="relative flex aspect-[4/5] w-full items-center justify-center overflow-hidden bg-background p-1.5">
          <Image
            src={project.resultImage}
            alt=""
            width={800}
            height={1000}
            quality={88}
            priority={project.indexLabel === "01"}
            className="h-full w-full object-contain object-center"
            sizes="(max-width: 640px) 42vw, 200px"
          />
          <span className="collab-compact__open-badge collab-compact__open-badge--still" aria-hidden>
            <Expand className="h-3 w-3" strokeWidth={1.75} />
          </span>
        </div>
      </button>
    </div>
  );
}

function FeaturedCollabProject({
  project,
  t,
  index,
  isSpotlight,
  onOpen,
  onFocus,
}: {
  project: FeaturedCollaboration;
  t: (key: SiteCopyKey) => string;
  index: number;
  isSpotlight: boolean;
  onOpen: (view: CollabLightboxView) => void;
  onFocus: () => void;
}) {
  return (
    <motion.article
      initial={{ opacity: 0, y: 16 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={scrollRevealViewport}
      transition={{ duration: 0.45, delay: index * 0.05, ease: [0.22, 1, 0.36, 1] }}
      className={[
        "collab-compact",
        isSpotlight ? "collab-compact--spotlight" : "collab-compact--rest",
      ].join(" ")}
      onMouseEnter={onFocus}
      onFocus={onFocus}
    >
      <span className="collab-compact__index" aria-hidden>
        {project.indexLabel}
      </span>
      <span className="collab-compact__spotlight-ring" aria-hidden />

      <CollabMediaPair
        project={project}
        t={t}
        isSpotlight={isSpotlight}
        onOpen={onOpen}
      />

      <button
        type="button"
        className="collab-compact__copy collab-compact__copy-btn focus-ring text-left"
        onClick={() => onOpen("process")}
        aria-label={`${t("collabOpenProject")} — ${t(project.titleKey)}`}
      >
        <p className="typo-tech text-[0.62rem] uppercase tracking-[0.2em] text-sand/90">
          {t(project.tagKey)}
        </p>
        <h3 className="collab-compact__title">{t(project.titleKey)}</h3>
        <p className="collab-compact__hook">{t(project.hookKey)}</p>
        <ul className="collab-compact__artists">
          {project.artists.map((artist) => (
            <li key={artist.handle}>
              <CollabArtistChip artist={artist} t={t} />
            </li>
          ))}
        </ul>
      </button>
    </motion.article>
  );
}

export function CollaborationsSection() {
  const { t } = useSiteLanguage();
  const reduceMotion = useReducedMotion();
  const [spotlightIndex, setSpotlightIndex] = useState(0);
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
  const [lightboxView, setLightboxView] = useState<CollabLightboxView>("process");
  const pauseSpotlightRef = useRef(false);
  const sectionRef = useRef<HTMLElement>(null);

  const openLightbox = useCallback((index: number, view: CollabLightboxView) => {
    pauseSpotlightRef.current = true;
    setLightboxIndex(index);
    setLightboxView(view);
  }, []);

  const closeLightbox = useCallback(() => {
    setLightboxIndex(null);
    pauseSpotlightRef.current = false;
  }, []);

  const focusSpotlight = useCallback((index: number) => {
    pauseSpotlightRef.current = true;
    setSpotlightIndex(index);
  }, []);

  const resumeSpotlight = useCallback(() => {
    pauseSpotlightRef.current = false;
  }, []);

  useEffect(() => {
    if (reduceMotion) return;

    const tick = window.setInterval(() => {
      if (pauseSpotlightRef.current) return;
      setSpotlightIndex((current) => (current + 1) % FEATURED_COLLABORATIONS.length);
    }, SPOTLIGHT_INTERVAL_MS);

    return () => window.clearInterval(tick);
  }, [reduceMotion]);

  return (
    <motion.section
      ref={sectionRef}
      id="colaboraciones"
      initial={{ opacity: 0, y: 20 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={scrollRevealViewport}
      transition={{ duration: 0.55, ease: "easeOut" }}
      className="page-section page-section-y section-surface section-surface--collab section-divider relative scroll-mt-20 w-full overflow-hidden sm:scroll-mt-24"
      aria-labelledby="collaborations-heading"
      onMouseLeave={resumeSpotlight}
    >
      <CollaborationLightboxRoot
        projectIndex={lightboxIndex}
        view={lightboxView}
        onClose={closeLightbox}
        onChangeProject={setLightboxIndex}
        onViewChange={setLightboxView}
      />

      <div className="page-section-pad relative z-10">
        <header className="max-w-xl">
          <p className="typo-eyebrow">{t("collabTag")}</p>
          <h2 id="collaborations-heading" className="typo-section-sm mt-2">
            {t("collabTitle")}
          </h2>
          <p className="typo-body mt-2 text-sm leading-relaxed text-zinc-400">{t("collabBody")}</p>
        </header>

        <div
          className="collab-spotlight-progress mt-5"
          role="presentation"
          aria-hidden={reduceMotion ?? undefined}
        >
          {FEATURED_COLLABORATIONS.map((project, index) => (
            <button
              key={project.id}
              type="button"
              className={[
                "collab-spotlight-progress__segment focus-ring",
                index === spotlightIndex ? "collab-spotlight-progress__segment--active" : "",
              ].join(" ")}
              onClick={() => focusSpotlight(index)}
              aria-label={t(project.titleKey)}
            >
              <span
                key={index === spotlightIndex ? `active-${spotlightIndex}` : `idle-${index}`}
                className={[
                  "collab-spotlight-progress__fill",
                  index === spotlightIndex && !reduceMotion
                    ? "collab-spotlight-progress__fill--running"
                    : "",
                ].join(" ")}
              />
            </button>
          ))}
        </div>

        <div className="mt-4 flex flex-col gap-4 sm:mt-5 sm:gap-5">
          {FEATURED_COLLABORATIONS.map((project, index) => (
            <FeaturedCollabProject
              key={project.id}
              project={project}
              t={t}
              index={index}
              isSpotlight={index === spotlightIndex}
              onFocus={() => focusSpotlight(index)}
              onOpen={(view) => openLightbox(index, view)}
            />
          ))}
        </div>

        <p className="collab-section-hint mt-4 text-center sm:mt-5">{t("collabSectionHint")}</p>
      </div>
    </motion.section>
  );
}
