"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useRef, useState } from "react";
import Image from "next/image";
import {
  AnimatePresence,
  motion,
  useMotionValueEvent,
  useReducedMotion,
  useScroll,
  useTransform,
} from "framer-motion";
import Link from "next/link";
import { ChevronDown } from "lucide-react";
import { LazyMount } from "@/shared/ui/LazyMount";
import { StudioLocationTrigger } from "@/shared/ui/StudioLocationTrigger";
import { HeroBrandTitle } from "@/widgets/home/HeroBrandTitle";
import { HeroPortraitBanner } from "@/widgets/home/HeroPortraitBanner";
import { useSiteLanguage } from "@/shared/i18n/LanguageProvider";

const AboutIntroSection = dynamic(
  () => import("@/widgets/home/AboutIntroSection").then((mod) => mod.AboutIntroSection),
  { ssr: false },
);
const FamousClientsSection = dynamic(
  () => import("@/widgets/home/FamousClientsSection").then((mod) => mod.FamousClientsSection),
  { ssr: false },
);
const CollaborationsSection = dynamic(
  () => import("@/widgets/home/CollaborationsSection").then((mod) => mod.CollaborationsSection),
  { ssr: false },
);
const ProjectsCarousel = dynamic(
  () => import("@/widgets/home/ProjectsCarousel").then((mod) => mod.ProjectsCarousel),
  { ssr: false },
);

type HeroSplashProps = {
  backgroundImageUrl?: string;
  backgroundImageUrls?: string[];
  backgroundVideoUrl?: string;
  /** Foto principal del hero (con fondo). */
  portraitBackgroundUrl?: string;
  artistName: string;
  subtitle: string;
};

