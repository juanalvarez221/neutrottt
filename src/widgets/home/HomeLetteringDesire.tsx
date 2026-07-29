"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { ArrowRight } from "lucide-react";
import { TATTOO_PROJECTS } from "@/shared/config/tattooProjects";
import { useSiteLanguage } from "@/shared/i18n/LanguageProvider";

type PuzzlePhase = "assemble" | "hold" | "scatter";

/** Flight paths — viewport-relative, cinematic arcs */
const FLIGHT = [
  { x: "-48vw", y: "8vh", r: -18 },
  { x: "46vw", y: "-12vh", r: 14 },
  { x: "-18vw", y: "-36vh", r: 10 },
  { x: "42vw", y: "28vh", r: -12 },
  { x: "6vw", y: "38vh", r: 16 },
  { x: "-44vw", y: "-18vh", r: -20 },
  { x: "32vw", y: "-34vh", r: 8 },
  { x: "-10vw", y: "40vh", r: -14 },
  { x: "50vw", y: "4vh", r: 12 },
] as const;

const EASE_LAND = [0.16, 1, 0.3, 1] as const;
const EASE_EXIT = [0.4, 0, 0.2, 1] as const;

const ASSEMBLE_STAGGER = 0.11;
const ASSEMBLE_MS = 780;
const HOLD_MS = 3400;
const SCATTER_STAGGER = 0.07;
const SCATTER_MS = 620;
const SETTLE_MS = 220;

function useIsNarrow(breakpoint = 768) {
  const [narrow, setNarrow] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia(`(max-width: ${breakpoint - 1}px)`);
    const sync = () => setNarrow(mq.matches);
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, [breakpoint]);

  return narrow;
}

function puzzleGrid(count: number, narrow: boolean): {
  columns: string;
  rows: string;
  span?: (index: number) => string | undefined;
} {
  if (narrow) {
    if (count <= 3) return { columns: "1fr", rows: `repeat(${count}, 1fr)` };
    if (count === 4) return { columns: "1fr 1fr", rows: "1fr 1fr" };
    if (count === 5) {
      return {
        columns: "1fr 1fr",
        rows: "1fr 1fr 1fr",
        span: (i) => (i === 4 ? "1 / -1" : undefined),
      };
    }
    if (count === 6) return { columns: "1fr 1fr", rows: "1fr 1fr 1fr" };
    return {
      columns: "1fr 1fr",
      rows: "1.2fr 1fr 1fr 1fr",
      span: (i) => (i === 0 ? "1 / -1" : undefined),
    };
  }

  if (count <= 3) return { columns: `repeat(${count}, 1fr)`, rows: "1fr" };
  if (count === 4) return { columns: "1fr 1fr", rows: "1fr 1fr" };
  if (count === 5) {
    return {
      columns: "repeat(6, 1fr)",
      rows: "1fr 1fr",
      span: (i) => (i < 3 ? "span 2" : "span 3"),
    };
  }
  if (count === 6) return { columns: "1fr 1fr 1fr", rows: "1fr 1fr" };
  return {
    columns: "1.35fr 1fr 1fr 1fr",
    rows: "1fr 1fr",
    span: (i) => (i === 0 ? "1 / 1 / 3 / 2" : undefined),
  };
}

/** Center-out assemble / edge-out scatter order */
function choreographyOrder(count: number): number[] {
  const mid = (count - 1) / 2;
  return Array.from({ length: count }, (_, i) => i).sort(
    (a, b) => Math.abs(a - mid) - Math.abs(b - mid),
  );
}

