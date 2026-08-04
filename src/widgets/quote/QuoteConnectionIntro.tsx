"use client";

import { useEffect, useRef, useState } from "react";
import { useReducedMotion } from "framer-motion";
import { useGSAP } from "@gsap/react";
import { ConnectionManifestoStatement } from "@/widgets/quote/ConnectionManifestoStatement";
import { ConnectionManifestoHeadline } from "@/widgets/quote/ConnectionManifestoHeadline";
import {
  CONNECTION_EASE,
  CONNECTION_TIMING,
  Flip,
  gsap,
  Observer,
  registerConnectionMotion,
  SplitText,
  whenFontsReady,
} from "@/shared/lib/connectionMotion";

registerConnectionMotion();

type QuoteConnectionIntroProps = {
  title: string;
  title2: string;
  manifest: string;
  hook?: string;
  eyebrow?: string;
  onComplete: () => void;
};

/** Quiet hold after titles land — kept short; playbackScale handles the rest. */
const READ_HOLD_S = CONNECTION_TIMING.introReadHoldS;

export function QuoteConnectionIntro({
  title,
  title2,
  manifest,
  hook,
  eyebrow,
  onComplete,
}: QuoteConnectionIntroProps) {
  const reduceMotion = useReducedMotion();
  const rootRef = useRef<HTMLDivElement>(null);
  const completedRef = useRef(false);
  const onCompleteRef = useRef(onComplete);
  onCompleteRef.current = onComplete;

  const finish = () => {
    if (completedRef.current) return;
    completedRef.current = true;
    onCompleteRef.current();
  };

  useEffect(() => {
    if (!reduceMotion) return;
    finish();
  }, [reduceMotion]);

  useGSAP(
    () => {
      const root = rootRef.current;
      if (!root || reduceMotion) return;

      let cancelled = false;
      const splits: SplitText[] = [];
      let master: gsap.core.Timeline | null = null;
      let parallaxObserver: ReturnType<typeof Observer.create> | null = null;
      const ambientTweens: gsap.core.Tween[] = [];

      const run = async () => {
        await whenFontsReady();
        if (cancelled || !rootRef.current) return;

        const progress = root.querySelector<HTMLElement>(".connection-intro__progress-fill");
        const titleA = root.querySelector<HTMLElement>(".connection-intro__title-line--a");
        const titleB = root.querySelector<HTMLElement>(".connection-intro__title-line--b");
        const titleRule = root.querySelector<SVGLineElement>(
          ".connection-rule--intro-title line",
        );
        const manifestLines = gsap.utils.toArray<HTMLElement>(
          root.querySelectorAll(".connection-intro__manifest-line"),
        );
        const hookEl = root.querySelector<HTMLElement>(".connection-intro__hook");
        const eyebrowEl = root.querySelector<HTMLElement>(".connection-intro__eyebrow");
        const impact = root.querySelector<HTMLElement>(".connection-intro__impact");
        const barTop = root.querySelector<HTMLElement>(".connection-intro__bar--top");
        const barBottom = root.querySelector<HTMLElement>(".connection-intro__bar--bottom");

        gsap.set(
          [
            ".connection-intro__eyebrow",
            ".connection-intro__progress",
            ".connection-intro__stage",
            ".connection-intro__hook",
            ".connection-intro__title-line--a",
            ".connection-intro__title-line--b",
            ".connection-intro__impact",
          ],
          { opacity: 0 },
        );

        gsap.set(".connection-intro__stage", {
          scale: 1.08,
          y: 18,
          willChange: "transform",
          transformOrigin: "30% 40%",
        });
        gsap.set([barTop, barBottom], { scaleY: 0 });
        if (barTop) gsap.set(barTop, { transformOrigin: "center top" });
        if (barBottom) gsap.set(barBottom, { transformOrigin: "center bottom" });
        if (titleRule) gsap.set(titleRule, { drawSVG: "50% 50%", opacity: 1 });
        gsap.set(".connection-intro__progress-fill", {
          scaleX: 0,
          transformOrigin: "left center",
        });

        // LINE A — Syncopate: masked chars + depth + scramble landing
        let splitA: SplitText | null = null;
        if (titleA) {
          splitA = SplitText.create(titleA, {
            type: "chars,words",
            mask: "chars",
            smartWrap: true,
          });
          splits.push(splitA);
          gsap.set(titleA, { opacity: 1, scale: 1.18, transformOrigin: "left center" });
          gsap.set(splitA.chars, {
            yPercent: 130,
            opacity: 0,
            rotateX: -70,
            filter: "blur(10px)",
            transformOrigin: "50% 100%",
          });
        }

        // LINE B — Unifraktur: word cascade with scale punch
        let splitB: SplitText | null = null;
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
            scale: 0.72,
            filter: "blur(8px)",
            transformOrigin: "left center",
          });
        }

        // Manifest — masked word reveals (editorial verse)
        const manifestSplits: SplitText[] = [];
        manifestLines.forEach((line) => {
          const split = SplitText.create(line, {
            type: "words",
            mask: "words",
          });
          manifestSplits.push(split);
          splits.push(split);
          gsap.set(line, { opacity: 1 });
          gsap.set(split.words, {
            yPercent: 120,
            opacity: 0,
            rotate: 2,
          });
        });

        master = gsap.timeline({
          defaults: { ease: CONNECTION_EASE.hero },
          onComplete: finish,
        });

        // ACT 0 — letterbox + camera push-in
        master
          .to(
            [barTop, barBottom],
            { scaleY: 1, duration: 0.85, stagger: 0.08, ease: CONNECTION_EASE.soft },
            0,
          )
          .to(
            ".connection-intro__stage",
            {
              opacity: 1,
              scale: 1,
              y: 0,
              duration: 1.35,
              ease: CONNECTION_EASE.soft,
            },
            0.15,
          )
          .to(".connection-intro__progress", { opacity: 1, duration: 0.45 }, 0.55);

        // Beat of silence
        master.to({}, { duration: 0.25 });

        // ACT I — eyebrow transmission
        if (eyebrowEl && eyebrow) {
          gsap.set(eyebrowEl, { textContent: "" });
          master.fromTo(
            eyebrowEl,
            { opacity: 0, y: -14, letterSpacing: "0.62em" },
            {
              opacity: 1,
              y: 0,
              letterSpacing: "0.28em",
              duration: 1.15,
              scrambleText: {
                text: eyebrow,
                chars: "upperCase",
                speed: 0.48,
                revealDelay: 0.22,
              },
              ease: CONNECTION_EASE.snap,
            },
            "+=0.05",
          );
        }

        master.addLabel("title", "+=0.2");

        // ACT II — display title detonates
        if (splitA?.chars.length) {
          master.to(
            splitA.chars,
            {
              yPercent: 0,
              opacity: 1,
              rotateX: 0,
              filter: "blur(0px)",
              duration: 1.15,
              stagger: {
                each: 0.038,
                from: "start",
              },
              ease: CONNECTION_EASE.hero,
              force3D: true,
            },
            "title",
          );
          master.to(
            titleA,
            { scale: 1, duration: 1.35, ease: CONNECTION_EASE.soft },
            "title",
          );
        }

        // Impact flash + micro shake on title land
        if (impact) {
          master.fromTo(
            impact,
            { opacity: 0 },
            { opacity: 0.55, duration: 0.08, ease: "power2.in" },
            "title+=0.55",
          );
          master.to(
            impact,
            { opacity: 0, duration: 0.55, ease: CONNECTION_EASE.soft },
            "title+=0.63",
          );
        }

        master.to(
          ".connection-intro__stage",
          { x: 3, duration: 0.05, ease: "power1.inOut" },
          "title+=0.58",
        );
        master.to(
          ".connection-intro__stage",
          { x: -2, duration: 0.06, ease: "power1.inOut" },
          "title+=0.63",
        );
        master.to(
          ".connection-intro__stage",
          { x: 0, duration: 0.18, ease: CONNECTION_EASE.soft },
          "title+=0.69",
        );

        if (titleRule) {
          master.to(
            titleRule,
            { drawSVG: "0% 100%", duration: 0.9, ease: CONNECTION_EASE.hero },
            "title+=0.85",
          );
        }

        // ACT III — brand gothic line rises
        if (splitB?.words.length) {
          master.to(
            splitB.words,
            {
              yPercent: 0,
              opacity: 1,
              scale: 1,
              filter: "blur(0px)",
              duration: 1.05,
              stagger: 0.14,
              ease: CONNECTION_EASE.hero,
              force3D: true,
            },
            "title+=1.05",
          );
        }

        // Soft settle breath on the whole card
        master.to(
          ".connection-intro__stage",
          { scale: 1.015, duration: 1.1, ease: CONNECTION_EASE.soft },
          "title+=1.85",
        );
        master.to(
          ".connection-intro__stage",
          { scale: 1, duration: 1.05, ease: CONNECTION_EASE.soft },
          ">",
        );

        // ACT IV — manifesto verses
        manifestSplits.forEach((split, index) => {
          const at = index === 0 ? "title+=2.35" : `verse-${index - 1}+=0.55`;
          const label = `verse-${index}`;
          master!.addLabel(label, at);
          master!.to(
            split.words,
            {
              yPercent: 0,
              opacity: 1,
              rotate: 0,
              duration: 0.9,
              stagger: 0.055,
              ease: CONNECTION_EASE.hero,
              force3D: true,
            },
            label,
          );
        });

        if (hookEl) {
          master.fromTo(
            hookEl,
            { opacity: 0, y: 12, letterSpacing: "0.12em" },
            {
              opacity: 1,
              y: 0,
              letterSpacing: "0.02em",
              duration: 1,
              ease: CONNECTION_EASE.soft,
            },
            "+=0.35",
          );
        }

        master.add(() => {
          gsap.set(".connection-intro__stage", { willChange: "auto" });
          if (splitA?.chars) gsap.set(splitA.chars, { clearProps: "filter" });
          if (splitB?.words) gsap.set(splitB.words, { clearProps: "filter" });
        });

        // ACT V — hold for reading
        master.to({}, { duration: READ_HOLD_S });

        // Letterbox gently retreats at the very end (exit cue before form)
        master.to(
          [barTop, barBottom],
          { opacity: 0.35, duration: 0.8, ease: CONNECTION_EASE.soft },
          "-=0.8",
        );

        master.timeScale(CONNECTION_TIMING.playbackScale);

        if (progress) {
          gsap.to(progress, {
            scaleX: 1,
            duration: Math.max((master.duration() || 1) - 0.25, 0.8),
            ease: "none",
            delay: 0.12,
          });
        }

        // Ambient camera drift after titles land
        ambientTweens.push(
          gsap.to(".connection-intro__stage", {
            scale: 1.01,
            duration: 5.5,
            yoyo: true,
            repeat: -1,
            ease: "sine.inOut",
            delay: 1.6,
          }),
        );

        if (window.matchMedia("(pointer: fine)").matches) {
          parallaxObserver = Observer.create({
            target: root,
            type: "pointer",
            onMove: (self) => {
              const nx = ((self.x ?? 0) / root.clientWidth - 0.5) * 2;
              const ny = ((self.y ?? 0) / root.clientHeight - 0.5) * 2;
              gsap.to(".connection-intro__stage", {
                x: nx * 8,
                y: ny * 5,
                duration: 1.5,
                ease: "power2.out",
                overwrite: "auto",
              });
              gsap.to(".connection-intro__letterbox", {
                x: nx * -3,
                duration: 1.8,
                ease: "power2.out",
                overwrite: "auto",
              });
            },
          });
        }
      };

      void run();

      return () => {
        cancelled = true;
        master?.kill();
        parallaxObserver?.kill();
        ambientTweens.forEach((tween) => tween.kill());
        splits.forEach((split) => split.revert());
      };
    },
    { scope: rootRef, dependencies: [reduceMotion, title, title2, manifest, hook, eyebrow] },
  );

  if (reduceMotion) return null;

  return (
    <div
      ref={rootRef}
      className="connection-intro absolute inset-0 z-30 flex min-h-0 items-center overflow-y-auto py-8 sm:py-12"
      aria-live="polite"
      aria-label={`${title} ${title2}`}
      data-connection-intro="open"
    >
      <div className="connection-intro__letterbox" aria-hidden>
        <span className="connection-intro__bar connection-intro__bar--top" />
        <span className="connection-intro__bar connection-intro__bar--bottom" />
      </div>

      <div className="connection-intro__impact" aria-hidden />

      <div className="connection-intro__content connection-intro__stage relative w-full px-5 sm:px-8 lg:px-12">
        <ConnectionManifestoHeadline
          line1={title}
          line2={title2}
          eyebrow={eyebrow}
          align="start"
        />

        <ConnectionManifestoStatement text={manifest} align="start" />

        {hook ? <p className="connection-intro__hook">{hook}</p> : null}

        <div className="connection-intro__progress" aria-hidden>
          <div className="connection-intro__progress-fill" />
        </div>
      </div>
    </div>
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
  const rootRef = useRef<HTMLDivElement>(null);
  const introWrapRef = useRef<HTMLDivElement>(null);
  const formWrapRef = useRef<HTMLDivElement>(null);
  const reduceMotion = useReducedMotion();
  const [renderIntro, setRenderIntro] = useState(show);
  const [renderForm, setRenderForm] = useState(!show);
  const prevShow = useRef(show);

  useEffect(() => {
    if (show) {
      setRenderIntro(true);
      setRenderForm(false);
    }
  }, [show]);

  useGSAP(
    () => {
      if (reduceMotion) {
        if (prevShow.current && !show) {
          setRenderIntro(false);
          setRenderForm(true);
        }
        prevShow.current = show;
        return;
      }

      if (prevShow.current && !show && introWrapRef.current) {
        const introWrap = introWrapRef.current;

        const eyebrowState = Flip.getState('[data-flip-id="connection-eyebrow"]', {
          props: "letterSpacing,color,fontSize",
        });

        setRenderForm(true);

        requestAnimationFrame(() => {
          const formWrap = formWrapRef.current;
          const label = formWrap?.querySelector<HTMLElement>(
            '[data-flip-id="connection-eyebrow"]',
          );

          const tl = gsap.timeline({
            onComplete: () => {
              setRenderIntro(false);
              gsap.set(introWrap, { clearProps: "all" });
            },
          });

          tl.to(
            introWrap,
            {
              opacity: 0,
              scale: 1.03,
              filter: "blur(12px)",
              duration: 0.7,
              ease: CONNECTION_EASE.soft,
            },
            0,
          );

          if (formWrap) {
            tl.fromTo(
              formWrap,
              { opacity: 0, y: 18, filter: "blur(6px)" },
              {
                opacity: 1,
                y: 0,
                filter: "blur(0px)",
                duration: 0.75,
                ease: CONNECTION_EASE.hero,
              },
              0.12,
            );
          }

          if (label && eyebrowState) {
            Flip.from(eyebrowState, {
              targets: label,
              absolute: true,
              fade: true,
              duration: 0.75,
              ease: CONNECTION_EASE.hero,
            });
          }
        });
      }

      prevShow.current = show;
    },
    { scope: rootRef, dependencies: [show, reduceMotion] },
  );

  return (
    <div
      ref={rootRef}
      className="relative min-h-[clamp(28rem,86dvh,46rem)]"
      data-connection-gate={renderIntro ? "intro" : "form"}
    >
      {renderIntro ? (
        <div ref={introWrapRef} className="absolute inset-0 will-change-transform">
          {intro}
        </div>
      ) : null}
      {renderForm ? (
        <div ref={formWrapRef} className="relative">
          {children}
        </div>
      ) : null}
    </div>
  );
}
