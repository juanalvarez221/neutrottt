"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import {
  AnimatePresence,
  motion,
  useMotionTemplate,
  useScroll,
  useTransform,
} from "framer-motion";
import Link from "next/link";
import { ChevronDown } from "lucide-react";
import { SocialBrandIcon } from "@/shared/ui/SocialBrandIcon";
import { BRAND, WHATSAPP_MESSAGES, whatsappUrl } from "@/shared/config/brand";
import { StudioLocationTrigger } from "@/shared/ui/StudioLocationTrigger";
import { ProjectsCarousel } from "@/widgets/home/ProjectsCarousel";
import { HeroBrandTitle } from "@/widgets/home/HeroBrandTitle";
import { HeroPortraitBanner } from "@/widgets/home/HeroPortraitBanner";
import { AboutIntroSection } from "@/widgets/home/AboutIntroSection";
import { FamousClientsSection } from "@/widgets/home/FamousClientsSection";
import { useSiteLanguage } from "@/shared/i18n/LanguageProvider";

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
  const sectionRef = useRef<HTMLElement>(null);
  const [heroIndex, setHeroIndex] = useState(0);
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
  const heroBlur = useTransform(scrollYProgress, [0, 1], [0, 2.4]);
  const heroFilter = useMotionTemplate`blur(${heroBlur}px)`;

  const markY = useTransform(scrollYProgress, [0, 1], [0, 18]);
  useEffect(() => {
    if (!useHeroCarousel) return;
    const id = window.setInterval(() => {
      setHeroIndex((prev) => (prev + 1) % heroImages.length);
    }, 7000);
    return () => window.clearInterval(id);
  }, [heroImages.length, useHeroCarousel]);

  return (
    <main className="relative overflow-hidden bg-[#050403] text-white">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(1100px_540px_at_8%_-8%,rgba(245,158,11,0.26),transparent_60%),radial-gradient(920px_480px_at_95%_6%,rgba(251,191,36,0.2),transparent_62%),radial-gradient(1200px_600px_at_50%_105%,rgba(180,83,9,0.2),transparent_64%)]" />
      <div className="pointer-events-none absolute -left-24 top-[36%] h-64 w-64 rounded-full bg-amber-500/18 blur-[95px] md:h-96 md:w-96" />
      <div className="pointer-events-none absolute -right-16 top-[58%] h-64 w-64 rounded-full bg-orange-500/14 blur-[95px] md:h-[26rem] md:w-[26rem]" />
      <div className="pointer-events-none absolute left-1/2 top-[74%] h-60 w-[82vw] -translate-x-1/2 bg-[radial-gradient(ellipse_at_center,rgba(245,158,11,0.2),transparent_68%)] blur-[46px]" />
      <section
        ref={sectionRef}
        className="relative min-h-[100dvh] h-[105dvh] w-full sm:h-[108dvh] md:h-[112dvh] lg:h-[118dvh]"
      >
        <motion.div
          className="sticky top-0 h-[100dvh] overflow-hidden"
          style={{ y: imageY, scale: imageScale, opacity: heroOpacity, filter: heroFilter }}
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
                  quality={100}
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
              ? "absolute inset-0 z-[2] bg-[radial-gradient(ellipse_80%_50%_at_50%_100%,rgba(245,158,11,0.18),transparent_65%)]"
              : "absolute inset-0 z-[2] bg-[radial-gradient(900px_500px_at_50%_0%,rgba(251,191,36,0.28),transparent_60%),radial-gradient(560px_280px_at_22%_16%,rgba(234,88,12,0.18),transparent_64%)]"
          }
        />

        <div
          className={
            usePortraitPhoto
              ? "absolute inset-0 z-[4] flex min-h-[100dvh] w-full flex-col justify-end px-4 pb-[max(1.25rem,env(safe-area-inset-bottom))] text-left sm:px-6 sm:pb-16 md:px-10 md:pb-14 lg:px-14"
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

          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.2, duration: 0.45 }}
            className={
              usePortraitPhoto
                ? "mt-3 flex flex-col items-start gap-1 sm:mt-3.5"
                : "mt-3.5 flex flex-col items-center gap-1"
            }
          >
            <motion.span
              animate={{ y: [0, 4, 0] }}
              transition={{ duration: 1.2, repeat: Infinity, ease: "easeInOut" }}
              className={
                usePortraitPhoto
                  ? "inline-flex h-8 w-8 items-center justify-center rounded-full border border-amber-500/30 bg-black/45 backdrop-blur-sm"
                  : "inline-flex h-8 w-8 items-center justify-center rounded-full border border-white/20 bg-black/35"
              }
            >
              <ChevronDown
                className={
                  usePortraitPhoto ? "h-4 w-4 text-amber-100/90" : "h-4 w-4 text-zinc-200"
                }
              />
            </motion.span>
            <p
              className={
                usePortraitPhoto
                  ? "typo-micro text-amber-100/75"
                  : "typo-micro text-zinc-300/90"
              }
            >
              {t("heroScroll")}
            </p>
          </motion.div>
          </div>
        </div>

        <div className="absolute bottom-0 z-20 h-1 w-full bg-gradient-to-r from-transparent via-white/10 to-transparent" />
      </section>

      <AboutIntroSection />
      <FamousClientsSection />

      <ProjectsCarousel />

      <motion.aside
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.3, duration: 0.55, ease: "easeOut" }}
        className="pointer-events-none fixed bottom-5 right-4 z-[70] flex flex-col items-center gap-3 md:bottom-6 md:right-5"
        aria-label="Accesos rapidos sociales"
      >
        <motion.a
          href={BRAND.instagramUrl}
          target="_blank"
          rel="noreferrer"
          aria-label={`Ir al Instagram de ${BRAND.name}`}
          animate={{ y: [0, -3, 0], scale: [1, 1.02, 1] }}
          transition={{ duration: 3.2, repeat: Infinity, ease: "easeInOut" }}
          whileHover={{ y: -4, scale: 1.05 }}
          whileTap={{ scale: 0.97 }}
          className="pointer-events-auto relative inline-flex h-14 w-14 items-center justify-center rounded-full"
        >
          <motion.span
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 rounded-full bg-amber-300/55 blur-[12px]"
            animate={{ opacity: [0, 0, 0.95, 0, 0, 0.72, 0], scale: [0.88, 0.88, 1.2, 1.24, 0.9, 1.16, 0.9] }}
            transition={{
              duration: 8.5,
              repeat: Infinity,
              ease: "easeInOut",
              times: [0, 0.54, 0.58, 0.63, 0.9, 0.94, 1],
            }}
          />
          <motion.span
            aria-hidden="true"
            className="pointer-events-none absolute left-1/2 top-1/2 h-[76%] w-[6px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-gradient-to-b from-white/0 via-white/90 to-white/0 blur-[1px]"
            animate={{ opacity: [0, 0, 1, 0, 0], rotate: [-24, -24, -18, -16, -24], scaleY: [0.9, 0.9, 1.15, 1.05, 0.9] }}
            transition={{
              duration: 8.5,
              repeat: Infinity,
              ease: "easeInOut",
              times: [0, 0.565, 0.585, 0.605, 1],
            }}
          />
          <span className="relative z-10 inline-flex h-14 w-14 items-center justify-center">
            <SocialBrandIcon network="instagram" size={56} className="h-14 w-14" />
          </span>
        </motion.a>

        <motion.a
          href={whatsappUrl(WHATSAPP_MESSAGES.quote)}
          target="_blank"
          rel="noreferrer"
          aria-label={`Hablar por WhatsApp con ${BRAND.name}`}
          animate={{ y: [0, -3, 0], scale: [1, 1.02, 1] }}
          transition={{ duration: 3.2, delay: 0.45, repeat: Infinity, ease: "easeInOut" }}
          whileHover={{ y: -4, scale: 1.05 }}
          whileTap={{ scale: 0.97 }}
          className="pointer-events-auto relative inline-flex h-14 w-14 items-center justify-center rounded-full"
        >
          <motion.span
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 rounded-full bg-orange-300/55 blur-[12px]"
            animate={{ opacity: [0, 0, 0.92, 0, 0, 0.68, 0], scale: [0.88, 0.88, 1.18, 1.22, 0.9, 1.14, 0.9] }}
            transition={{
              duration: 9.1,
              repeat: Infinity,
              ease: "easeInOut",
              delay: 0.6,
              times: [0, 0.56, 0.6, 0.64, 0.9, 0.95, 1],
            }}
          />
          <motion.span
            aria-hidden="true"
            className="pointer-events-none absolute left-1/2 top-1/2 h-[76%] w-[6px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-gradient-to-b from-white/0 via-white/90 to-white/0 blur-[1px]"
            animate={{ opacity: [0, 0, 1, 0, 0], rotate: [22, 22, 15, 14, 22], scaleY: [0.9, 0.9, 1.12, 1.04, 0.9] }}
            transition={{
              duration: 9.1,
              repeat: Infinity,
              ease: "easeInOut",
              delay: 0.6,
              times: [0, 0.59, 0.615, 0.64, 1],
            }}
          />
          <span className="relative z-10 inline-flex h-14 w-14 items-center justify-center">
            <SocialBrandIcon network="whatsapp" size={56} className="h-14 w-14" />
          </span>
        </motion.a>
      </motion.aside>
    </main>
  );
}

