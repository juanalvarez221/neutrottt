"use client";

import Image from "next/image";
import { motion } from "framer-motion";
import { Play, Sparkles, Users } from "lucide-react";
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
  avatarPosition: "center 22%",
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
    resultImage: "/brand/collab-malianteo-back-piece.jpg",
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
        width={14}
        height={14}
        className="relative z-10 h-3.5 w-3.5 object-contain"
      />
    </span>
  );
}

function CollabCreditCard({
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
      className="collab-credit-card group flex min-w-[7.5rem] shrink-0 snap-center flex-col items-center gap-2.5 rounded-2xl border border-white/[0.08] bg-white/[0.03] px-3 py-4 text-center transition hover:border-amber-500/30 hover:bg-amber-500/[0.06] sm:min-w-0 sm:px-4 sm:py-5"
    >
      <div className="ig-post-avatar-ring rounded-full">
        <div className="relative h-14 w-14 overflow-hidden rounded-full bg-zinc-900 ring-1 ring-white/10 sm:h-16 sm:w-16">
          <Image
            src={artist.avatar}
            alt={t(artist.altKey)}
            fill
            className="object-cover"
            style={{ objectPosition: artist.avatarPosition ?? "center" }}
            sizes="64px"
          />
        </div>
      </div>
      <p className="typo-ui flex items-center justify-center gap-1.5 text-sm font-semibold text-zinc-50">
        {t(artist.nameKey)}
        <VerifiedBadge alt={t("famousVerifiedAlt")} />
      </p>
    </a>
  );
}

function CollabMediaColumn({
  project,
  t,
}: {
  project: FeaturedProject;
  t: (key: SiteCopyKey) => string;
}) {
  return (
    <div className="collab-story flex flex-col gap-3 sm:gap-4">
      <div className="collab-showcase-media relative overflow-hidden rounded-2xl border border-white/[0.1] bg-zinc-950 sm:rounded-3xl">
        <div className="collab-stage-label collab-stage-label--process">
          {t("collabProcessLabel")}
        </div>
        <div className="relative aspect-[9/16] max-h-[min(88vw,480px)] sm:max-h-[26rem]">
          <video
            src={project.video}
            poster={project.poster}
            className="absolute inset-0 h-full w-full object-cover object-center"
            autoPlay
            muted
            loop
            playsInline
            preload="auto"
            aria-label={t(project.videoAltKey)}
          />
          <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/70 via-black/10 to-black/25" />
          <span className="pointer-events-none absolute bottom-4 right-4 flex h-9 w-9 items-center justify-center rounded-full border border-white/15 bg-black/50 text-white backdrop-blur-md">
            <Play className="h-4 w-4 fill-current" strokeWidth={0} />
          </span>
        </div>
      </div>

      <figure className="collab-result-frame overflow-hidden rounded-2xl border border-white/[0.1] bg-zinc-950 sm:rounded-3xl">
        <figcaption className="collab-stage-label collab-stage-label--result border-b border-white/[0.06]">
          {t("collabResultLabel")}
        </figcaption>
        <div className="relative flex min-h-[11rem] items-center justify-center bg-[#050403] p-3 sm:min-h-[15rem] sm:p-5">
          <Image
            src={project.resultImage}
            alt={t(project.resultAltKey)}
            width={1200}
            height={900}
            quality={92}
            priority={project.indexLabel === "01"}
            className="h-auto max-h-[min(68vw,400px)] w-full object-contain object-center"
            sizes="(max-width: 1024px) 100vw, 540px"
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
  const reverse = index % 2 === 1;

  return (
    <motion.article
      initial={{ opacity: 0, y: 32 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={scrollRevealViewport}
      transition={{ duration: 0.6, delay: index * 0.04, ease: [0.22, 1, 0.36, 1] }}
      className="collab-showcase relative overflow-hidden rounded-2xl border border-white/[0.08] bg-[#0a0806]/95 sm:rounded-3xl"
    >
      <span
        className="collab-showcase-index pointer-events-none absolute right-5 top-5 z-10 font-[var(--font-display)] text-[3.25rem] leading-none text-white/[0.05] sm:text-[4.25rem]"
        aria-hidden
      >
        {project.indexLabel}
      </span>

      <div className={`grid gap-8 p-4 sm:p-6 lg:grid-cols-2 lg:gap-10 lg:p-8 ${reverse ? "lg:[direction:rtl]" : ""}`}>
        <div className={reverse ? "lg:[direction:ltr]" : ""}>
          <CollabMediaColumn project={project} t={t} />
        </div>

        <div
          className={`flex flex-col justify-center lg:py-2 ${reverse ? "lg:[direction:ltr]" : ""}`}
        >
          <p className="typo-eyebrow text-amber-300/90">{t(project.tagKey)}</p>
          <h3 className="typo-section-md mt-3 text-balance">{t(project.titleKey)}</h3>
          <p className="typo-lead mt-4 max-w-md text-balance text-zinc-300">{t(project.hookKey)}</p>

          <div className="mt-8 sm:mt-10">
            <p className="typo-micro mb-4 flex items-center gap-2 tracking-[0.18em] text-zinc-500">
              <Users className="h-3.5 w-3.5 text-amber-400/80" strokeWidth={2} />
              {t("collabCreditsLabel")}
            </p>
            <ul
              className={`collab-artist-strip flex snap-x snap-mandatory gap-3 overflow-x-auto overscroll-x-contain pb-1 [scrollbar-width:none] sm:grid sm:overflow-visible sm:pb-0 sm:[scrollbar-width:auto] [&::-webkit-scrollbar]:hidden ${
                project.artists.length === 3 ? "sm:grid-cols-3" : "sm:max-w-md sm:grid-cols-2"
              }`}
            >
              {project.artists.map((artist) => (
                <li key={artist.handle} className="sm:min-w-0">
                  <CollabCreditCard artist={artist} t={t} />
                </li>
              ))}
            </ul>
          </div>
        </div>
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
      className="page-section relative scroll-mt-20 w-full overflow-hidden border-y border-white/[0.08] bg-[linear-gradient(180deg,rgba(12,9,6,0.98),rgba(6,5,4,1))] py-12 sm:scroll-mt-24 sm:py-16 md:py-20"
      aria-labelledby="collaborations-heading"
    >
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(560px_260px_at_8%_0%,rgba(245,158,11,0.16),transparent_62%),radial-gradient(480px_220px_at_92%_100%,rgba(180,83,9,0.1),transparent_58%)]" />
      <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-amber-500/25 to-transparent" />

      <div className="page-section-pad relative z-10">
        <header className="mx-auto max-w-2xl text-center sm:text-left">
          <p className="typo-eyebrow inline-flex items-center justify-center gap-2 sm:justify-start">
            <Sparkles className="h-3.5 w-3.5 text-amber-400/90" strokeWidth={2} />
            {t("collabTag")}
          </p>
          <h2 id="collaborations-heading" className="typo-section-sm mt-3 text-balance">
            {t("collabTitle")}
          </h2>
          <p className="typo-body typo-body-emphasis mx-auto mt-4 max-w-lg text-balance text-zinc-300 sm:mx-0">
            {t("collabBody")}
          </p>
          <p className="typo-micro mt-4 text-zinc-500">{t("collabFootnote")}</p>
        </header>

        <div className="mx-auto mt-10 flex max-w-6xl flex-col gap-8 sm:mt-14 sm:gap-10">
          {FEATURED_PROJECTS.map((project, index) => (
            <FeaturedCollabProject key={project.id} project={project} t={t} index={index} />
          ))}
        </div>
      </div>
    </motion.section>
  );
}
