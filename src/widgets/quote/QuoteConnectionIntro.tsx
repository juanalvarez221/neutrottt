"use client";

import { useEffect, useRef, useState } from "react";
import { useReducedMotion } from "framer-motion";
import gsap from "gsap";
import { useGSAP } from "@gsap/react";
import { SplitText } from "gsap/SplitText";
import { ConnectionManifestoStatement } from "@/widgets/quote/ConnectionManifestoStatement";
import { ConnectionManifestoHeadline } from "@/widgets/quote/ConnectionManifestoHeadline";

gsap.registerPlugin(useGSAP, SplitText);

type QuoteConnectionIntroProps = {
  title: string;
  title2: string;
  manifest: string;
  hook?: string;
  eyebrow?: string;
  onComplete: () => void;
};

/** Hold after copy lands so the viewer can read — cinematic title-card pacing. */
const READ_HOLD_S = 2.4;

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

      const run = async () => {
        await document.fonts.ready;
        if (cancelled || !rootRef.current) return;

        const progress = root.querySelector<HTMLElement>(".connection-intro__progress-fill");
        const titleA = root.querySelector<HTMLElement>(".connection-intro__title-line--a");
        const titleB = root.querySelector<HTMLElement>(".connection-intro__title-line--b");
        const manifestLines = gsap.utils.toArray<HTMLElement>(
          root.querySelectorAll(".connection-intro__manifest-line"),
        );
        const hookEl = root.querySelector<HTMLElement>(".connection-intro__hook");

        gsap.set(
          [
            ".connection-intro__veil",
            ".connection-intro__light",
            ".connection-intro__eyebrow",
            ".connection-intro__title-rule",
            ".connection-intro__bridge",
            ".connection-intro__progress",
            ".connection-intro__stage",
            ".connection-intro__hook",
          ],
          { opacity: 0 },
        );

        gsap.set(".connection-intro__stage", { y: 24, scale: 1.02 });
        gsap.set(".connection-intro__title-rule", { scaleX: 0, transformOrigin: "center" });
        gsap.set(".connection-intro__bridge", { scaleX: 0, transformOrigin: "center" });
        gsap.set(".connection-intro__progress-fill", {
          scaleX: 0,
          transformOrigin: "left center",
        });
        gsap.set(".connection-intro__light--a", { scale: 0.9, x: -20, y: 12 });
        gsap.set(".connection-intro__light--b", { scale: 0.92, x: 16, y: -10 });

        const titleSplits: SplitText[] = [];
        if (titleA) {
          const split = SplitText.create(titleA, {
            type: "chars,words",
            mask: "chars",
            smartWrap: true,
          });
          titleSplits.push(split);
          splits.push(split);
          gsap.set(split.chars, { yPercent: 110, opacity: 0 });
        }
        if (titleB) {
          const split = SplitText.create(titleB, {
            type: "chars,words",
            mask: "chars",
            smartWrap: true,
          });
          titleSplits.push(split);
          splits.push(split);
          gsap.set(split.chars, { yPercent: 110, opacity: 0 });
        }

        const manifestSplits: SplitText[] = [];
        manifestLines.forEach((line) => {
          const split = SplitText.create(line, {
            type: "words",
            mask: "words",
          });
          manifestSplits.push(split);
          splits.push(split);
          gsap.set(split.words, { yPercent: 105, opacity: 0 });
        });

        master = gsap.timeline({
          defaults: { ease: "power3.out" },
          onComplete: finish,
        });

        // ACT I — atmosphere (video stays visible)
        master
          .to(".connection-intro__veil", { opacity: 1, duration: 0.9, ease: "power2.out" }, 0)
          .to(
            [".connection-intro__light--a", ".connection-intro__light--b"],
            {
              opacity: 1,
              scale: 1,
              x: 0,
              y: 0,
              duration: 1.2,
              stagger: 0.12,
              ease: "power2.out",
            },
            0.1,
          )
          .to(
            ".connection-intro__stage",
            { opacity: 1, y: 0, scale: 1, duration: 1, ease: "power3.out" },
            0.15,
          )
          .to(".connection-intro__progress", { opacity: 1, duration: 0.4 }, 0.35);

        // ACT II — eyebrow
        master.fromTo(
          ".connection-intro__eyebrow",
          { opacity: 0, y: 10, letterSpacing: "0.38em" },
          {
            opacity: 1,
            y: 0,
            letterSpacing: "0.22em",
            duration: 0.85,
            ease: "power3.out",
          },
          0.45,
        );

        // ACT III — title (masked character reveal — studio standard)
        master.addLabel("title", 0.85);

        if (titleSplits[0]?.chars.length) {
          master.to(
            titleSplits[0].chars,
            {
              yPercent: 0,
              opacity: 1,
              duration: 0.95,
              stagger: 0.028,
              ease: "power4.out",
              force3D: true,
            },
            "title",
          );
        }

        master.to(
          ".connection-intro__title-rule",
          { opacity: 1, scaleX: 1, duration: 0.7, ease: "power2.inOut" },
          "title+=0.55",
        );

        if (titleSplits[1]?.chars.length) {
          master.to(
            titleSplits[1].chars,
            {
              yPercent: 0,
              opacity: 1,
              duration: 0.95,
              stagger: 0.026,
              ease: "power4.out",
              force3D: true,
            },
            "title+=0.7",
          );
        }

        // Soft settle
        master.to(
          ".connection-intro__stage",
          { scale: 1.01, duration: 0.8, ease: "sine.inOut" },
          "title+=1.4",
        );
        master.to(
          ".connection-intro__stage",
          { scale: 1, duration: 0.75, ease: "sine.inOut" },
          ">",
        );

        // ACT IV — manifesto (masked word reveal, reading pace)
        master.to(
          ".connection-intro__bridge",
          { opacity: 1, scaleX: 1, duration: 0.55, ease: "power2.inOut" },
          "title+=1.65",
        );

        manifestSplits.forEach((split, index) => {
          const label = `verse-${index}`;
          const at = index === 0 ? "title+=1.9" : `verse-${index - 1}+=0.55`;
          master!.addLabel(label, at);
          master!.to(
            split.words,
            {
              yPercent: 0,
              opacity: 1,
              duration: 0.75,
              stagger: 0.045,
              ease: "power3.out",
              force3D: true,
            },
            label,
          );
        });

        // ACT V — hook
        if (hookEl) {
          master.fromTo(
            hookEl,
            { opacity: 0, y: 14 },
            { opacity: 1, y: 0, duration: 0.9, ease: "power3.out" },
            "+=0.35",
          );
        }

        // ACT VI — hold for reading
        master.to({}, { duration: READ_HOLD_S });

        if (progress) {
          gsap.to(progress, {
            scaleX: 1,
            duration: Math.max((master.duration() || 1) - 0.5, 1),
            ease: "none",
            delay: 0.25,
          });
        }

        // Ambient light drift
        gsap.to(".connection-intro__light--a", {
          x: 12,
          y: -8,
          scale: 1.05,
          duration: 8,
          yoyo: true,
          repeat: -1,
          ease: "sine.inOut",
          delay: 1.5,
        });
        gsap.to(".connection-intro__light--b", {
          x: -10,
          y: 8,
          scale: 1.06,
          duration: 9.5,
          yoyo: true,
          repeat: -1,
          ease: "sine.inOut",
          delay: 1.8,
        });
      };

      void run();

      return () => {
        cancelled = true;
        master?.kill();
        splits.forEach((split) => split.revert());
      };
    },
    { scope: rootRef, dependencies: [reduceMotion, title, title2, manifest, hook] },
  );

  if (reduceMotion) return null;

  return (
    <div
      ref={rootRef}
      className="connection-intro absolute inset-0 z-30 flex min-h-0 items-center justify-center overflow-y-auto py-8 sm:py-10"
      aria-live="polite"
      aria-label={`${title} ${title2}`}
    >
      <div className="connection-intro__veil" aria-hidden />

      <div className="connection-intro__ambient" aria-hidden>
        <span className="connection-intro__light connection-intro__light--a" />
        <span className="connection-intro__light connection-intro__light--b" />
      </div>

      <div className="connection-intro__content connection-intro__stage relative px-5 sm:px-8">
        <ConnectionManifestoHeadline line1={title} line2={title2} eyebrow={eyebrow} />

        <ConnectionManifestoStatement text={manifest} />

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
        if (!show) {
          setRenderIntro(false);
          setRenderForm(true);
        }
        prevShow.current = show;
        return;
      }

      if (prevShow.current && !show && introWrapRef.current) {
        gsap.to(introWrapRef.current, {
          opacity: 0,
          y: -10,
          filter: "blur(8px)",
          duration: 0.55,
          ease: "power2.inOut",
          onComplete: () => {
            setRenderIntro(false);
            setRenderForm(true);
          },
        });
      }

      prevShow.current = show;
    },
    { scope: rootRef, dependencies: [show, reduceMotion] },
  );

  useGSAP(
    () => {
      if (!renderForm || reduceMotion || !formWrapRef.current) return;
      gsap.fromTo(
        formWrapRef.current,
        { opacity: 0, y: 16 },
        { opacity: 1, y: 0, duration: 0.65, ease: "power3.out" },
      );
    },
    { scope: rootRef, dependencies: [renderForm, reduceMotion] },
  );

  return (
    <div ref={rootRef} className="relative min-h-[clamp(26rem,82dvh,42rem)]">
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
