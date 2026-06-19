"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { ArrowLeft } from "lucide-react";

type QuoteConnectionDeclineProps = {
  tag: string;
  title1: string;
  title2: string;
  lead: string;
  lines: string[];
  continueLabel: string;
  onComplete: () => void;
};

const easeOut = [0.22, 1, 0.36, 1] as const;

export function QuoteConnectionDecline({
  tag,
  title1,
  title2,
  lead,
  lines,
  continueLabel,
  onComplete,
}: QuoteConnectionDeclineProps) {
  const reduceMotion = useReducedMotion();
  const completedRef = useRef(false);
  const [canDismiss, setCanDismiss] = useState(Boolean(reduceMotion));

  const complete = useCallback(() => {
    if (completedRef.current || !canDismiss) return;
    completedRef.current = true;
    onComplete();
  }, [canDismiss, onComplete]);

  useEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: "auto" });
  }, []);

  useEffect(() => {
    if (reduceMotion) return;
    const timer = window.setTimeout(() => setCanDismiss(true), 3200);
    return () => window.clearTimeout(timer);
  }, [reduceMotion]);

  return (
    <motion.div
      className="fixed inset-0 z-[80] flex items-start justify-center overflow-y-auto overscroll-contain bg-background/94 px-4 py-[max(2.5rem,env(safe-area-inset-top))] backdrop-blur-md sm:items-center sm:py-10"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0, filter: "blur(8px)" }}
      transition={{ duration: 0.55, ease: easeOut }}
      role="dialog"
      aria-live="polite"
      aria-label={`${title1} ${title2}`}
    >
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_90%_70%_at_50%_42%,rgba(107,99,92,0.12),transparent_68%)]" />

      <div className="relative z-10 w-full max-w-xl text-center">
        <motion.p
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.08, ease: easeOut }}
          className="typo-tech mb-6 text-[0.68rem] uppercase tracking-[0.2em] text-zinc-500"
        >
          {tag}
        </motion.p>

        <motion.h2
          className="font-display text-[clamp(2.25rem,8vw,3.5rem)] uppercase leading-none tracking-tight text-zinc-100"
          initial={{ opacity: 0, y: 18 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.65, delay: 0.18, ease: easeOut }}
        >
          {title1}
          <span className="mt-1 block text-stone-400">{title2}</span>
        </motion.h2>

        <motion.p
          className="typo-body mx-auto mt-7 max-w-lg text-[clamp(0.95rem,3.6vw,1.1rem)] leading-relaxed text-stone-200/95"
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.45, ease: easeOut }}
        >
          {lead}
        </motion.p>

        <div className="mt-6 space-y-3">
          {lines.map((line, index) => (
            <motion.p
              key={`${index}-${line.slice(0, 12)}`}
              className="typo-body mx-auto max-w-lg text-sm leading-relaxed text-zinc-400 md:text-[0.95rem]"
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.55, delay: 0.65 + index * 0.22, ease: easeOut }}
            >
              {line}
            </motion.p>
          ))}
        </div>

        <motion.button
          type="button"
          onClick={complete}
          disabled={!canDismiss}
          className={[
            "group mx-auto mt-10 inline-flex items-center justify-center gap-2 rounded-lg border px-7 py-3.5 text-sm font-bold uppercase tracking-[0.16em] transition",
            canDismiss
              ? "btn-ghost-warm focus-ring active:scale-[0.98]"
              : "cursor-default border-white/15 bg-white/10 text-zinc-500",
          ].join(" ")}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.95, ease: easeOut }}
        >
          <ArrowLeft className="h-4 w-4 transition-transform group-hover:-translate-x-1" />
          {continueLabel}
        </motion.button>
      </div>
    </motion.div>
  );
}