export function HeroSplash({
  backgroundImageUrl,
  backgroundImageUrls,
  backgroundVideoUrl,
  portraitBackgroundUrl,
  artistName,
  subtitle,
}: HeroSplashProps) {
  const { t } = useSiteLanguage();
  const reduceMotion = useReducedMotion();
  const sectionRef = useRef<HTMLElement>(null);
  const [heroIndex, setHeroIndex] = useState(0);
  const [showScrollCue, setShowScrollCue] = useState(true);
  const heroImages =
    backgroundImageUrls && backgroundImageUrls.length > 0
      ? backgroundImageUrls
      : backgroundImageUrl
        ? [backgroundImageUrl]
        : [];
  const hasHeroImage = heroImages.length > 0;
  const usePortraitPhoto = Boolean(portraitBackgroundUrl);
  const useHeroCarousel =
    !backgroundVideoUrl && !usePortraitPhoto && heroImages.length > 1;
  const currentHeroImage = heroImages[heroIndex] ?? backgroundImageUrl;

  const { scrollYProgress } = useScroll({
    target: sectionRef,
    offset: ["start start", "end start"],
  });

  // Base parallax that always tracks scroll progress.
  const imageY = useTransform(scrollYProgress, [0, 1], [0, -72]);
  const portraitBgY = useTransform(scrollYProgress, [0, 1], [0, -40]);
  const portraitBgScale = useTransform(scrollYProgress, [0, 1], [1, 1.05]);
  const imageScale = useTransform(scrollYProgress, [0, 1], [1, 1.06]);
  const heroOpacity = useTransform(scrollYProgress, [0, 0.78, 1], [1, 0.94, 0.72]);

  const markY = useTransform(scrollYProgress, [0, 1], [0, 18]);

  useMotionValueEvent(scrollYProgress, "change", (value) => {
    setShowScrollCue(value < 0.14);
  });

  const scrollToAbout = useCallback(() => {
    const target = document.getElementById("about-intro");
    if (!target) return;
    target.scrollIntoView({
      behavior: reduceMotion ? "auto" : "smooth",
      block: "start",
    });
  }, [reduceMotion]);

  useEffect(() => {
    if (!useHeroCarousel) return;
    const id = window.setInterval(() => {
      setHeroIndex((prev) => (prev + 1) % heroImages.length);
    }, 7000);
    return () => window.clearInterval(id);
  }, [heroImages.length, useHeroCarousel]);

  return (
    <main className="section-surface section-surface--hero relative overflow-x-clip overflow-y-visible text-ivory">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(1100px_540px_at_8%_-8%,rgba(198,122,54,0.26),transparent_60%),radial-gradient(920px_480px_at_95%_6%,rgba(214,161,90,0.2),transparent_62%),radial-gradient(1200px_600px_at_50%_105%,rgba(158,94,60,0.2),transparent_64%)]" />
      <div className="pointer-events-none absolute -left-24 top-[36%] h-64 w-64 rounded-full bg-stone-500/12 blur-[95px] md:h-96 md:w-96" />
      <div className="pointer-events-none absolute -right-16 top-[58%] h-64 w-64 rounded-full bg-stone-600/10 blur-[95px] md:h-[26rem] md:w-[26rem]" />
      <div className="pointer-events-none absolute left-1/2 top-[74%] h-60 w-[82vw] -translate-x-1/2 bg-[radial-gradient(ellipse_at_center,rgba(214,161,90,0.2),transparent_68%)] blur-[46px]" />
      <section
        ref={sectionRef}
        className="relative min-h-[100dvh] w-full"
      >
        <motion.div
          className="sticky top-0 h-[100dvh] overflow-hidden"
          style={{ y: imageY, scale: imageScale, opacity: heroOpacity }}
          animate={{ rotateZ: 0 }}
          transition={{ duration: 0.45, ease: "easeOut" }}
        >
          {usePortraitPhoto ? (
            <HeroPortraitBanner
              src={portraitBackgroundUrl!}
              alt={`${artistName} — Tattoo Artist`}
              imageY={portraitBgY}
              imageScale={portraitBgScale}
            />
          ) : backgroundVideoUrl ? (
            <video
              key={backgroundVideoUrl}
              src={backgroundVideoUrl}
              className="h-full w-full object-cover object-center"
              autoPlay
              muted
              loop
              playsInline
              preload="auto"
              poster={backgroundImageUrl ?? undefined}
            />
          ) : hasHeroImage && currentHeroImage ? (
            <AnimatePresence mode="wait">
              <motion.div
                key={currentHeroImage}
                initial={{ opacity: 0, scale: 1.02 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.985 }}
                transition={{ duration: 1.1, ease: "easeInOut" }}
                className="absolute inset-0"
              >
                <Image
                  src={currentHeroImage}
                  alt={`${artistName} Tattoo Artist`}
                  fill
                  priority
                  quality={88}
                  sizes="100vw"
                  className="object-cover object-center"
                />
              </motion.div>
            </AnimatePresence>
          ) : (
            <div className="hero-backdrop absolute inset-0">
              {hasHeroImage && currentHeroImage ? (
                <Image
                  src={currentHeroImage}
                  alt=""
                  fill
                  priority
                  sizes="100vw"
                  className="hero-backdrop-image"
                  aria-hidden
                />
              ) : null}
              <div className="smoke opacity-70" aria-hidden />
            </div>
          )}
        </motion.div>

        <div
          className={
            usePortraitPhoto
              ? "absolute inset-0 z-[2] bg-[radial-gradient(ellipse_80%_50%_at_50%_100%,rgba(198,122,54,0.18),transparent_65%)]"
              : "absolute inset-0 z-[2] bg-[radial-gradient(900px_500px_at_50%_0%,rgba(214,161,90,0.28),transparent_60%),radial-gradient(560px_280px_at_22%_16%,rgba(158,94,60,0.18),transparent_64%)]"
          }
        />

        <div
          className={
            usePortraitPhoto
              ? "absolute inset-0 z-[4] flex min-h-[100dvh] w-full flex-col justify-end px-4 pb-[max(5.5rem,calc(1.25rem+env(safe-area-inset-bottom)))] text-left sm:px-6 sm:pb-16 md:px-10 md:pb-14 lg:px-14"
              : "absolute inset-0 z-[4] flex h-[100dvh] w-full flex-col items-center justify-end px-6 pb-16 text-center md:pb-14"
          }
        >
          <div
            className={
              usePortraitPhoto
                ? "z-20 w-full max-w-[20rem] sm:max-w-xs md:max-w-md"
                : "z-20 w-full max-w-[20rem] sm:max-w-sm"
            }
          >
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.75, delay: usePortraitPhoto ? 0.12 : 0, ease: [0.22, 1, 0.36, 1] }}
              style={{ y: markY }}
            >
              <HeroBrandTitle
                name={artistName}
                tagline={t("heroSubtitle") ?? subtitle}
                variant="hero"
                align={usePortraitPhoto ? "left" : "center"}
              />
              <div className={usePortraitPhoto ? "mt-2.5 flex justify-start" : "mt-2.5 flex justify-center"}>
                <StudioLocationTrigger variant="compact" />
              </div>
            </motion.div>
          </div>

          <div
            className={
              usePortraitPhoto
                ? "mt-5 flex w-full max-w-[20rem] flex-col sm:mt-6 sm:max-w-xs md:max-w-sm"
                : "mt-6 flex w-full max-w-[20rem] flex-col sm:max-w-sm"
            }
          >
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.12, duration: 0.5, ease: "easeOut" }}
            className="w-full"
          >
            <Link
              href="/cotizacion"
              className="btn-accent typo-cta group inline-flex w-full items-center justify-center gap-2 rounded-xl px-5 py-3.5 active:translate-y-0 md:py-4"
            >
              {t("heroCta")}
              <span className="transition-transform group-hover:translate-x-1">
                →
              </span>
            </Link>
          </motion.div>
          </div>
        </div>

        <AnimatePresence>
          {showScrollCue ? (
            <motion.button
              key="hero-scroll-cue"
              type="button"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 6 }}
              transition={{ duration: reduceMotion ? 0.12 : 0.32, ease: [0.22, 1, 0.36, 1] }}
              aria-label={t("heroScrollAria")}
              onClick={scrollToAbout}
              className="hero-scroll-cue focus-ring"
            >
              <span className="hero-scroll-cue__icon" aria-hidden>
                <motion.span
                  animate={reduceMotion ? undefined : { y: [0, 3, 0] }}
                  transition={{ duration: 1.35, repeat: Infinity, ease: "easeInOut" }}
                  className="inline-flex"
                >
                  <ChevronDown className="h-[1.05rem] w-[1.05rem]" strokeWidth={2.25} />
                </motion.span>
              </span>
              <span className="hero-scroll-cue__label">{t("heroScroll")}</span>
            </motion.button>
          ) : null}
        </AnimatePresence>

        <div className="absolute bottom-0 z-20 h-1 w-full bg-gradient-to-r from-transparent via-white/10 to-transparent" />
      </section>

      <div id="about-intro" className="scroll-mt-0">
        <LazyMount minHeight="28rem">
          <AboutIntroSection />
        </LazyMount>
      </div>
      <LazyMount minHeight="36rem">
        <FamousClientsSection />
      </LazyMount>
      <LazyMount minHeight="32rem">
        <CollaborationsSection />
      </LazyMount>
      <LazyMount minHeight="34rem">
        <ProjectsCarousel />
      </LazyMount>
    </main>
  );
}

