"use client";

import { useEffect } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";

const INTRO_DURATION_MS = 5200;

type QuoteConnectionIntroProps = {
  title: string;
  title2: string;
  onComplete: () => void;
};

export function QuoteConnectionIntro({ title, title2, onComplete }: QuoteConnectionIntroProps) {
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
      className="absolute inset-0 z-30 flex min-h-[min(72dvh,640px)] items-center justify-center"
      initial={{ opacity: 1 }}
      aria-live="polite"
      aria-label={`${title} ${title2}`}
    >
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_90%_70%_at_50%_45%,rgba(245,158,11,0.14),transparent_65%)]" />
      <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(180deg,transparent,rgba(5,4,3,0.35),transparent)]" />

      <div className="relative px-6 text-center">
        <motion.div
          initial={{ opacity: 0, scale: 0.92 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
          className="mx-auto mb-8 h-px w-16 origin-center bg-gradient-to-r from-transparent via-amber-400/70 to-transparent"
        />

        <div className="overflow-hidden">
          <motion.p
            className="typo-section text-[clamp(2rem,7vw,3.25rem)] font-semibold leading-[1.02] tracking-[-0.02em] text-white"
            initial={{ opacity: 0, y: "110%", filter: "blur(10px)" }}
            animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
            transition={{ duration: 0.75, delay: 0.12, ease: [0.22, 1, 0.36, 1] }}
          >
            {title}
          </motion.p>
        </div>

        <motion.div
          className="mx-auto my-5 h-px overflow-hidden"
          initial={{ width: 0, opacity: 0 }}
          animate={{ width: "min(12rem, 42vw)", opacity: 1 }}
          transition={{ duration: 0.65, delay: 0.55, ease: [0.22, 1, 0.36, 1] }}
        >
          <div className="h-full w-full bg-gradient-to-r from-amber-600/20 via-amber-400/80 to-amber-600/20" />
        </motion.div>

        <div className="overflow-hidden">
          <motion.p
            className="typo-section bg-gradient-to-r from-white via-amber-100 to-zinc-400 bg-clip-text text-[clamp(2rem,7vw,3.25rem)] font-semibold leading-[1.02] tracking-[-0.02em] text-transparent"
            initial={{ opacity: 0, y: "100%", filter: "blur(12px)" }}
            animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
            transition={{ duration: 0.8, delay: 0.72, ease: [0.22, 1, 0.36, 1] }}
          >
            {title2}
          </motion.p>
        </div>

        <motion.div
          className="mx-auto mt-10 h-0.5 w-48 overflow-hidden rounded-full bg-white/10"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.9, duration: 0.3 }}
        >
          <motion.div
            className="h-full origin-left rounded-full bg-gradient-to-r from-amber-500 to-orange-500"
            initial={{ scaleX: 0 }}
            animate={{ scaleX: 1 }}
            transition={{ duration: 4, delay: 0.95, ease: "linear" }}
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
            exit={{ opacity: 0, filter: "blur(10px)", scale: 0.98 }}
            transition={{ duration: 0.65, ease: [0.22, 1, 0.36, 1] }}
          >
            {intro}
          </motion.div>
        ) : (
          <motion.div
            key="questions"
            initial={{ opacity: 0, y: 18, filter: "blur(6px)" }}
            animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
            transition={{ duration: 0.65, ease: [0.22, 1, 0.36, 1] }}
          >
            {children}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
