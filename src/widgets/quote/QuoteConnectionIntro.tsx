"use client";

import { useEffect } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import {
  ConnectionManifestoStatement,
  CONNECTION_MANIFEST_ANIMATION_MS,
} from "@/widgets/quote/ConnectionManifestoStatement";
import { ConnectionManifestoHeadline } from "@/widgets/quote/ConnectionManifestoHeadline";

const easeOut = [0.22, 1, 0.36, 1] as const;

type QuoteConnectionIntroProps = {
  title: string;
  title2: string;
  manifest: string;
  eyebrow?: string;
  onComplete: () => void;
};

export function QuoteConnectionIntro({
  title,
  title2,
  manifest,
  eyebrow,
  onComplete,
}: QuoteConnectionIntroProps) {
  const reduceMotion = useReducedMotion();

  useEffect(() => {
    if (reduceMotion) {
      onComplete();
      return;
    }
    const timer = window.setTimeout(onComplete, CONNECTION_MANIFEST_ANIMATION_MS);
    return () => window.clearTimeout(timer);
  }, [onComplete, reduceMotion]);

  if (reduceMotion) return null;

  return (
    <motion.div
      className="connection-intro absolute inset-0 z-30 flex min-h-0 items-center justify-center overflow-y-auto py-8 sm:py-10"
      initial={{ opacity: 1 }}
      aria-live="polite"
      aria-label={`${title} ${title2}`}
    >
      <div className="connection-intro__ambient" aria-hidden>
        <motion.span
          className="connection-intro__orb connection-intro__orb--a"
          animate={{ opacity: [0.35, 0.55, 0.35], scale: [1, 1.06, 1] }}
          transition={{ duration: 5.5, repeat: Infinity, ease: "easeInOut" }}
        />
        <motion.span
          className="connection-intro__orb connection-intro__orb--b"
          animate={{ opacity: [0.2, 0.38, 0.2], x: [0, 12, 0] }}
          transition={{ duration: 7, repeat: Infinity, ease: "easeInOut" }}
        />
        <span className="connection-intro__grid" />
      </div>

      <div className="connection-intro__content relative px-5 sm:px-8">
        <ConnectionManifestoHeadline
          line1={title}
          line2={title2}
          eyebrow={eyebrow}
          size="intro"
        />

        <ConnectionManifestoStatement text={manifest} />

        <motion.div
          className="connection-intro__progress"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 1.05, duration: 0.35 }}
        >
          <motion.div
            className="connection-intro__progress-fill"
            initial={{ scaleX: 0 }}
            animate={{ scaleX: 1 }}
            transition={{
              duration: (CONNECTION_MANIFEST_ANIMATION_MS - 1200) / 1000,
              delay: 1.15,
              ease: "linear",
            }}
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
    <div className="relative min-h-[clamp(26rem,82dvh,42rem)]">
      <AnimatePresence mode="wait">
        {show ? (
          <motion.div
            key="intro"
            className="absolute inset-0"
            exit={{ opacity: 0, filter: "blur(12px)", scale: 0.985 }}
            transition={{ duration: 0.7, ease: easeOut }}
          >
            {intro}
          </motion.div>
        ) : (
          <motion.div
            key="questions"
            initial={{ opacity: 0, y: 20, filter: "blur(8px)" }}
            animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
            transition={{ duration: 0.65, ease: easeOut }}
          >
            {children}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
