"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { ArrowRight, Check } from "lucide-react";
import { ConnectionManifestoHeadline } from "@/widgets/quote/ConnectionManifestoHeadline";
import type { ConnectionPraiseContent } from "@/shared/lib/connectionPraise";

const easeOut = [0.22, 1, 0.36, 1] as const;

/** Tiempo mínimo antes de permitir cerrar (lectura completa). */
const REWARD_MIN_READ_MS = 4800;
/** Botón e hint de continuar. */
const REWARD_CONTROLS_MS = 4200;

type QuoteConnectionRewardProps = {
  title1: string;
  title2: string;
  tag: string;
  continueLabel: string;
  tapHint: string;
  praise: ConnectionPraiseContent;
  onComplete: () => void;
};

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
        "connection-reward fixed inset-0 z-[80] flex items-center justify-center overflow-y-auto px-4 py-10 backdrop-blur-md",
        canDismiss ? "cursor-pointer" : "cursor-default",
      ].join(" ")}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0, filter: "blur(8px)" }}
      transition={{ duration: 0.55, ease: easeOut }}
      role="dialog"
      aria-live="polite"
      aria-label={`${title1} ${title2}`}
      onClick={handleOverlayClick}
    >
      <div className="connection-reward__ambient" aria-hidden>
        {!reduceMotion ? (
          <motion.span
            className="connection-reward__orb"
            animate={{ opacity: [0.28, 0.42, 0.28], scale: [1, 1.04, 1] }}
            transition={{ duration: 6, repeat: Infinity, ease: "easeInOut" }}
          />
        ) : null}
      </div>

      <div className="connection-reward__content relative z-10 w-full max-w-lg text-center">
        <motion.p
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.12, ease: easeOut }}
          className="connection-reward__tag"
        >
          <span className="connection-reward__tag-icon" aria-hidden>
            <Check className="h-3 w-3" strokeWidth={2.5} />
          </span>
          {tag}
        </motion.p>

        <div className="connection-reward__headline">
          <ConnectionManifestoHeadline line1={title1} line2={title2} size="reward" />
        </div>

        <motion.div
          className="connection-reward__message"
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.65, delay: 1.2, ease: easeOut }}
        >
          <p className="connection-reward__greeting">{praise.greeting}</p>
          <p className="connection-reward__subtitle">{praise.subtitle}</p>
        </motion.div>

        {praise.valueChips.length > 0 ? (
          <motion.div
            className="connection-reward__values"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 1.45, ease: easeOut }}
          >
            <p className="connection-reward__values-label">{praise.valuesLabel}</p>
            <div className="connection-reward__chips">
              {praise.valueChips.map((chip, index) => (
                <motion.span
                  key={chip}
                  className="connection-reward__chip"
                  initial={{ opacity: 0, scale: 0.92, y: 8 }}
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  transition={{
                    type: "spring",
                    stiffness: 280,
                    damping: 22,
                    delay: 1.55 + index * 0.08,
                  }}
                >
                  {chip}
                </motion.span>
              ))}
            </div>
          </motion.div>
        ) : null}

        {praise.insight ? (
          <motion.p
            className="connection-reward__insight"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.55, delay: 1.75, ease: easeOut }}
          >
            {praise.insight}
          </motion.p>
        ) : null}

        {praise.noteAck ? (
          <motion.p
            className="connection-reward__note"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.5, delay: 1.95, ease: easeOut }}
          >
            {praise.noteAck}
          </motion.p>
        ) : null}

        <AnimatePresence>
          {showControls ? (
            <motion.div
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 8 }}
              transition={{ duration: 0.5, ease: easeOut }}
              className="connection-reward__controls"
            >
              <motion.button
                type="button"
                onClick={handleButtonClick}
                disabled={!canDismiss}
                className={[
                  "connection-reward__cta group",
                  canDismiss ? "btn-accent focus-ring active:scale-[0.98]" : "connection-reward__cta--disabled",
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
                  className="connection-reward__tap-hint"
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
