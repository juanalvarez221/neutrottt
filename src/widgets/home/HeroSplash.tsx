"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import {
  AnimatePresence,
  motion,
  useMotionTemplate,
  useMotionValueEvent,
  useScroll,
  useTransform,
} from "framer-motion";
import Link from "next/link";
import { ChevronDown } from "lucide-react";
import { ProjectsCarousel } from "@/widgets/home/ProjectsCarousel";
import { TeoIntroCarousel } from "@/widgets/home/TeoIntroCarousel";

type HeroSplashProps = {
  backgroundImageUrl: string;
  backgroundImageUrls?: string[];
  backgroundVideoUrl?: string;
  artistName: string;
  subtitle: string;
  wordmarkSrc?: string;
};

export function HeroSplash({
  backgroundImageUrl,
  backgroundImageUrls,
  backgroundVideoUrl,
  artistName,
  subtitle,
  wordmarkSrc,
}: HeroSplashProps) {
  const sectionRef = useRef<HTMLElement>(null);
  const [direction, setDirection] = useState<"up" | "down">("down");
  const [heroIndex, setHeroIndex] = useState(0);
  const heroImages =
    backgroundImageUrls && backgroundImageUrls.length > 0
      ? backgroundImageUrls
      : [backgroundImageUrl];
  const useHeroCarousel = !backgroundVideoUrl && heroImages.length > 1;
  const currentHeroImage = heroImages[heroIndex] ?? backgroundImageUrl;

  const { scrollYProgress, scrollY } = useScroll({
    target: sectionRef,
    offset: ["start start", "end start"],
  });

  useMotionValueEvent(scrollY, "change", (latest) => {
    const previous = scrollY.getPrevious() ?? latest;
    if (latest > previous) setDirection("down");
    if (latest < previous) setDirection("up");
  });

  // Base parallax that always tracks scroll progress.
  const imageY = useTransform(scrollYProgress, [0, 1], [0, -72]);
  const imageScale = useTransform(scrollYProgress, [0, 1], [1, 1.08]);
  const heroOpacity = useTransform(scrollYProgress, [0, 0.78, 1], [1, 0.94, 0.72]);
  const heroBlur = useTransform(scrollYProgress, [0, 1], [0, 2.4]);
  const heroFilter = useMotionTemplate`blur(${heroBlur}px)`;

  const markY = useTransform(scrollYProgress, [0, 1], [10, 22]);
  const markOpacity = useTransform(scrollYProgress, [0, 0.55, 1], [1, 0.76, 0.12]);
  const markScale = useTransform(scrollYProgress, [0, 0.55, 1], [0.92, 1.02, 1.14]);
  const markBlur = useTransform(scrollYProgress, [0, 0.7, 1], [0, 0.6, 2.8]);
  const markFilter = useMotionTemplate`blur(${markBlur}px)`;
  const subtitleY = useTransform(scrollYProgress, [0, 1], [0, 52]);
  const subtitleOpacity = useTransform(scrollYProgress, [0, 1], [0.88, 0.38]);

  useEffect(() => {
    if (!useHeroCarousel) return;
    const id = window.setInterval(() => {
      setHeroIndex((prev) => (prev + 1) % heroImages.length);
    }, 7000);
    return () => window.clearInterval(id);
  }, [heroImages.length, useHeroCarousel]);

  return (
    <main className="relative overflow-hidden bg-black text-white">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(1100px_540px_at_8%_-8%,rgba(139,92,246,0.26),transparent_60%),radial-gradient(920px_480px_at_95%_6%,rgba(168,85,247,0.2),transparent_62%),radial-gradient(1200px_600px_at_50%_105%,rgba(91,33,182,0.2),transparent_64%)]" />
      <div className="pointer-events-none absolute -left-24 top-[36%] h-64 w-64 rounded-full bg-violet-500/18 blur-[95px] md:h-96 md:w-96" />
      <div className="pointer-events-none absolute -right-16 top-[58%] h-64 w-64 rounded-full bg-fuchsia-500/14 blur-[95px] md:h-[26rem] md:w-[26rem]" />
      <div className="pointer-events-none absolute left-1/2 top-[74%] h-60 w-[82vw] -translate-x-1/2 bg-[radial-gradient(ellipse_at_center,rgba(139,92,246,0.2),transparent_68%)] blur-[46px]" />
      <section ref={sectionRef} className="relative h-[112dvh] w-full md:h-[118dvh]">
        <motion.div
          className="sticky top-0 h-[100dvh] overflow-hidden"
          style={{ y: imageY, scale: imageScale, opacity: heroOpacity, filter: heroFilter }}
          animate={
            direction === "down"
              ? { rotateZ: 0.12 }
              : { rotateZ: -0.08 }
          }
          transition={{ duration: 0.45, ease: "easeOut" }}
        >
          {backgroundVideoUrl ? (
            <video
              key={backgroundVideoUrl}
              src={backgroundVideoUrl}
              className="h-full w-full object-cover object-center"
              autoPlay
              muted
              loop
              playsInline
              preload="auto"
              poster={backgroundImageUrl}
            />
          ) : (
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
          )}
        </motion.div>

        <div className="absolute inset-0 z-[2] bg-[radial-gradient(900px_500px_at_50%_0%,rgba(168,85,247,0.34),transparent_60%),radial-gradient(560px_280px_at_22%_16%,rgba(147,51,234,0.18),transparent_64%)]" />
        <div className="absolute inset-0 z-[2] bg-gradient-to-b from-transparent via-black/35 to-black/95" />
        <div className="absolute inset-0 z-[2] shadow-[inset_0_0_160px_40px_rgba(0,0,0,0.85)]" />

        <div className="absolute inset-0 z-[4] flex h-[100dvh] w-full flex-col items-center justify-end px-6 pb-16 text-center md:pb-14">
          {wordmarkSrc ? (
            <motion.div
              initial={{ opacity: 0, y: 12, filter: "blur(6px)" }}
              animate={
                direction === "down"
                  ? { opacity: 1, y: 0, filter: "blur(0px)" }
                  : { opacity: 0.95, y: -4, filter: "blur(0.2px)" }
              }
              transition={{ duration: 0.45, ease: "easeOut" }}
              style={{
                y: markY,
                opacity: markOpacity,
                scale: markScale,
                filter: markFilter,
              }}
              className="z-20 w-[66vw] max-w-[360px] drop-shadow-[0_16px_36px_rgba(0,0,0,0.92)] will-change-transform sm:max-w-[420px] md:w-[74vw] md:max-w-[900px]"
              aria-label={artistName}
            >
              <Image
                src={wordmarkSrc}
                alt={artistName}
                width={2200}
                height={680}
                priority
                className="h-auto w-full object-contain"
              />
            </motion.div>
          ) : (
            <motion.h1
              initial={{ opacity: 0, y: 12, filter: "blur(6px)" }}
              animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
              transition={{ duration: 0.6, ease: "easeOut" }}
              style={{ y: markY, opacity: markOpacity }}
              className="typo-hero text-[2.2rem] drop-shadow-[0_10px_28px_rgba(0,0,0,0.9)] md:text-[5rem]"
            >
              {artistName}
            </motion.h1>
          )}

          <motion.p
            initial={{ opacity: 0, y: 8 }}
            animate={
              direction === "down"
                ? { opacity: 0.92, y: 0 }
                : { opacity: 0.85, y: -3 }
            }
            transition={{ delay: 0.05, duration: 0.45, ease: "easeOut" }}
            style={{ y: subtitleY, opacity: subtitleOpacity }}
            className="mt-0.5 text-[0.54rem] font-semibold uppercase tracking-[0.16em] text-zinc-200 md:text-[0.84rem] md:tracking-[0.24em]"
          >
            {subtitle}
          </motion.p>

          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.12, duration: 0.5, ease: "easeOut" }}
            className="mt-6 w-full max-w-[320px] md:mt-7 md:max-w-sm"
          >
            <Link
              href="/cotizacion"
              className="typo-cta group inline-flex w-full items-center justify-center gap-2 rounded-xl border border-violet-500/35 bg-gradient-to-r from-violet-700 to-fuchsia-600 px-5 py-3.5 text-[0.9rem] text-white shadow-[0_0_28px_rgba(139,92,246,0.3)] transition hover:-translate-y-0.5 hover:shadow-[0_0_34px_rgba(139,92,246,0.4)] active:translate-y-0 md:py-4"
            >
              Quiero cotizar mi diseño
              <span className="transition-transform group-hover:translate-x-1">
                →
              </span>
            </Link>
          </motion.div>

          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.2, duration: 0.45 }}
            className="mt-3.5 flex flex-col items-center gap-1 md:mt-4"
          >
            <motion.span
              animate={{ y: [0, 4, 0] }}
              transition={{ duration: 1.2, repeat: Infinity, ease: "easeInOut" }}
              className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-white/20 bg-black/35"
            >
              <ChevronDown className="h-4 w-4 text-zinc-200" />
            </motion.span>
            <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-zinc-300/90 md:text-[11px]">
              Desliza hacia abajo
            </p>
          </motion.div>
        </div>

        <div className="absolute bottom-0 z-20 h-1 w-full bg-gradient-to-r from-transparent via-white/10 to-transparent" />
      </section>

      <motion.section
        initial={{ opacity: 0, y: 20 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, amount: 0.18 }}
        transition={{ duration: 0.55, ease: "easeOut" }}
        className="relative z-20 mx-auto w-full max-w-6xl px-6 py-14 md:py-20"
      >
        <div className="glass-card relative overflow-hidden rounded-3xl p-5 md:p-8">
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(520px_220px_at_10%_0%,rgba(168,85,247,0.2),transparent_58%),radial-gradient(620px_260px_at_100%_100%,rgba(124,58,237,0.16),transparent_60%)]" />
          <div className="relative z-10">
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-violet-200/80">
              Identidad
            </p>
            <h2 className="typo-section mt-2">
              Arte oscuro, precisión total
            </h2>
            <p className="typo-body mt-3 max-w-3xl">
              Soy Mateo, la mente detrás de Malianteo. Mi enfoque combina
              realismo oscuro, técnica limpia y dirección artística para crear
              piezas con carácter.
            </p>
            <p className="typo-body mt-2 max-w-3xl">
              No trabajo con plantillas ni copias: cada tatuaje lo diseño desde
              cero para que refleje tu identidad con fuerza, detalle y presencia.
            </p>

            <TeoIntroCarousel />
          </div>
        </div>

        <div className="relative mt-8 md:mt-10">
          <div className="pointer-events-none absolute -left-8 -top-4 h-24 w-24 rounded-full bg-violet-500/15 blur-[42px]" />
          <div className="pointer-events-none absolute -right-6 bottom-0 h-24 w-24 rounded-full bg-fuchsia-500/12 blur-[42px]" />
          <ProjectsCarousel />
        </div>
      </motion.section>

      <motion.a
        href="https://www.instagram.com/malianteo_ink/"
        target="_blank"
        rel="noreferrer"
        aria-label="Ir al Instagram de Malianteo"
        initial={{ opacity: 0, y: 18, scale: 0.96 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ delay: 0.35, duration: 0.5, ease: "easeOut" }}
        whileHover={{ y: -2, scale: 1.03 }}
        className="group fixed bottom-6 right-5 z-[70] inline-flex h-14 w-14 items-center justify-center rounded-full border border-white/20 bg-black/60 text-zinc-100 backdrop-blur-xl shadow-[0_16px_36px_-18px_rgba(168,85,247,0.72)] transition hover:border-fuchsia-300/45 hover:text-white"
      >
        <span className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-gradient-to-br from-violet-600 to-fuchsia-500 text-white shadow-[0_0_24px_rgba(168,85,247,0.5)]">
          <Image
            src="/brand/instagram-icon.png"
            alt="Instagram"
            width={22}
            height={22}
            className="h-[22px] w-[22px] object-contain"
          />
        </span>
      </motion.a>
    </main>
  );
}

