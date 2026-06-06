"use client";

import { useEffect } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import {
  CinematicBackdrop,
  FloatingDust,
  FrameCorners,
  MonoEyebrow,
  ShimmerPass,
  StaggeredHeadline,
} from "@/widgets/quote/ConnectionCinematic";

const INTRO_DURATION_MS = 7400;

type QuoteConnectionIntroProps = {
  title: string;
  title2: string;
  eyebrow?: string;
  onComplete: () => void;
};

export function QuoteConnectionIntro({
  title,
  title2,
  eyebrow = "Neutrottt · Curaduría",
  onComplete,
}: QuoteConnectionIntroProps) {
  const reduceMotion = useReducedMotion();

  useEffect(() => {
    if (reduceMotion) {
      onComplete();
      return;
    }
    const timer = window.setTimeout(onComplete, INTRO_DURATION_MS);
    return () => window.clearTimeout(timer);
  }, [onComplete, reduceMotion]);

  if (reduceMotion) return null;

  return (
    <motion.div
      className="absolute inset-0 z-30 flex min-h-[min(72dvh,640px)] items-center justify-center overflow-hidden"
      initial={{ opacity: 1 }}
      aria-live="polite"
      aria-label={`${title} ${title2}`}
    >
      <CinematicBackdrop variant="intro" />
      <FloatingDust count={26} />

      <motion.div
        className="pointer-events-none absolute left-1/2 top-[42%] h-56 w-56 -translate-x-1/2 -translate-y-1/2 rounded-full border border-amber-400/20"
        initial={{ scale: 0.35, opacity: 0 }}
        animate={{ scale: [0.35, 1.25, 1.05], opacity: [0, 0.45, 0.2] }}
        transition={{ duration: 2.2, ease: [0.22, 1, 0.36, 1] }}
      />
      <motion.div
        className="pointer-events-none absolute left-1/2 top-[42%] h-72 w-72 -translate-x-1/2 -translate-y-1/2 rounded-full border border-amber-500/10"
        initial={{ scale: 0.2, opacity: 0 }}
        animate={{ scale: [0.2, 1.45, 1.2], opacity: [0, 0.28, 0.1] }}
        transition={{ duration: 2.6, delay: 0.18, ease: [0.22, 1, 0.36, 1] }}
      />

      <div className="connection-cinema__panel relative mx-4 w-full max-w-2xl px-6 py-10 text-center md:px-10 md:py-12">
        <FrameCorners delay={0.25} />
        <ShimmerPass delay={1.05} />

        <MonoEyebrow label={eyebrow} delay={0.15} />

        <div className="overflow-hidden [perspective:900px]">
          <p className="sr-only">
            {title} {title2}
          </p>
          <p
            className="font-[family-name:var(--font-stack-display)] text-[clamp(2.15rem,8.5vw,4rem)] font-bold uppercase leading-[0.92] tracking-[0.06em] text-white"
            aria-hidden
          >
            <StaggeredHeadline text={title} delay={0.28} stagger={0.045} />
          </p>
        </div>

        <motion.div
          className="mx-auto my-5 h-px overflow-hidden"
          initial={{ width: 0, opacity: 0 }}
          animate={{ width: "min(14rem, 52vw)", opacity: 1 }}
          transition={{ duration: 0.75, delay: 0.95, ease: [0.22, 1, 0.36, 1] }}
        >
          <motion.div
            className="h-full w-full bg-gradient-to-r from-transparent via-amber-300 to-transparent"
            animate={{ opacity: [0.5, 1, 0.5] }}
            transition={{ duration: 2.4, repeat: Infinity, ease: "easeInOut" }}
          />
        </motion.div>

        <div className="overflow-hidden [perspective:900px]">
          <p
            className="bg-gradient-to-r from-amber-50 via-white to-amber-200 bg-clip-text font-[family-name:var(--font-stack-brand)] text-[clamp(2.35rem,9vw,4.35rem)] leading-[0.95] tracking-[-0.01em] text-transparent"
            aria-hidden
          >
            <StaggeredHeadline text={title2} delay={1.05} stagger={0.042} />
          </p>
        </div>

        <motion.div
          className="mx-auto mt-10 h-[3px] w-56 overflow-hidden rounded-full bg-white/8 md:w-64"
          initial={{ opacity: 0, scaleX: 0.6 }}
          animate={{ opacity: 1, scaleX: 1 }}
          transition={{ delay: 1.35, duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
        >
          <motion.div
            className="h-full origin-left rounded-full bg-gradient-to-r from-amber-600 via-amber-300 to-orange-500"
            initial={{ scaleX: 0 }}
            animate={{ scaleX: 1 }}
            transition={{ duration: 5.2, delay: 1.45, ease: "linear" }}
          />
        </motion.div>

      </div>
    </motion.div>
  );
}

export function QuoteConnectionIntroGate({
  show,
  children,
  intro,
}: {
  show: boolean;
  intro: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="relative min-h-[min(72dvh,640px)]">
      <AnimatePresence mode="wait">
        {show ? (
          <motion.div
            key="intro"
            className="absolute inset-0"
            exit={{ opacity: 0, filter: "blur(14px)", scale: 1.03 }}
            transition={{ duration: 0.75, ease: [0.22, 1, 0.36, 1] }}
          >
            {intro}
          </motion.div>
        ) : (
          <motion.div
            key="questions"
            initial={{ opacity: 0, y: 22, filter: "blur(8px)" }}
            animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
            transition={{ duration: 0.75, ease: [0.22, 1, 0.36, 1] }}
          >
            {children}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
