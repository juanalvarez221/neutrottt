"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useRef, useState } from "react";
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
import { useSiteLanguage } from "@/shared/i18n/LanguageProvider";
import { SiteFooter } from "@/widgets/layout/SiteFooter";

const AboutIntroSection = dynamic(
  () => import("@/widgets/home/AboutIntroSection").then((mod) => mod.AboutIntroSection),
  { ssr: false },
);
const FeaturedProducts = dynamic(
  () => import("@/widgets/home/FeaturedProducts").then((mod) => mod.FeaturedProducts),
  { ssr: false },
);
const ProjectsCarousel = dynamic(
  () => import("@/widgets/home/ProjectsCarousel").then((mod) => mod.ProjectsCarousel),
  { ssr: false },
);

const HERO_BANNERS = [
  "/danniel/brand/banner-1.mp4",
  "/danniel/brand/banner-2.mp4",
  "/danniel/brand/banner-3.mp4",
] as const;

type HeroSplashProps = {
  artistName: string;
  subtitle: string;
};

export function HeroSplash({ artistName, subtitle }: HeroSplashProps) {
  const { t } = useSiteLanguage();
  const reduceMotion = useReducedMotion();
  const sectionRef = useRef<HTMLElement>(null);
  const [bannerIndex, setBannerIndex] = useState(0);
  const [showScrollCue, setShowScrollCue] = useState(true);

  const { scrollYProgress } = useScroll({
    target: sectionRef,
    offset: ["start start", "end start"],
  });

  const mediaScale = useTransform(scrollYProgress, [0, 1], [1, 1.08]);
  const mediaOpacity = useTransform(scrollYProgress, [0, 0.85, 1], [1, 0.88, 0.55]);
  const contentX = useTransform(scrollYProgress, [0, 1], [0, -28]);

  useMotionValueEvent(scrollYProgress, "change", (value) => {
    setShowScrollCue(value < 0.12);
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
    if (reduceMotion) return;
    const id = window.setInterval(() => {
      setBannerIndex((prev) => (prev + 1) % HERO_BANNERS.length);
    }, 8200);
    return () => window.clearInterval(id);
  }, [reduceMotion]);

  return (
    <main className="section-surface section-surface--hero relative overflow-x-clip overflow-y-visible pt-14 text-ivory sm:pt-16">
      <section ref={sectionRef} className="relative min-h-[100dvh] w-full">
        <motion.div
          className="absolute inset-0 overflow-hidden"
          style={{ scale: mediaScale, opacity: mediaOpacity }}
        >
          <AnimatePresence mode="sync">
            <motion.video
              key={HERO_BANNERS[bannerIndex]}
              src={HERO_BANNERS[bannerIndex]}
              className="hero-banner-video absolute inset-0 h-full w-full object-cover object-[center_20%]"
              autoPlay
              muted
              loop
              playsInline
              preload="auto"
              initial={reduceMotion ? false : { opacity: 0, scale: 1.06 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={reduceMotion ? undefined : { opacity: 0 }}
              transition={{ duration: reduceMotion ? 0.01 : 1.35, ease: [0.22, 1, 0.36, 1] }}
            />
          </AnimatePresence>
          <div className="hero-banner-grade absolute inset-0" aria-hidden />
          <div className="hero-banner-frame absolute inset-3 border border-white/10 sm:inset-5 md:inset-8" aria-hidden />
        </motion.div>

        <div className="relative z-[4] flex min-h-[100dvh] w-full flex-col justify-end px-4 pb-[max(5.5rem,calc(1.25rem+env(safe-area-inset-bottom)))] sm:px-6 md:justify-center md:px-10 md:pb-20 lg:px-14">
          <motion.div
            className="w-full max-w-xl md:max-w-[34rem]"
            style={{ x: contentX }}
            initial={reduceMotion ? false : { opacity: 0, clipPath: "inset(0 100% 0 0)" }}
            animate={{ opacity: 1, clipPath: "inset(0 0% 0 0)" }}
            transition={{ duration: reduceMotion ? 0.01 : 1.05, ease: [0.16, 1, 0.3, 1] }}
          >
            <HeroBrandTitle
              name={artistName}
              tagline={t("heroSubtitle") ?? subtitle}
              variant="hero"
              align="left"
            />
            <div className="mt-3 flex justify-start">
              <StudioLocationTrigger variant="compact" />
            </div>

            <div className="mt-7 flex w-full max-w-sm flex-col gap-3 sm:mt-8">
              <Link
                href="/cotizacion"
                className="btn-accent typo-cta group inline-flex w-full items-center justify-center gap-2 rounded-xl px-5 py-3.5 active:scale-[0.98] md:py-4"
              >
                {t("heroCta")}
                <span className="transition-transform group-hover:translate-x-1" aria-hidden>
                  →
                </span>
              </Link>
              <Link
                href="/#tatuajes"
                className="inline-flex w-full items-center justify-center rounded-xl border border-white/18 bg-black/25 px-5 py-3.5 text-sm font-semibold tracking-wide text-[rgba(243,230,215,0.92)] backdrop-blur-sm transition hover:bg-white/5 active:scale-[0.98] md:py-4"
              >
                {t("heroCtaSecondary")}
              </Link>
            </div>
          </motion.div>
        </div>

        <AnimatePresence>
          {showScrollCue ? (
            <motion.button
              key="hero-scroll-cue"
              type="button"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 6 }}
              transition={{ duration: reduceMotion ? 0.12 : 0.45, ease: "easeOut" }}
              aria-label={t("heroScrollAria")}
              onClick={scrollToAbout}
              className="hero-scroll-cue"
            >
              <span className="hero-scroll-cue__inner">
                <span className="hero-scroll-cue__stack">
                  <ChevronDown className="h-4 w-4 opacity-80" strokeWidth={1.75} />
                </span>
                <span className="hero-scroll-cue__label">{t("heroScroll")}</span>
              </span>
            </motion.button>
          ) : null}
        </AnimatePresence>
      </section>

      <div id="about-intro" className="scroll-mt-20">
        <LazyMount minHeight="28rem">
          <AboutIntroSection />
        </LazyMount>
      </div>
      <LazyMount minHeight="40rem">
        <FeaturedProducts />
      </LazyMount>
      <LazyMount minHeight="34rem">
        <ProjectsCarousel />
      </LazyMount>
      <SiteFooter />
    </main>
  );
}