function ProjectPuzzle({
  reduceMotion,
}: {
  reduceMotion: boolean | null;
}) {
  const narrow = useIsNarrow();
  const [projectIndex, setProjectIndex] = useState(0);
  const [phase, setPhase] = useState<PuzzlePhase>("assemble");
  const project = TATTOO_PROJECTS[projectIndex];
  const images = project.images;
  const layout = useMemo(
    () => puzzleGrid(images.length, narrow),
    [images.length, narrow],
  );
  const order = useMemo(() => choreographyOrder(images.length), [images.length]);
  const assembleRank = useMemo(() => {
    const ranks = new Array(images.length).fill(0);
    order.forEach((pieceIndex, rank) => {
      ranks[pieceIndex] = rank;
    });
    return ranks;
  }, [images.length, order]);

  const assembleTotalMs = useMemo(() => {
    if (reduceMotion) return 120;
    return ASSEMBLE_MS + images.length * ASSEMBLE_STAGGER * 1000 + SETTLE_MS;
  }, [images.length, reduceMotion]);

  const scatterTotalMs = useMemo(() => {
    if (reduceMotion) return 120;
    return SCATTER_MS + images.length * SCATTER_STAGGER * 1000 + 80;
  }, [images.length, reduceMotion]);

  useEffect(() => {
    let timer: number;

    if (phase === "assemble") {
      timer = window.setTimeout(() => setPhase("hold"), assembleTotalMs);
    } else if (phase === "hold") {
      timer = window.setTimeout(
        () => setPhase("scatter"),
        reduceMotion ? 1800 : HOLD_MS,
      );
    } else {
      timer = window.setTimeout(() => {
        setProjectIndex((prev) => (prev + 1) % TATTOO_PROJECTS.length);
        setPhase("assemble");
      }, scatterTotalMs);
    }

    return () => window.clearTimeout(timer);
  }, [assembleTotalMs, phase, reduceMotion, scatterTotalMs]);

  const assembled = phase === "assemble" || phase === "hold";
  const holding = phase === "hold";
  const scattering = phase === "scatter";

  return (
    <div className="relative mt-8 h-[100dvh] w-screen max-w-[100vw] overflow-hidden border-y border-[rgba(var(--rgb-sand),0.14)] bg-[#080506] left-1/2 right-1/2 -ml-[50vw] mr-[-50vw]">
      <motion.div
        className="pointer-events-none absolute inset-0 z-[3]"
        aria-hidden
        animate={{
          opacity: holding ? 0 : 0.35,
          backgroundColor: holding ? "rgba(8,5,6,0)" : "rgba(8,5,6,0.45)",
        }}
        transition={{ duration: 0.55, ease: EASE_LAND }}
      />

      <div
        className="pointer-events-none absolute inset-0 z-0 opacity-80"
        aria-hidden
        style={{
          background:
            "radial-gradient(70vw 40vh at 12% 0%, rgba(var(--rgb-terracotta),0.14), transparent 55%), radial-gradient(50vw 35vh at 88% 100%, rgba(var(--rgb-sand),0.07), transparent 50%)",
        }}
      />

      <div
        className="relative z-[1] grid h-full w-full gap-[3px] p-[3px] sm:gap-1.5 sm:p-1.5"
        style={{
          gridTemplateColumns: layout.columns,
          gridTemplateRows: layout.rows,
        }}
        aria-live="polite"
        aria-label={project.title}
      >
        {images.map((src, index) => {
          const flight = FLIGHT[index % FLIGHT.length];
          const inDelay = reduceMotion ? 0 : assembleRank[index] * ASSEMBLE_STAGGER;
          const outDelay = reduceMotion
            ? 0
            : (images.length - 1 - assembleRank[index]) * SCATTER_STAGGER;
          const delay = scattering ? outDelay : inDelay;
          const area = layout.span?.(index);

          return (
            <motion.div
              key={`${project.id}-${src}`}
              className="relative min-h-0 min-w-0 overflow-hidden bg-[#100a0c] will-change-transform"
              style={{
                zIndex: assembled ? 1 : 10 + index,
                ...(area?.includes("/")
                  ? { gridArea: area }
                  : area
                    ? { gridColumn: area }
                    : null),
              }}
              initial={
                reduceMotion
                  ? false
                  : {
                      opacity: 0,
                      x: flight.x,
                      y: flight.y,
                      rotate: flight.r,
                      scale: 0.62,
                      filter: "blur(14px) brightness(0.55)",
                    }
              }
              animate={
                assembled
                  ? {
                      opacity: 1,
                      x: 0,
                      y: 0,
                      rotate: 0,
                      scale: holding ? 1 : 1.01,
                      filter: "blur(0px) brightness(1)",
                    }
                  : {
                      opacity: 0,
                      x: flight.x,
                      y: flight.y,
                      rotate: flight.r * 1.45,
                      scale: 0.58,
                      filter: "blur(18px) brightness(0.4)",
                    }
              }
              transition={
                reduceMotion
                  ? { duration: 0.01 }
                  : scattering
                    ? {
                        duration: SCATTER_MS / 1000,
                        ease: EASE_EXIT,
                        delay,
                        opacity: { duration: SCATTER_MS / 1000, ease: "easeIn", delay },
                        filter: { duration: SCATTER_MS / 1000, ease: "easeIn", delay },
                      }
                    : {
                        type: "spring",
                        stiffness: 210,
                        damping: 22,
                        mass: 0.9,
                        delay,
                        filter: {
                          duration: 0.55,
                          ease: EASE_LAND,
                          delay,
                        },
                        opacity: {
                          duration: 0.4,
                          ease: EASE_LAND,
                          delay,
                        },
                      }
              }
            >
              <motion.div
                className="absolute inset-0"
                animate={
                  holding
                    ? { scale: 1 }
                    : assembled
                      ? { scale: 1.06 }
                      : { scale: 1.14 }
                }
                transition={{
                  duration: reduceMotion ? 0.01 : holding ? 0.9 : 0.75,
                  ease: EASE_LAND,
                  delay: reduceMotion ? 0 : delay * 0.35,
                }}
              >
                <Image
                  src={src}
                  alt=""
                  fill
                  sizes="100vw"
                  className="object-cover"
                  priority={projectIndex === 0 && index < 4}
                />
              </motion.div>

              <motion.div
                className="pointer-events-none absolute inset-0"
                aria-hidden
                animate={{
                  boxShadow: holding
                    ? "inset 0 0 0 1px rgba(243,230,215,0.14)"
                    : "inset 0 0 0 1px rgba(243,230,215,0.05)",
                }}
                transition={{ duration: 0.5 }}
              />
            </motion.div>
          );
        })}
      </div>

      {/* Completion sweep */}
      <div className="pointer-events-none absolute inset-x-0 bottom-0 z-[4] h-[2px] overflow-hidden bg-[rgba(8,5,6,0.4)]">
        <motion.div
          key={`${project.id}-${phase}`}
          className="h-full origin-left bg-gradient-to-r from-[rgba(var(--rgb-terracotta),0.35)] via-[rgba(var(--rgb-sand),0.85)] to-[rgba(var(--rgb-terracotta),0.55)]"
          initial={{ scaleX: 0 }}
          animate={{
            scaleX: holding ? 1 : assembled ? 0.08 : 0,
          }}
          transition={{
            duration: holding ? (reduceMotion ? 1.5 : HOLD_MS / 1000) : 0.45,
            ease: holding ? "linear" : EASE_LAND,
          }}
        />
      </div>
    </div>
  );
}

