"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { ArrowRight } from "lucide-react";
import type { ConnectionPraiseContent } from "@/shared/lib/connectionPraise";
import {
  CinematicBackdrop,
  FloatingDust,
  FrameCorners,
  MonoEyebrow,
  ShimmerPass,
  StaggeredHeadline,
} from "@/widgets/quote/ConnectionCinematic";

const REWARD_MIN_READ_MS = 5800;
const REWARD_CONTROLS_MS = 5200;

type QuoteConnectionRewardProps = {
  title1: string;
  title2: string;
  tag: string;
  eyebrow: string;
  continueLabel: string;
  tapHint: string;
  praise: ConnectionPraiseContent;
  onComplete: () => void;
};

export function QuoteConnectionReward({
  title1,
  title2,
  tag,
  eyebrow,
  continueLabel,
  tapHint,
  praise,
  onComplete,
}: QuoteConnectionRewardProps) {
  const reduceMotion = useReducedMotion();
  const [canDismiss, setCanDismiss] = useState(Boolean(reduceMotion));
  const [showControls, setShowControls] = useState(Boolean(reduceMotion));
  const completedRef = useRef(false);

  const complete = useCallback(() => {
    if (completedRef.current || !canDismiss) return;
    completedRef.current = true;
    onComplete();
  }, [canDismiss, onComplete]);

  useEffect(() => {
    scrollToTop();
  }, []);

  useEffect(() => {
    if (reduceMotion) return;
    const readTimer = window.setTimeout(() => setCanDismiss(true), REWARD_MIN_READ_MS);
    const controlsTimer = window.setTimeout(() => setShowControls(true), REWARD_CONTROLS_MS);
    return () => {
      window.clearTimeout(readTimer);
      window.clearTimeout(controlsTimer);
    };
  }, [reduceMotion]);

  const handleOverlayClick = () => {
    complete();
  };

  const handleButtonClick = (event: React.MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation();
    complete();
  };

  return (
    <motion.div
      className={[
        "fixed inset-0 z-[80] flex items-center justify-center overflow-hidden bg-[#050403]/94 px-4 py-10 backdrop-blur-xl",
        canDismiss ? "cursor-pointer" : "cursor-default",
      ].join(" ")}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0, filter: "blur(10px)" }}
      transition={{ duration: 0.65, ease: [0.22, 1, 0.36, 1] }}
      role="dialog"
      aria-live="polite"
      aria-label={`${title1} ${title2}`}
      onClick={handleOverlayClick}
    >
      <CinematicBackdrop variant="reward" />
      {!reduceMotion ? <FloatingDust count={32} /> : null}

      {!reduceMotion
        ? [0, 1, 2].map((index) => (
            <motion.span
              key={index}
              className="pointer-events-none absolute left-1/2 top-[40%] h-52 w-52 -translate-x-1/2 -translate-y-1/2 rounded-full border border-amber-400/25"
              initial={{ scale: 0.25, opacity: 0 }}
              animate={{ scale: [0.25, 1.35 + index * 0.2, 1.1 + index * 0.15], opacity: [0, 0.35, 0] }}
              transition={{
                duration: 2.2,
                delay: 0.15 + index * 0.22,
                ease: "easeOut",
                repeat: Infinity,
                repeatDelay: 0.5,
              }}
            />
          ))
        : null}

      <div className="connection-cinema__panel relative z-10 w-full max-w-2xl px-5 py-8 text-center md:px-10 md:py-10">
        <FrameCorners delay={0.2} />
        <ShimmerPass delay={0.85} />

        <motion.div
          initial={{ opacity: 0, scale: 0.75, y: 10 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          transition={{ type: "spring", stiffness: 280, damping: 20, delay: 0.15 }}
          className="connection-cinema__seal mx-auto mb-6 inline-flex items-center gap-2.5 rounded-full px-5 py-2.5"
        >
          <motion.span
            className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-gradient-to-br from-amber-300 to-orange-600 text-xs font-bold text-[#1a1208] shadow-[0_0_16px_rgba(251,191,36,0.55)]"
            animate={reduceMotion ? undefined : { scale: [1, 1.12, 1], rotate: [0, 6, -6, 0] }}
            transition={{ duration: 2.2, repeat: Infinity, ease: "easeInOut" }}
          >
            ✓
          </motion.span>
          <span className="typo-tech text-[0.62rem] font-semibold uppercase tracking-[0.28em] text-amber-50">
            {tag}
          </span>
        </motion.div>

        <MonoEyebrow label={eyebrow} delay={0.25} />

        <div className="overflow-hidden">
          <p className="sr-only">
            {title1} {title2}
          </p>
          <p
            className="font-[family-name:var(--font-stack-display)] text-[clamp(2.2rem,8.5vw,4rem)] font-bold uppercase leading-[0.92] tracking-[0.05em] text-white"
            aria-hidden
          >
            <StaggeredHeadline text={title1} delay={0.38} stagger={0.04} />
          </p>
        </div>

        <motion.div
          className="mx-auto my-4 h-px overflow-hidden"
          initial={{ width: 0, opacity: 0 }}
          animate={{ width: "min(15rem, 54vw)", opacity: 1 }}
          transition={{ duration: 0.8, delay: 0.9, ease: [0.22, 1, 0.36, 1] }}
        >
          <motion.div
            className="h-full w-full bg-gradient-to-r from-transparent via-amber-200 to-transparent"
            animate={{ opacity: [0.45, 1, 0.45] }}
            transition={{ duration: 2.6, repeat: Infinity, ease: "easeInOut" }}
          />
        </motion.div>

        <div className="overflow-hidden">
          <p
            className="bg-gradient-to-r from-amber-100 via-white to-amber-300 bg-clip-text font-[family-name:var(--font-stack-brand)] text-[clamp(2.35rem,9vw,4.35rem)] leading-[0.95] tracking-[-0.01em] text-transparent"
            aria-hidden
          >
            <StaggeredHeadline text={title2} delay={1} stagger={0.038} />
          </p>
        </div>

        <motion.p
          className="typo-body mx-auto mt-7 max-w-lg text-[clamp(0.98rem,3.5vw,1.14rem)] leading-relaxed text-amber-50/95"
          initial={{ opacity: 0, y: 18, filter: "blur(6px)" }}
          animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
          transition={{ duration: 0.7, delay: 1.45, ease: [0.22, 1, 0.36, 1] }}
        >
          {praise.lead}
        </motion.p>

        <div className="mt-5 flex flex-wrap justify-center gap-2">
          {praise.valueChips.map((chip, index) => (
            <motion.span
              key={chip}
              className="rounded-full border border-amber-400/30 bg-amber-500/12 px-3.5 py-1.5 text-xs font-medium capitalize tracking-wide text-amber-50/95 shadow-[inset_0_0_12px_rgba(245,158,11,0.08)]"
              initial={{ opacity: 0, scale: 0.65, y: 12 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              transition={{
                type: "spring",
                stiffness: 340,
                damping: 22,
                delay: 1.65 + index * 0.12,
              }}
            >
              {chip}
            </motion.span>
          ))}
        </div>

        <div className="mt-6 space-y-3">
          {praise.lines.map((line, index) => (
            <motion.p
              key={`${index}-${line.slice(0, 12)}`}
              className="typo-body mx-auto max-w-lg text-sm leading-relaxed text-zinc-300/95 md:text-[0.95rem]"
              initial={{ opacity: 0, x: index % 2 === 0 ? -22 : 22, filter: "blur(8px)" }}
              animate={{ opacity: 1, x: 0, filter: "blur(0px)" }}
              transition={{ duration: 0.68, delay: 1.9 + index * 0.26, ease: [0.22, 1, 0.36, 1] }}
            >
              {line}
            </motion.p>
          ))}
        </div>

        <AnimatePresence>
          {showControls ? (
            <motion.div
              initial={{ opacity: 0, y: 14 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 8 }}
              transition={{ duration: 0.55, ease: [0.22, 1, 0.36, 1] }}
              className="mt-10 space-y-4"
            >
              <motion.button
                type="button"
                onClick={handleButtonClick}
                disabled={!canDismiss}
                className={[
                  "group mx-auto inline-flex items-center justify-center gap-2 rounded-lg border px-8 py-3.5 text-sm font-bold uppercase tracking-[0.16em] text-white transition",
                  canDismiss
                    ? "border-amber-500/45 bg-gradient-to-r from-amber-700 to-orange-600 shadow-[0_0_36px_rgba(245,158,11,0.32)] hover:-translate-y-0.5 hover:shadow-[0_0_48px_rgba(245,158,11,0.45)]"
                    : "cursor-default border-white/15 bg-white/10 text-zinc-400",
                ].join(" ")}
              >
                {continueLabel}
                <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
              </motion.button>

              {canDismiss ? (
                <motion.p
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: 0.2, duration: 0.45 }}
                  className="typo-tech text-[0.68rem] uppercase tracking-[0.2em] text-zinc-500"
                >
                  {tapHint}
                </motion.p>
              ) : null}
            </motion.div>
          ) : null}
        </AnimatePresence>
      </div>
    </motion.div>
  );
}

function scrollToTop() {
  window.scrollTo({ top: 0, left: 0, behavior: "auto" });
}
