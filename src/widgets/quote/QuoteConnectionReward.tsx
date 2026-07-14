"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useReducedMotion } from "framer-motion";
import gsap from "gsap";
import { useGSAP } from "@gsap/react";
import { ArrowRight, Check } from "lucide-react";
import type { ConnectionPraiseContent } from "@/shared/lib/connectionPraise";

gsap.registerPlugin(useGSAP);

/** Tiempo mínimo de lectura antes de permitir cerrar. */
const REWARD_MIN_READ_MS = 5200;
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

function splitWords(text: string) {
  return text.split(/\s+/).filter(Boolean);
}

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
  const rootRef = useRef<HTMLDivElement>(null);
  const [canDismiss, setCanDismiss] = useState(Boolean(reduceMotion));
  const [showControls, setShowControls] = useState(Boolean(reduceMotion));
  const completedRef = useRef(false);

  const words1 = splitWords(title1);
  const words2 = splitWords(title2);

  const complete = useCallback(() => {
    if (completedRef.current || !canDismiss) return;
    completedRef.current = true;
    onComplete();
  }, [canDismiss, onComplete]);

  useEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: "auto" });
  }, []);

  useEffect(() => {
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
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

  useGSAP(
    () => {
      const root = rootRef.current;
      if (!root) return;

      if (reduceMotion) {
        gsap.set(
          [
            ".connection-reward__veil",
            ".connection-reward__orb",
            ".connection-reward__tag",
            ".connection-reward__word",
            ".connection-reward__rule",
            ".connection-reward__corner",
            ".connection-reward__greeting",
            ".connection-reward__subtitle",
            ".connection-reward__values",
            ".connection-reward__chip",
            ".connection-reward__insight",
            ".connection-reward__resonance",
            ".connection-reward__note",
          ],
          { clearProps: "all", opacity: 1, y: 0, scale: 1 },
        );
        return;
      }

      const tl = gsap.timeline({ defaults: { ease: "power3.out" } });

      tl.fromTo(
        ".connection-reward__veil",
        { opacity: 0 },
        { opacity: 1, duration: 0.7 },
        0,
      )
        .fromTo(
          ".connection-reward__orb",
          { opacity: 0, scale: 0.82 },
          { opacity: 1, scale: 1, duration: 1.35, ease: "power2.out" },
          0.08,
        )
        .fromTo(
          ".connection-reward__tag",
          { opacity: 0, y: 14, filter: "blur(8px)" },
          { opacity: 1, y: 0, filter: "blur(0px)", duration: 0.7 },
          0.28,
        )
        .fromTo(
          ".connection-reward__corner",
          { opacity: 0, scale: 0.7 },
          { opacity: 1, scale: 1, duration: 0.75, stagger: 0.08 },
          0.42,
        )
        .fromTo(
          ".connection-reward__word--a",
          { opacity: 0, yPercent: 110 },
          { opacity: 1, yPercent: 0, duration: 0.85, stagger: 0.07, ease: "power4.out" },
          0.55,
        )
        .fromTo(
          ".connection-reward__rule",
          { scaleX: 0, opacity: 0 },
          { scaleX: 1, opacity: 1, duration: 0.65, transformOrigin: "center" },
          "-=0.35",
        )
        .fromTo(
          ".connection-reward__word--b",
          { opacity: 0, yPercent: 110 },
          { opacity: 1, yPercent: 0, duration: 0.85, stagger: 0.07, ease: "power4.out" },
          "-=0.2",
        )
        .fromTo(
          ".connection-reward__greeting",
          { opacity: 0, y: 18 },
          { opacity: 1, y: 0, duration: 0.75 },
          "-=0.15",
        )
        .fromTo(
          ".connection-reward__subtitle",
          { opacity: 0, y: 12 },
          { opacity: 1, y: 0, duration: 0.65 },
          "-=0.4",
        )
        .fromTo(
          ".connection-reward__values",
          { opacity: 0, y: 14 },
          { opacity: 1, y: 0, duration: 0.6 },
          "-=0.25",
        )
        .fromTo(
          ".connection-reward__chip",
          { opacity: 0, y: 10, scale: 0.94 },
          {
            opacity: 1,
            y: 0,
            scale: 1,
            duration: 0.5,
            stagger: 0.07,
            ease: "back.out(1.4)",
          },
          "-=0.35",
        )
        .fromTo(
          ".connection-reward__insight",
          { opacity: 0, y: 16 },
          { opacity: 1, y: 0, duration: 0.75 },
          "-=0.15",
        )
        .fromTo(
          ".connection-reward__resonance",
          { opacity: 0, y: 12 },
          { opacity: 1, y: 0, duration: 0.7 },
          "-=0.4",
        )
        .fromTo(
          ".connection-reward__note",
          { opacity: 0, y: 8 },
          { opacity: 1, y: 0, duration: 0.55 },
          "-=0.35",
        );

      gsap.to(".connection-reward__orb", {
        scale: 1.06,
        opacity: 0.9,
        duration: 5.5,
        yoyo: true,
        repeat: -1,
        ease: "sine.inOut",
        delay: 1.4,
      });
    },
    { scope: rootRef, dependencies: [reduceMotion, praise.insight] },
  );

  useGSAP(
    () => {
      if (!showControls || reduceMotion) return;
      gsap.fromTo(
        ".connection-reward__controls",
        { opacity: 0, y: 16 },
        { opacity: 1, y: 0, duration: 0.65, ease: "power3.out" },
      );
    },
    { scope: rootRef, dependencies: [showControls, reduceMotion] },
  );

  const handleOverlayClick = () => {
    complete();
  };

  const handleButtonClick = (event: React.MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation();
    complete();
  };

  return (
    <div
      ref={rootRef}
      className={[
        "connection-reward fixed inset-0 z-[80] flex items-stretch justify-center",
        canDismiss ? "cursor-pointer" : "cursor-default",
      ].join(" ")}
      role="dialog"
      aria-live="polite"
      aria-label={`${title1} ${title2}`}
      onClick={handleOverlayClick}
    >
      <div className="connection-reward__veil" aria-hidden />

      <div className="connection-reward__ambient" aria-hidden>
        <span className="connection-reward__orb" />
      </div>

      <div className="connection-reward__scroll">
        <div
          className="connection-reward__panel"
          onClick={(event) => event.stopPropagation()}
        >
          <p className="connection-reward__tag">
            <span className="connection-reward__tag-icon" aria-hidden>
              <Check className="h-3 w-3" strokeWidth={2.5} />
            </span>
            {tag}
          </p>

          <div className="connection-reward__headline connection-manifesto connection-manifesto--reward">
            <div className="connection-manifesto__stage">
              <span
                className="connection-reward__corner connection-manifesto__corner connection-manifesto__corner--tl"
                aria-hidden
              />
              <span
                className="connection-reward__corner connection-manifesto__corner connection-manifesto__corner--br"
                aria-hidden
              />

              <h2
                className="connection-manifesto__lines"
                aria-label={`${title1} ${title2}`}
              >
                <div className="connection-manifesto__line-wrap">
                  {words1.map((word, index) => (
                    <span
                      key={`a-${word}-${index}`}
                      className="connection-manifesto__word-mask"
                    >
                      <span className="connection-reward__word connection-reward__word--a connection-manifesto__word">
                        {word}
                      </span>
                    </span>
                  ))}
                </div>

                <div
                  className="connection-reward__rule connection-manifesto__rule"
                  aria-hidden
                />

                <div className="connection-manifesto__line-wrap">
                  {words2.map((word, index) => (
                    <span
                      key={`b-${word}-${index}`}
                      className="connection-manifesto__word-mask"
                    >
                      <span className="connection-reward__word connection-reward__word--b connection-manifesto__word">
                        {word}
                      </span>
                    </span>
                  ))}
                </div>
              </h2>
            </div>
          </div>

          <div className="connection-reward__message">
            <p className="connection-reward__greeting">{praise.greeting}</p>
            <p className="connection-reward__subtitle">{praise.subtitle}</p>
          </div>

          {praise.valueChips.length > 0 ? (
            <div className="connection-reward__values">
              <p className="connection-reward__values-label">{praise.valuesLabel}</p>
              <div className="connection-reward__chips">
                {praise.valueChips.map((chip) => (
                  <span key={chip} className="connection-reward__chip">
                    {chip}
                  </span>
                ))}
              </div>
            </div>
          ) : null}

          {praise.insight ? (
            <p className="connection-reward__insight">{praise.insight}</p>
          ) : null}

          {praise.resonance ? (
            <p className="connection-reward__resonance">{praise.resonance}</p>
          ) : null}

          {praise.noteAck ? (
            <p className="connection-reward__note">{praise.noteAck}</p>
          ) : null}

          {showControls ? (
            <div className="connection-reward__controls">
              <button
                type="button"
                onClick={handleButtonClick}
                disabled={!canDismiss}
                className={[
                  "connection-reward__cta group",
                  canDismiss
                    ? "btn-accent focus-ring active:scale-[0.98]"
                    : "connection-reward__cta--disabled",
                ].join(" ")}
              >
                {continueLabel}
                <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
              </button>

              {canDismiss ? (
                <p className="connection-reward__tap-hint">{tapHint}</p>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