export function HomeLetteringDesire() {
  const { t } = useSiteLanguage();
  const reduceMotion = useReducedMotion();

  return (
    <section
      id="piezas"
      className="section-surface section-surface--portfolio relative scroll-mt-24 overflow-x-hidden py-16 md:py-24"
      aria-labelledby="desire-heading"
    >
      <div className="relative z-[1] mx-auto max-w-[1400px] px-4 sm:px-6">
        <motion.header
          className="max-w-2xl"
          initial={reduceMotion ? false : { opacity: 0, y: 16 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 0.4 }}
          transition={{ duration: reduceMotion ? 0.01 : 0.45, ease: EASE_LAND }}
        >
          <p className="typo-eyebrow typo-eyebrow-muted">{t("desireTag")}</p>
          <h2
            id="desire-heading"
            className="typo-gothic mt-3 text-[clamp(2.2rem,5.5vw,3.6rem)] text-[rgba(var(--rgb-sand),0.96)]"
          >
            {t("desireTitle")}
          </h2>
          <p
            className="mt-4 max-w-[34ch] text-[0.95rem] font-bold uppercase tracking-[0.1em] text-[rgba(var(--rgb-ivory),0.82)]"
            style={{ fontFamily: "var(--font-stack-display)" }}
          >
            {t("desireLead")}
          </p>
        </motion.header>
      </div>

      <ProjectPuzzle reduceMotion={reduceMotion} />

      <div className="relative z-[1] mx-auto mt-12 flex max-w-[1400px] flex-col items-start justify-between gap-6 border-t border-[rgba(var(--rgb-sand),0.14)] px-4 pt-10 sm:flex-row sm:items-end sm:px-6">
        <div className="max-w-md">
          <p
            className="text-[clamp(1.35rem,3vw,1.85rem)] font-bold uppercase tracking-[0.08em] text-[rgba(var(--rgb-ivory),0.92)]"
            style={{ fontFamily: "var(--font-stack-display)" }}
          >
            {t("desireCtaHook")}
          </p>
          <p className="mt-2 text-sm text-[rgba(var(--rgb-sand),0.7)]">{t("desireCtaLead")}</p>
        </div>
        <Link
          href="/cotizacion"
          target="_blank"
          rel="noopener noreferrer"
          className="btn-accent typo-cta group inline-flex min-h-12 items-center justify-center gap-2 rounded-xl px-7 py-3.5 active:scale-[0.98]"
        >
          {t("desireCta")}
          <ArrowRight
            className="h-4 w-4 transition-transform group-hover:translate-x-0.5"
            strokeWidth={1.75}
          />
        </Link>
      </div>
    </section>
  );
}
