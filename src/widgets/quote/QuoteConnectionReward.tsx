"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { ArrowRight, Sparkles } from "lucide-react";
import type { ConnectionPraiseContent } from "@/shared/lib/connectionPraise";

/** Tiempo mínimo antes de permitir cerrar (todas las líneas visibles + lectura). */
const REWARD_MIN_READ_MS = 5200;
/** Botón e hint de continuar. */
const REWARD_CONTROLS_MS = 4600;

type QuoteConnectionRewardProps = {
  title1: string;
  title2: string;
  tag: string;
  continueLabel: string;
  tapHint: string;
  praise: ConnectionPraiseContent;
  onComplete: () => void;
};

const BURST_PARTICLES = Array.from({ length: 28 }, (_, index) => ({
  id: index,
  angle: (index / 28) * Math.PI * 2 + (index % 3) * 0.12,
  distance: 72 + (index % 6) * 22,
  size: 3 + (index % 4) * 2,
  delay: (index % 7) * 0.035,
}));

const FLOAT_PARTICLES = Array.from({ length: 14 }, (_, index) => ({
  id: index,
  left: 8 + ((index * 17) % 84),
  top: 12 + ((index * 23) % 76),
  delay: index * 0.12,
  duration: 2.4 + (index % 4) * 0.35,
}));

