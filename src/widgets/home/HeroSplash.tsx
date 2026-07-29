"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  AnimatePresence,
  motion,
  useMotionValue,
  useMotionValueEvent,
  useReducedMotion,
  useTransform,
} from "framer-motion";
import Link from "next/link";
import { ChevronDown } from "lucide-react";
import { LazyMount } from "@/shared/ui/LazyMount";
import { StudioLocationTrigger } from "@/shared/ui/StudioLocationTrigger";
import { HeroBrandTitle } from "@/widgets/home/HeroBrandTitle";
import { HeroPortraitBanner } from "@/widgets/home/HeroPortraitBanner";
import { useSiteLanguage } from "@/shared/i18n/LanguageProvider";
import { SiteFooter } from "@/widgets/layout/SiteFooter";

const TrajectoryAwardsSection = dynamic(
  () =>
    import("@/widgets/home/TrajectoryAwardsSection").then(
      (mod) => mod.TrajectoryAwardsSection,
    ),
  { ssr: false },
);
const FeaturedProducts = dynamic(
  () => import("@/widgets/home/FeaturedProducts").then((mod) => mod.FeaturedProducts),
  { ssr: false },
);
const ArtistaCollectionSection = dynamic(
  () =>
    import("@/widgets/home/ArtistaCollectionSection").then(
      (mod) => mod.ArtistaCollectionSection,
    ),
  { ssr: false },
);
const HomeLetteringDesire = dynamic(
  () =>
    import("@/widgets/home/HomeLetteringDesire").then((mod) => mod.HomeLetteringDesire),
  { ssr: false },
);

const HERO_PORTRAIT_SRC = "/brand/hero-banner.png";

type HeroSplashProps = {
  artistName: string;
  subtitle: string;
};

export function HeroSplash({ artistName, subtitle }: HeroSplashProps) {
  const { t } = useSiteLanguage();
  const reduceMotion = useReducedMotion();
  const sectionRef = useRef<HTMLElement>(null);
  const [showScrollCue, setShowScrollCue] = useState(true);
  const scrollYProgress = useMotionValue(0);

  useEffect(() => {
    const el = sectionRef.current;
    if (!el) return;

    const update = () => {
      const height = el.offsetHeight || 1;
      const progress = Math.min(1, Math.max(0, -el.getBoundingClientRect().top / height));
      scrollYProgress.set(progress);
    };

    update();
    window.addEventListener("scroll", update, { passive: true });
    window.addEventListener("resize", update);
    return () => {
      window.removeEventListener("scroll", update);
      window.removeEventListener("resize", update);
    };
  }, [scrollYProgress]);

  const mediaScale = useTransform(scrollYProgress, [0, 1], [1, 1.08]);
  const mediaOpacity = useTransform(scrollYProgress, [0, 0.85, 1], [1, 0.88, 0.55]);
  const contentX = useTransform(scrollYProgress, [0, 1], [0, -28]);

  useMotionValueEvent(scrollYProgress, "change", (value) => {
    setShowScrollCue(value < 0.12);
  });

  const scrollToNext = useCallback(() => {
    const target = document.getElementById("trayectoria");
    if (!target) return;
    target.scrollIntoView({
      behavior: reduceMotion ? "auto" : "smooth",
      block: "start",
    });
  }, [reduceMotion]);

  return (
    <main className="section-surface section-surface--hero relative overflow-x-clip overflow-y-visible pt-14 text-ivory sm:pt-16">
      <section
        ref={sectionRef}
        className="relative min-h-[100dvh] w-full"
        style={{ position: "relative" }}
      >
        <motion.div
          className="absolute inset-0 overflow-hidden"
          style={{ scale: mediaScale, opacity: mediaOpacity }}
        >
          <HeroPortraitBanner src={HERO_PORTRAIT_SRC} alt={artistName} />
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
                target="_blank"
                rel="noopener noreferrer"
                className="btn-accent typo-cta group inline-flex w-full items-center justify-center gap-2 rounded-xl px-5 py-3.5 active:scale-[0.98] md:py-4"
              >
                {t("heroCta")}
                <span className="transition-transform group-hover:translate-x-1" aria-hidden>
                  →
                </span>
              </Link>
              <Link
                href="/tienda"
                className="inline-flex w-full items-center justify-center rounded-xl border border-[rgba(var(--rgb-sand),0.22)] bg-black/30 px-5 py-3.5 text-sm font-semibold tracking-wide text-[rgba(var(--rgb-ivory),0.92)] backdrop-blur-sm transition hover:border-[rgba(var(--rgb-sand),0.36)] hover:bg-[rgba(var(--rgb-terracotta),0.12)] active:scale-[0.98] md:py-4"
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
              onClick={scrollToNext}
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

      <LazyMount minHeight="28rem">
        <TrajectoryAwardsSection />
      </LazyMount>

      <div id="featured-products" className="scroll-mt-20">
        <LazyMount minHeight="40rem">
          <FeaturedProducts />
        </LazyMount>
      </div>
      <LazyMount minHeight="32rem">
        <ArtistaCollectionSection />
      </LazyMount>
      <LazyMount minHeight="48rem">
        <HomeLetteringDesire />
      </LazyMount>
      <SiteFooter />
    </main>
  );
}
