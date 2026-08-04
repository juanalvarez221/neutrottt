"use client";

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import { useReducedMotion } from "framer-motion";
import { ArrowRight } from "lucide-react";
import type { ConnectionPraiseContent } from "@/shared/lib/connectionPraise";
import { ConnectionCta } from "@/widgets/quote/ConnectionCta";
import { ConnectionRule } from "@/widgets/quote/ConnectionMarks";
import {
  CONNECTION_EASE,
  CONNECTION_TIMING,
  gsap,
  registerConnectionMotion,
  SplitText,
  whenFontsReady,
} from "@/shared/lib/connectionMotion";

registerConnectionMotion();

const REWARD_BASE_READ_MS = CONNECTION_TIMING.rewardBaseReadMs;
const REWARD_BASE_CONTROLS_MS = CONNECTION_TIMING.rewardBaseControlsMs;
const REWARD_PER_BLOCK_MS = CONNECTION_TIMING.rewardPerBlockMs;

type QuoteConnectionRewardProps = {
  title1: string;
  title2: string;
  tag: string;
  continueLabel: string;
  tapHint: string;
  praise: ConnectionPraiseContent;
  onComplete: () => void;
};

function revealAll(root: HTMLElement) {
  gsap.set(
    root.querySelectorAll(
      [
        ".connection-reward__tag",
        ".connection-reward__title-a",
        ".connection-reward__title-b",
        ".connection-reward__greeting",
        ".connection-reward__subtitle",
        ".connection-reward__values-label",
        ".connection-reward__value-block",
        ".connection-reward__insight",
        ".connection-reward__note",
        ".connection-reward__stage",
        ".connection-reward__footer",
      ].join(", "),
    ),
    { clearProps: "transform,opacity", opacity: 1, y: 0, yPercent: 0, scale: 1 },
  );
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
  const [portalReady, setPortalReady] = useState(false);
  const [canDismiss, setCanDismiss] = useState(Boolean(reduceMotion));
  const [showControls, setShowControls] = useState(Boolean(reduceMotion));
  const completedRef = useRef(false);

  useLayoutEffect(() => {
    setPortalReady(true);
  }, []);

  const valueBlocks = praise.valueBlocks;
  const valueBlocksKey = useMemo(
    () => valueBlocks.map((block) => `${block.value}:${block.text}`).join("|"),
    [valueBlocks],
  );
  const extraMs = Math.max(0, valueBlocks.length - 1) * REWARD_PER_BLOCK_MS;
  const minReadMs = REWARD_BASE_READ_MS + extraMs;
  const controlsMs = REWARD_BASE_CONTROLS_MS + Math.min(extraMs, 900);

  const complete = useCallback(() => {
    if (completedRef.current || !canDismiss) return;
    completedRef.current = true;
    onComplete();
  }, [canDismiss, onComplete]);

  useLayoutEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: "auto" });
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, []);

  useEffect(() => {
    if (reduceMotion) {
      setCanDismiss(true);
      setShowControls(true);
      return;
    }
    const readTimer = window.setTimeout(() => setCanDismiss(true), minReadMs);
    const controlsTimer = window.setTimeout(() => setShowControls(true), controlsMs);
    return () => {
      window.clearTimeout(readTimer);
      window.clearTimeout(controlsTimer);
    };
  }, [reduceMotion, minReadMs, controlsMs]);

  /* Portal + GSAP: run only after the dialog is in document.body and ref is live. */
  useLayoutEffect(() => {
    if (!portalReady) return;

    let cancelled = false;
    let tl: gsap.core.Timeline | null = null;
    const splits: InstanceType<typeof SplitText>[] = [];
    let failsafe = 0;
    let raf = 0;

    const start = () => {
      const root = rootRef.current;
      if (!root) {
        raf = window.requestAnimationFrame(start);
        return;
      }

      if (reduceMotion) {
        revealAll(root);
        return;
      }

      const run = async () => {
        await whenFontsReady();
        if (cancelled || !rootRef.current) return;

        await new Promise<void>((resolve) => {
          requestAnimationFrame(() => resolve());
        });
        if (cancelled || !rootRef.current) return;

        const q = <T extends Element>(sel: string) => root.querySelector<T>(sel);
        const rule = q<SVGLineElement>(".connection-rule--reward line");
        const titleA = q<HTMLElement>(".connection-reward__title-a");
        const titleB = q<HTMLElement>(".connection-reward__title-b");
        const tagEl = q<HTMLElement>(".connection-reward__tag");
        const greetingEl = q<HTMLElement>(".connection-reward__greeting");
        const subtitleEl = q<HTMLElement>(".connection-reward__subtitle");
        const valuesLabel = q<HTMLElement>(".connection-reward__values-label");
        const blocks = gsap.utils.toArray<HTMLElement>(
          root.querySelectorAll(".connection-reward__value-block"),
        );
        const insightEl = q<HTMLElement>(".connection-reward__insight");
        const noteEl = q<HTMLElement>(".connection-reward__note");
        const stage = q<HTMLElement>(".connection-reward__stage");

        gsap.set(
          [tagEl, greetingEl, subtitleEl, valuesLabel, ...blocks, insightEl, noteEl, stage].filter(
            Boolean,
          ),
          { opacity: 0 },
        );
        if (stage) gsap.set(stage, { y: 16, willChange: "transform" });
        if (titleA) gsap.set(titleA, { opacity: 0 });
        if (titleB) gsap.set(titleB, { opacity: 0 });
        if (rule) gsap.set(rule, { drawSVG: "50% 50%", opacity: 1 });

        let splitA: InstanceType<typeof SplitText> | null = null;
        let splitB: InstanceType<typeof SplitText> | null = null;
        let greetingSplit: InstanceType<typeof SplitText> | null = null;

        try {
          if (titleA) {
            splitA = SplitText.create(titleA, {
              type: "chars,words",
              mask: "chars",
              smartWrap: true,
            });
            splits.push(splitA);
            gsap.set(titleA, { opacity: 1 });
            gsap.set(splitA.chars, { yPercent: 115, opacity: 0 });
          }
          if (titleB) {
            splitB = SplitText.create(titleB, {
              type: "words",
              mask: "words",
            });
            splits.push(splitB);
            gsap.set(titleB, { opacity: 1 });
            gsap.set(splitB.words, {
              yPercent: 110,
              opacity: 0,
              scale: 0.94,
              transformOrigin: "left center",
            });
          }
          if (greetingEl) {
            greetingSplit = SplitText.create(greetingEl, {
              type: "words",
              mask: "words",
            });
            splits.push(greetingSplit);
            gsap.set(greetingEl, { opacity: 1 });
            gsap.set(greetingSplit.words, { yPercent: 100, opacity: 0 });
          }
        } catch {
          if (titleA) gsap.set(titleA, { opacity: 0, y: 12 });
          if (titleB) gsap.set(titleB, { opacity: 0, y: 10 });
          if (greetingEl) gsap.set(greetingEl, { opacity: 0, y: 8 });
        }

        tl = gsap.timeline({
          defaults: { ease: CONNECTION_EASE.hero },
          onComplete: () => {
            if (stage) gsap.set(stage, { willChange: "auto" });
          },
        });

        if (cancelled) {
          tl.kill();
          return;
        }

        if (stage) {
          tl.to(stage, { opacity: 1, y: 0, duration: 0.55 }, 0);
        }

        if (tagEl) {
          gsap.set(tagEl, { textContent: tag, opacity: 0, letterSpacing: "0.42em" });
          tl.fromTo(
            tagEl,
            { opacity: 0, letterSpacing: "0.42em" },
            {
              opacity: 1,
              letterSpacing: "0.22em",
              duration: 0.55,
              scrambleText: {
                text: tag,
                chars: "upperCase",
                speed: 0.68,
                revealDelay: 0.05,
              },
              ease: CONNECTION_EASE.snap,
            },
            0.05,
          );
        }

        tl.addLabel("title", 0.26);

        if (splitA?.chars?.length) {
          tl.to(
            splitA.chars,
            {
              yPercent: 0,
              opacity: 1,
              duration: 0.55,
              stagger: 0.018,
              force3D: true,
            },
            "title",
          );
        } else if (titleA) {
          tl.to(titleA, { opacity: 1, y: 0, duration: 0.45 }, "title");
        }

        if (rule) {
          tl.to(rule, { drawSVG: "0% 100%", duration: 0.4 }, "title+=0.24");
        }

        if (splitB?.words?.length) {
          tl.to(
            splitB.words,
            {
              yPercent: 0,
              opacity: 1,
              scale: 1,
              duration: 0.5,
              stagger: 0.055,
              force3D: true,
            },
            "title+=0.28",
          );
        } else if (titleB) {
          tl.to(titleB, { opacity: 1, y: 0, duration: 0.4 }, "title+=0.28");
        }

        if (greetingSplit?.words?.length) {
          tl.to(
            greetingSplit.words,
            {
              yPercent: 0,
              opacity: 1,
              duration: 0.4,
              stagger: 0.02,
            },
            "title+=0.6",
          );
        } else if (greetingEl) {
          tl.to(greetingEl, { opacity: 1, y: 0, duration: 0.35 }, "title+=0.6");
        }

        if (subtitleEl) {
          tl.fromTo(
            subtitleEl,
            { opacity: 0, y: 8 },
            { opacity: 1, y: 0, duration: 0.35 },
            "title+=0.8",
          );
        }

        if (valuesLabel) {
          tl.fromTo(
            valuesLabel,
            { opacity: 0, y: 6 },
            { opacity: 1, y: 0, duration: 0.3 },
            "title+=0.92",
          );
        }

        if (blocks.length) {
          tl.fromTo(
            blocks,
            { opacity: 0, y: 14 },
            { opacity: 1, y: 0, duration: 0.42, stagger: 0.09 },
            "title+=1.02",
          );
        }

        if (insightEl) {
          tl.fromTo(
            insightEl,
            { opacity: 0, y: 8 },
            { opacity: 1, y: 0, duration: 0.35 },
            "title+=1.02",
          );
        }

        if (noteEl) {
          tl.fromTo(
            noteEl,
            { opacity: 0 },
            { opacity: 1, duration: 0.3 },
            "+=0.05",
          );
        }

        if ((tl.duration() ?? 0) < 0.15) {
          revealAll(root);
        } else {
          tl.timeScale(CONNECTION_TIMING.playbackScale);
        }
      };

      void run().catch(() => {
        if (!cancelled && rootRef.current) revealAll(rootRef.current);
      });

      failsafe = window.setTimeout(() => {
        if (cancelled || !rootRef.current) return;
        const stage = rootRef.current.querySelector<HTMLElement>(".connection-reward__stage");
        if (stage && Number(gsap.getProperty(stage, "opacity")) < 0.05) {
          revealAll(rootRef.current);
        }
      }, 1800);
    };

    start();

    return () => {
      cancelled = true;
      window.cancelAnimationFrame(raf);
      window.clearTimeout(failsafe);
      tl?.kill();
      splits.forEach((split) => {
        try {
          split.revert();
        } catch {
          /* already reverted */
        }
      });
    };
  }, [portalReady, reduceMotion, valueBlocksKey, tag, title1, title2]);

  useLayoutEffect(() => {
    if (!portalReady || !showControls || reduceMotion) return;
    const root = rootRef.current;
    if (!root) return;
    const footer = root.querySelector<HTMLElement>(".connection-reward__footer");
    if (!footer) return;
    gsap.fromTo(
      footer,
      { opacity: 0, y: 12 },
      { opacity: 1, y: 0, duration: 0.42, ease: CONNECTION_EASE.hero },
    );
  }, [portalReady, showControls, reduceMotion]);

  const handleOverlayClick = () => {
    complete();
  };

  const handleButtonClick = (event: React.MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation();
    complete();
  };

  if (!portalReady) return null;

  return createPortal(
    <div
      ref={rootRef}
      className={[
        "connection-reward fixed inset-0 z-[120]",
        canDismiss ? "cursor-pointer" : "cursor-default",
      ].join(" ")}
      role="dialog"
      aria-modal="true"
      aria-live="polite"
      aria-label={`${title1} ${title2}`}
      data-connection-reward="open"
      onClick={handleOverlayClick}
    >
      <div
        className="connection-reward__shell"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="connection-reward__stage">
          <div className="connection-reward__main">
            <p className="connection-reward__tag">{tag}</p>

            <header className="connection-reward__headline connection-manifesto connection-manifesto--start">
              <h2
                className="connection-manifesto__title"
                aria-label={`${title1} ${title2}`}
              >
                <span className="connection-manifesto__line connection-manifesto__line--display connection-reward__title-a">
                  {title1}
                </span>
                <span className="connection-manifesto__divider" aria-hidden>
                  <ConnectionRule variant="reward" tone="warm" />
                </span>
                <span className="connection-manifesto__line connection-manifesto__line--brand connection-reward__title-b">
                  {title2}
                </span>
              </h2>
            </header>

            <div className="connection-reward__message">
              <p className="connection-reward__greeting">{praise.greeting}</p>
              <p className="connection-reward__subtitle">
                <span className="connection-reward__subtitle-mark" aria-hidden />
                <span className="connection-reward__subtitle-copy">{praise.subtitle}</span>
              </p>
            </div>

            {valueBlocks.length > 0 ? (
              <section
                className="connection-reward__descriptions"
                aria-label={praise.valuesLabel}
                data-count={Math.min(valueBlocks.length, 5)}
                data-density={
                  valueBlocks.length <= 1
                    ? "solo"
                    : valueBlocks.length === 2
                      ? "duo"
                      : valueBlocks.length === 3
                        ? "trio"
                        : "dense"
                }
              >
                <div className="connection-reward__values-head">
                  <p className="connection-reward__values-label">{praise.valuesLabel}</p>
                  <span className="connection-reward__values-count" aria-hidden>
                    {String(valueBlocks.length).padStart(2, "0")}
                  </span>
                </div>
                {valueBlocks.map((block) => (
                  <article key={block.value} className="connection-reward__value-block">
                    <h3 className="connection-reward__value-title">{block.label}</h3>
                    <p className="connection-reward__value-text">{block.text}</p>
                  </article>
                ))}
              </section>
            ) : praise.fallbackInsight ? (
              <p className="connection-reward__insight">{praise.fallbackInsight}</p>
            ) : null}

            {praise.noteAck ? (
              <p className="connection-reward__note">{praise.noteAck}</p>
            ) : null}
          </div>

          <div className="connection-reward__footer">
            {showControls ? (
              <>
                <ConnectionCta
                  tone="accent"
                  label={continueLabel}
                  onClick={handleButtonClick}
                  disabled={!canDismiss}
                  icon={<ArrowRight className="h-4 w-4" />}
                  iconSide="trailing"
                />
                {canDismiss ? (
                  <p className="connection-reward__tap-hint">{tapHint}</p>
                ) : null}
              </>
            ) : (
              <div className="connection-reward__footer-slot" aria-hidden />
            )}
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