export function QuoteConnectionReward({
  title1,
  title2,
  tag,
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

  const rings = useMemo(
    () => [
      { delay: 0.1, scale: 1.15, opacity: 0.35 },
      { delay: 0.22, scale: 1.35, opacity: 0.22 },
      { delay: 0.34, scale: 1.55, opacity: 0.12 },
    ],
    [],
  );

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
        "fixed inset-0 z-[80] flex items-center justify-center overflow-hidden bg-[#050403]/92 px-4 py-10 backdrop-blur-md",
        canDismiss ? "cursor-pointer" : "cursor-default",
      ].join(" ")}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0, filter: "blur(8px)" }}
      transition={{ duration: 0.55, ease: [0.22, 1, 0.36, 1] }}
      role="dialog"
      aria-live="polite"
      aria-label={`${title1} ${title2}`}
      onClick={handleOverlayClick}
    >
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_90%_70%_at_50%_42%,rgba(245,158,11,0.28),transparent_68%)]" />
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_50%,rgba(251,191,36,0.12),transparent_55%)]" />

      {!reduceMotion
        ? rings.map((ring, index) => (
            <motion.span
              key={index}
              className="pointer-events-none absolute left-1/2 top-[42%] h-48 w-48 -translate-x-1/2 -translate-y-1/2 rounded-full border border-amber-400/30"
              initial={{ scale: 0.2, opacity: 0 }}
              animate={{ scale: ring.scale, opacity: [0, ring.opacity, 0] }}
              transition={{
                duration: 1.8,
                delay: ring.delay,
                ease: "easeOut",
                repeat: Infinity,
                repeatDelay: 0.35,
              }}
            />
          ))
        : null}

      {!reduceMotion
        ? BURST_PARTICLES.map((particle) => (
            <motion.span
              key={particle.id}
              className="pointer-events-none absolute left-1/2 top-[42%] rounded-full bg-gradient-to-br from-amber-200 to-orange-500 shadow-[0_0_12px_rgba(245,158,11,0.65)]"
              style={{ width: particle.size, height: particle.size }}
              initial={{ x: 0, y: 0, opacity: 0, scale: 0 }}
              animate={{
                x: Math.cos(particle.angle) * particle.distance,
                y: Math.sin(particle.angle) * particle.distance,
                opacity: [0, 1, 0],
                scale: [0, 1.2, 0.4],
              }}
              transition={{
                duration: 1.35,
                delay: 0.45 + particle.delay,
                ease: [0.22, 1, 0.36, 1],
                repeat: Infinity,
                repeatDelay: 1.1,
              }}
            />
          ))
        : null}

      {!reduceMotion
        ? FLOAT_PARTICLES.map((particle) => (
            <motion.span
              key={`float-${particle.id}`}
              className="pointer-events-none absolute text-amber-300/50"
              style={{ left: `${particle.left}%`, top: `${particle.top}%` }}
              initial={{ opacity: 0, scale: 0.5, rotate: 0 }}
              animate={{
                opacity: [0, 0.85, 0],
                scale: [0.5, 1, 0.7],
                rotate: [0, 180, 360],
                y: [0, -18, 0],
              }}
              transition={{
                duration: particle.duration,
                delay: 0.6 + particle.delay,
                ease: "easeInOut",
                repeat: Infinity,
              }}
            >
              <Sparkles className="h-3.5 w-3.5" />
            </motion.span>
          ))
        : null}

      <div className="relative z-10 w-full max-w-xl text-center">
        <motion.div
          initial={{ opacity: 0, scale: 0.6, y: 12 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          transition={{ type: "spring", stiffness: 260, damping: 18, delay: 0.2 }}
          className="mx-auto mb-6 inline-flex items-center gap-2 rounded-full border border-amber-400/35 bg-amber-500/15 px-4 py-2 text-xs font-semibold uppercase tracking-[0.18em] text-amber-100"
        >
          <motion.span
            className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-gradient-to-br from-amber-400 to-orange-600 text-[#1a1208]"
            animate={reduceMotion ? undefined : { rotate: [0, 8, -8, 0], scale: [1, 1.08, 1] }}
            transition={{ duration: 1.6, repeat: Infinity, ease: "easeInOut" }}
          >
            ✓
          </motion.span>
          {tag}
        </motion.div>

        <div className="overflow-hidden">
          <motion.p
            className="typo-section text-[clamp(2.2rem,8vw,3.6rem)] font-semibold leading-[0.98] tracking-[-0.03em] text-white"
            initial={{ opacity: 0, y: "120%", filter: "blur(12px)" }}
            animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
            transition={{ duration: 0.85, delay: 0.35, ease: [0.22, 1, 0.36, 1] }}
          >
            {title1}
          </motion.p>
        </div>

        <motion.div
          className="mx-auto my-4 h-px overflow-hidden"
          initial={{ width: 0, opacity: 0 }}
          animate={{ width: "min(14rem, 48vw)", opacity: 1 }}
          transition={{ duration: 0.75, delay: 0.75, ease: [0.22, 1, 0.36, 1] }}
        >
          <div className="h-full w-full bg-gradient-to-r from-amber-600/10 via-amber-300 to-amber-600/10" />
        </motion.div>

        <div className="overflow-hidden">
          <motion.p
            className="typo-section bg-gradient-to-r from-amber-100 via-white to-amber-200 bg-clip-text text-[clamp(2.2rem,8vw,3.6rem)] font-semibold leading-[0.98] tracking-[-0.03em] text-transparent"
            initial={{ opacity: 0, y: "100%", filter: "blur(14px)" }}
            animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
            transition={{ duration: 0.9, delay: 0.95, ease: [0.22, 1, 0.36, 1] }}
          >
            {title2}
          </motion.p>
        </div>

        <motion.p
          className="typo-body mx-auto mt-7 max-w-lg text-[clamp(0.95rem,3.6vw,1.12rem)] leading-relaxed text-amber-50/95"
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.65, delay: 1.35 }}
        >
          {praise.lead}
        </motion.p>

        <div className="mt-5 flex flex-wrap justify-center gap-2">
          {praise.valueChips.map((chip, index) => (
            <motion.span
              key={chip}
              className="rounded-full border border-amber-400/25 bg-amber-500/10 px-3 py-1 text-xs font-medium capitalize text-amber-100/90"
              initial={{ opacity: 0, scale: 0.7, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              transition={{
                type: "spring",
                stiffness: 320,
                damping: 20,
                delay: 1.55 + index * 0.14,
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
              initial={{ opacity: 0, x: index % 2 === 0 ? -18 : 18, filter: "blur(6px)" }}
              animate={{ opacity: 1, x: 0, filter: "blur(0px)" }}
              transition={{ duration: 0.65, delay: 1.85 + index * 0.28, ease: [0.22, 1, 0.36, 1] }}
            >
              {line}
            </motion.p>
          ))}
        </div>

        <AnimatePresence>
          {showControls ? (
            <motion.div
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 8 }}
              transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
              className="mt-10 space-y-4"
            >
              <motion.button
                type="button"
                onClick={handleButtonClick}
                disabled={!canDismiss}
                className={[
                  "group mx-auto inline-flex items-center justify-center gap-2 rounded-lg border px-7 py-3.5 text-sm font-bold uppercase tracking-[0.16em] text-white transition",
                  canDismiss
                    ? "border-amber-500/40 bg-gradient-to-r from-amber-700 to-orange-600 shadow-[0_0_32px_rgba(245,158,11,0.28)] hover:-translate-y-0.5 hover:shadow-[0_0_40px_rgba(245,158,11,0.42)]"
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
