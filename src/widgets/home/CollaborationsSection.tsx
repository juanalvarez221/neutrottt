"use client";

import Image from "next/image";
import { motion } from "framer-motion";
import { Play } from "lucide-react";
import { BRAND } from "@/shared/config/brand";
import { useSiteLanguage } from "@/shared/i18n/LanguageProvider";
import type { SiteCopyKey } from "@/shared/i18n/siteLanguage";
import { scrollRevealViewport } from "@/shared/motion/scrollReveal";

const DANNIEL_ARTIST = {
  handle: "@dannielcuervo",
  instagramUrl: "https://www.instagram.com/dannielcuervo/",
  avatar: "/brand/collab-danniel-cuervo.png",
  nameKey: "collabDannielName" as SiteCopyKey,
  altKey: "collabDannielAlt" as SiteCopyKey,
  avatarPosition: "center 18%",
};

const MALIANTEO_ARTIST = {
  handle: "@malianteo_ink",
  instagramUrl: "https://www.instagram.com/malianteo_ink/",
  avatar: "/brand/collab-malianteo-portrait.png",
  nameKey: "collabMalianteoName" as SiteCopyKey,
  altKey: "collabMalianteoAlt" as SiteCopyKey,
  avatarPosition: "center 28%",
};

const NEUTROTT_ARTIST = {
  handle: "@neutrottt",
  instagramUrl: BRAND.instagramUrl,
  avatar: "/brand/hero-portrait-full.png",
  nameKey: "collabNeutrotttName" as SiteCopyKey,
  altKey: "collabNeutrotttAlt" as SiteCopyKey,
  avatarPosition: "center 16%",
};

type FeaturedArtist = {
  handle: string;
  instagramUrl: string;
  avatar: string;
  nameKey: SiteCopyKey;
  altKey: SiteCopyKey;
  avatarPosition?: string;
};

type FeaturedProject = {
  id: string;
  indexLabel: string;
  video: string;
  poster: string;
  resultImage: string;
  resultAltKey: SiteCopyKey;
  tagKey: SiteCopyKey;
  titleKey: SiteCopyKey;
  hookKey: SiteCopyKey;
  videoAltKey: SiteCopyKey;
  artists: FeaturedArtist[];
};

const FEATURED_PROJECTS: FeaturedProject[] = [
  {
    id: "triple-back",
    indexLabel: "01",
    video: "/brand/collab-danniel-malianteo-neutro.mp4",
    poster: "/brand/collab-back-piece.jpg",
    resultImage: "/brand/collab-back-piece.jpg",
    resultAltKey: "collabFeaturedResultAlt",
    tagKey: "collabFeaturedTag",
    titleKey: "collabFeaturedTitle",
    hookKey: "collabFeaturedHook",
    videoAltKey: "collabFeaturedVideoAlt",
    artists: [DANNIEL_ARTIST, MALIANTEO_ARTIST, NEUTROTT_ARTIST],
  },
  {
    id: "malianteo-back",
    indexLabel: "02",
    video: "/brand/collab-malianteo-back-video.mp4",
    poster: "/brand/collab-malianteo-back-piece.jpg",
    resultImage: "/brand/collab-malianteo-neutro-result.png",
    resultAltKey: "collabMalianteoFeaturedResultAlt",
    tagKey: "collabMalianteoFeaturedTag",
    titleKey: "collabMalianteoFeaturedTitle",
    hookKey: "collabMalianteoFeaturedHook",
    videoAltKey: "collabMalianteoFeaturedVideoAlt",
    artists: [MALIANTEO_ARTIST, NEUTROTT_ARTIST],
  },
];

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

function CollabMediaPair({
  project,
  t,
}: {
  project: FeaturedProject;
  t: (key: SiteCopyKey) => string;
}) {
  return (
    <div className="collab-compact__media">
      <div className="collab-compact__frame">
        <span className="collab-compact__label">{t("collabProcessLabel")}</span>
        <div className="relative aspect-[4/5] w-full">
          <video
            src={project.video}
            poster={project.poster}
            className="absolute inset-0 h-full w-full object-cover object-center"
            autoPlay
            muted
            loop
            playsInline
            preload="metadata"
            aria-label={t(project.videoAltKey)}
          />
          <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/55 via-transparent to-black/15" />
          <span className="pointer-events-none absolute bottom-2 right-2 flex h-6 w-6 items-center justify-center rounded-full border border-white/12 bg-black/45 text-white backdrop-blur-sm">
            <Play className="h-3 w-3 fill-current" strokeWidth={0} />
          </span>
        </div>
      </div>

      <figure className="collab-compact__frame">
        <figcaption className="collab-compact__label">{t("collabResultLabel")}</figcaption>
        <div className="relative flex aspect-[4/5] w-full items-center justify-center bg-background p-1.5">
          <Image
            src={project.resultImage}
            alt={t(project.resultAltKey)}
            width={800}
            height={1000}
            quality={90}
            priority={project.indexLabel === "01"}
            className="h-full w-full object-contain object-center"
            sizes="(max-width: 640px) 42vw, 200px"
          />
        </div>
      </figure>
    </div>
  );
}

function FeaturedCollabProject({
  project,
  t,
  index,
}: {
  project: FeaturedProject;
  t: (key: SiteCopyKey) => string;
  index: number;
}) {
  return (
    <motion.article
      initial={{ opacity: 0, y: 16 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={scrollRevealViewport}
      transition={{ duration: 0.45, delay: index * 0.05, ease: [0.22, 1, 0.36, 1] }}
      className="collab-compact"
    >
      <span className="collab-compact__index" aria-hidden>
        {project.indexLabel}
      </span>

      <CollabMediaPair project={project} t={t} />

      <div className="collab-compact__copy">
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
      </div>
    </motion.article>
  );
}

export function CollaborationsSection() {
  const { t } = useSiteLanguage();

  return (
    <motion.section
      id="colaboraciones"
      initial={{ opacity: 0, y: 20 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={scrollRevealViewport}
      transition={{ duration: 0.55, ease: "easeOut" }}
      className="page-section page-section-y section-surface section-surface--collab section-divider relative scroll-mt-20 w-full overflow-hidden sm:scroll-mt-24"
      aria-labelledby="collaborations-heading"
    >
      <div className="page-section-pad relative z-10">
        <header className="max-w-xl">
          <p className="typo-eyebrow">{t("collabTag")}</p>
          <h2 id="collaborations-heading" className="typo-section-sm mt-2">
            {t("collabTitle")}
          </h2>
          <p className="typo-body mt-2 text-sm leading-relaxed text-zinc-400">{t("collabBody")}</p>
        </header>

        <div className="mt-7 flex flex-col gap-4 sm:mt-8 sm:gap-5">
          {FEATURED_PROJECTS.map((project, index) => (
            <FeaturedCollabProject key={project.id} project={project} t={t} index={index} />
          ))}
        </div>
      </div>
    </motion.section>
  );
}
