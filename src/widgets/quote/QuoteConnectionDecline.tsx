"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useReducedMotion } from "framer-motion";
import { useGSAP } from "@gsap/react";
import { ArrowLeft } from "lucide-react";
import { ConnectionCta } from "@/widgets/quote/ConnectionCta";
import { ConnectionRule, ConnectionCorners } from "@/widgets/quote/ConnectionMarks";
import {
  CONNECTION_EASE,
  CONNECTION_TIMING,
  gsap,
  registerConnectionMotion,
  SplitText,
  whenFontsReady,
} from "@/shared/lib/connectionMotion";

registerConnectionMotion();

type QuoteConnectionDeclineProps = {
  tag: string;
  title1: string;
  title2: string;
  lead: string;
  lines: string[];
  continueLabel: string;
  onComplete: () => void;
};

/** Cierre digno: mismo tempo que Intro/Reward, temperatura alineada al mask cafe–honey. */
const DECLINE_DISMISS_MS = CONNECTION_TIMING.declineDismissMs;
const DECLINE_CONTROLS_MS = CONNECTION_TIMING.declineControlsMs;

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
  const rootRef = useRef<HTMLDivElement>(null);
  const completedRef = useRef(false);
  const [mounted, setMounted] = useState(false);
  const [canDismiss, setCanDismiss] = useState(Boolean(reduceMotion));
  const [showControls, setShowControls] = useState(Boolean(reduceMotion));

  useLayoutEffect(() => {
    setMounted(true);
  }, []);

  const complete = useCallback(
    (event?: React.MouseEvent<HTMLButtonElement>) => {
      event?.stopPropagation();
      if (completedRef.current || !canDismiss) return;
      completedRef.current = true;
      onComplete();
    },
    [canDismiss, onComplete],
  );

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
    const dismissTimer = window.setTimeout(() => setCanDismiss(true), DECLINE_DISMISS_MS);
    const controlsTimer = window.setTimeout(() => setShowControls(true), DECLINE_CONTROLS_MS);
    return () => {
      window.clearTimeout(dismissTimer);
      window.clearTimeout(controlsTimer);
    };
  }, [reduceMotion]);

  useGSAP(
    () => {
      if (!mounted) return;
      const root = rootRef.current;
      if (!root) return;

      if (reduceMotion) {
        gsap.set(
          [
            ".connection-decline__veil",
            ".connection-decline__orb",
            ".connection-decline__tag",
            ".connection-decline__title",
            ".connection-decline__lead",
            ".connection-decline__line",
            ".connection-decline__rail",
            ".connection-decline__index",
          ],
          { clearProps: "all", opacity: 1, y: 0 },
        );
        return;
      }

      let cancelled = false;
      const splits: SplitText[] = [];
      let tl: gsap.core.Timeline | null = null;

      const run = async () => {
        await whenFontsReady();
        if (cancelled || !rootRef.current) return;

        const titleA = root.querySelector<HTMLElement>(".connection-decline__title--a");
        const titleB = root.querySelector<HTMLElement>(".connection-decline__title--b");
        const leadEl = root.querySelector<HTMLElement>(".connection-decline__lead");
        const rule = root.querySelector<SVGLineElement>(".connection-rule--decline line");
        const corners = gsap.utils.toArray<SVGPathElement>(
          root.querySelectorAll(".connection-corner__path"),
        );

        const titleSplits: SplitText[] = [];
        [titleA, titleB].forEach((el) => {
          if (!el) return;
          const split = SplitText.create(el, {
            type: "chars,words",
            mask: "chars",
            smartWrap: true,
          });
          titleSplits.push(split);
          splits.push(split);
          gsap.set(el, { opacity: 1 });
          gsap.set(split.chars, { yPercent: 110, opacity: 0 });
        });

        let leadSplit: SplitText | null = null;
        if (leadEl) {
          leadSplit = SplitText.create(leadEl, { type: "words", mask: "words" });
          splits.push(leadSplit);
          gsap.set(leadEl, { opacity: 1 });
          gsap.set(leadSplit.words, { yPercent: 108, opacity: 0 });
        }

        if (rule) gsap.set(rule, { drawSVG: "50% 50%", opacity: 1 });
        gsap.set(corners, { drawSVG: "0%", opacity: 1 });

        tl = gsap.timeline({ defaults: { ease: CONNECTION_EASE.hero } });

        tl.fromTo(
          ".connection-decline__veil",
          { opacity: 0 },
          { opacity: 1, duration: 0.75, ease: CONNECTION_EASE.soft },
          0,
        )
          .fromTo(
            ".connection-decline__orb",
            { opacity: 0, scale: 0.92 },
            { opacity: 1, scale: 1, duration: 1.25, ease: CONNECTION_EASE.soft },
            0.05,
          )
          .fromTo(
            ".connection-decline__rail",
            { scaleY: 0, opacity: 0 },
            {
              scaleY: 1,
              opacity: 1,
              duration: 0.8,
              ease: CONNECTION_EASE.hero,
              transformOrigin: "top center",
            },
            0.15,
          )
          .fromTo(
            ".connection-decline__index",
            { opacity: 0, y: 8 },
            { opacity: 1, y: 0, duration: 0.5 },
            0.22,
          )
          .fromTo(
            ".connection-decline__tag",
            { opacity: 0, y: 10, letterSpacing: "0.32em" },
            {
              opacity: 1,
              y: 0,
              letterSpacing: "0.2em",
              duration: 0.65,
            },
            0.28,
          )
          .to(
            corners,
            { drawSVG: "100%", duration: 0.7, stagger: 0.12, ease: CONNECTION_EASE.hero },
            0.35,
          );

        if (titleSplits[0]?.chars.length) {
          tl.to(
            titleSplits[0].chars,
            { yPercent: 0, opacity: 1, duration: 0.9, stagger: 0.026, force3D: true },
            0.4,
          );
        }

        if (rule) {
          tl.to(rule, { drawSVG: "0% 100%", duration: 0.6 }, "-=0.3");
        }

        if (titleSplits[1]?.chars.length) {
          tl.to(
            titleSplits[1].chars,
            { yPercent: 0, opacity: 1, duration: 0.9, stagger: 0.024, force3D: true },
            "-=0.35",
          );
        }

        if (leadSplit?.words.length) {
          tl.to(
            leadSplit.words,
            { yPercent: 0, opacity: 1, duration: 0.72, stagger: 0.03, force3D: true },
            "-=0.2",
          );
        }

        tl.fromTo(
          ".connection-decline__line",
          { opacity: 0, y: 12 },
          { opacity: 1, y: 0, duration: 0.6, stagger: 0.18 },
          "-=0.15",
        );

        tl.timeScale(CONNECTION_TIMING.playbackScale);
      };

      void run();

      return () => {
        cancelled = true;
        tl?.kill();
        splits.forEach((split) => split.revert());
      };
    },
    { scope: rootRef, dependencies: [mounted, reduceMotion, title1, title2, lead] },
  );

  useGSAP(
    () => {
      if (!mounted || !showControls || reduceMotion) return;
      gsap.fromTo(
        ".connection-decline__controls",
        { opacity: 0, y: 14 },
        { opacity: 1, y: 0, duration: 0.6, ease: CONNECTION_EASE.hero },
      );
    },
    { scope: rootRef, dependencies: [mounted, showControls, reduceMotion] },
  );

  if (!mounted) return null;

  return createPortal(
    <div
      ref={rootRef}
      className="connection-decline fixed inset-0 z-[120] flex items-stretch justify-center"
      role="dialog"
      aria-modal="true"
      aria-live="polite"
      aria-label={`${title1} ${title2}`}
      data-connection-decline="open"
    >
      <div className="connection-decline__veil" aria-hidden />
      <div className="connection-decline__grain" aria-hidden />

      <div className="connection-decline__ambient" aria-hidden>
        <span className="connection-decline__orb" />
      </div>

      <div className="connection-decline__scroll">
        <div className="connection-decline__panel">
          <aside className="connection-decline__rail" aria-hidden />

          <div className="connection-decline__body">
            <div className="connection-decline__kicker">
              <span className="connection-decline__index" aria-hidden>
                —
              </span>
              <p className="connection-decline__tag">{tag}</p>
            </div>

            <div className="connection-decline__headline connection-manifesto connection-manifesto--start">
              <div className="connection-manifesto__stage">
                <ConnectionCorners tone="cool" />

                <h2 className="connection-manifesto__title" aria-label={`${title1} ${title2}`}>
                  <span className="connection-manifesto__line connection-decline__title connection-decline__title--a">
                    {title1}
                  </span>
                  <span className="connection-manifesto__divider" aria-hidden>
                    <ConnectionRule variant="decline" tone="cool" />
                  </span>
                  <span className="connection-manifesto__line connection-manifesto__line--soft connection-decline__title connection-decline__title--b">
                    {title2}
                  </span>
                </h2>
              </div>
            </div>

            <div className="connection-decline__message">
              <p className="connection-decline__lead">{lead}</p>

              <div className="connection-decline__lines">
                {lines.map((line, index) => (
                  <p
                    key={`${index}-${line.slice(0, 12)}`}
                    className="connection-decline__line"
                  >
                    <span className="connection-decline__line-num" aria-hidden>
                      {String(index + 1).padStart(2, "0")}
                    </span>
                    <span className="connection-decline__line-text">{line}</span>
                  </p>
                ))}
              </div>
            </div>

            {showControls ? (
              <div className="connection-decline__controls">
                <ConnectionCta
                  tone="ghost"
                  label={continueLabel}
                  onClick={complete}
                  disabled={!canDismiss}
                  icon={<ArrowLeft className="h-4 w-4" />}
                  iconSide="leading"
                />
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
