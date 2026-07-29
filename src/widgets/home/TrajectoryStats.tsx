"use client";

import { useEffect, useRef } from "react";
import {
  animate,
  motion,
  useInView,
  useReducedMotion,
} from "framer-motion";
import { useSiteLanguage } from "@/shared/i18n/LanguageProvider";

type FastCounterProps = {
  to: number;
  suffix?: string;
  delay?: number;
};

function FastCounter({ to, suffix = "+", delay = 0 }: FastCounterProps) {
  const reduceMotion = useReducedMotion();
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: false, amount: 0.55 });

  useEffect(() => {
    const node = ref.current;
    if (!node) return;

    if (!inView) {
      if (!reduceMotion) node.textContent = `0${suffix}`;
      return;
    }

    if (reduceMotion) {
      node.textContent = `${to}${suffix}`;
      return;
    }

    node.textContent = `0${suffix}`;
    const controls = animate(0, to, {
      duration: 0.72,
      delay,
      ease: [0.12, 0.8, 0.2, 1],
      onUpdate: (latest) => {
        node.textContent = `${Math.round(latest)}${suffix}`;
      },
    });

    return () => controls.stop();
  }, [delay, inView, reduceMotion, suffix, to]);

  return (
    <span ref={ref} className="tabular-nums">
      {reduceMotion ? `${to}${suffix}` : `0${suffix}`}
    </span>
  );
}

function ScopeReveal() {
  const { t } = useSiteLanguage();
  const reduceMotion = useReducedMotion();
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: false, amount: 0.55 });

  if (reduceMotion) {
    return <span ref={ref}>{t("trajectoryStatScope")}</span>;
  }

  return (
    <span
      ref={ref}
      className="inline-flex flex-wrap items-baseline gap-x-1.5"
      aria-label={t("trajectoryStatScope")}
    >
      <motion.span
        initial={false}
        animate={inView ? { opacity: 1, y: 0 } : { opacity: 0, y: 10 }}
        transition={{ duration: 0.35, delay: inView ? 0.55 : 0, ease: [0.22, 1, 0.36, 1] }}
        className="text-[rgba(var(--rgb-ivory),0.88)]"
      >
        {t("trajectoryStatScopeNational")}
      </motion.span>

      <motion.span
        initial={false}
        animate={inView ? { opacity: 0.55 } : { opacity: 0 }}
        transition={{ duration: 0.25, delay: inView ? 0.82 : 0 }}
        className="text-[rgba(var(--rgb-ivory),0.5)]"
        aria-hidden
      >
        {t("trajectoryStatScopeConnector")}
      </motion.span>

      <motion.span
        initial={false}
        animate={
          inView
            ? { opacity: 1, x: 0, filter: "blur(0px)", scale: 1 }
            : { opacity: 0, x: 36, filter: "blur(8px)", scale: 0.94 }
        }
        transition={
          inView
            ? {
                type: "spring",
                stiffness: 320,
                damping: 24,
                mass: 0.7,
                delay: 0.98,
              }
            : { duration: 0.2, delay: 0 }
        }
        className="relative inline-block font-semibold text-[rgba(var(--rgb-sand),0.96)]"
      >
        {t("trajectoryStatScopeInternational")}
        <motion.span
          aria-hidden
          className="pointer-events-none absolute -bottom-0.5 left-0 h-px w-full origin-left bg-gradient-to-r from-[rgba(var(--rgb-sand),0.85)] to-transparent"
          initial={false}
          animate={
            inView
              ? { scaleX: 1, opacity: 1 }
              : { scaleX: 0, opacity: 0 }
          }
          transition={{
            duration: 0.45,
            delay: inView ? 1.22 : 0,
            ease: [0.22, 1, 0.36, 1],
          }}
        />
      </motion.span>
    </span>
  );
}

export function TrajectoryStats() {
  const { t } = useSiteLanguage();

  return (
    <dl className="grid grid-cols-1 gap-5 border-t border-[rgba(var(--rgb-terracotta),0.22)] pt-6 sm:grid-cols-3 sm:gap-4 lg:grid-cols-1 lg:border-t-0 lg:border-l lg:border-[rgba(var(--rgb-terracotta),0.22)] lg:pt-0 lg:pl-8">
      <div>
        <dt className="font-mono text-[0.65rem] uppercase tracking-[0.18em] text-[rgba(var(--rgb-sand),0.72)]">
          {t("trajectoryStatYearsLabel")}
        </dt>
        <dd
          className="mt-1 text-[clamp(2rem,4vw,2.75rem)] font-bold leading-none tracking-tight text-[rgba(var(--rgb-sand),0.95)]"
          style={{ fontFamily: "var(--font-stack-display)" }}
        >
          <FastCounter to={17} delay={0.05} />
        </dd>
      </div>

      <div>
        <dt className="font-mono text-[0.65rem] uppercase tracking-[0.18em] text-[rgba(var(--rgb-sand),0.72)]">
          {t("trajectoryStatAwardsLabel")}
        </dt>
        <dd
          className="mt-1 text-[clamp(2rem,4vw,2.75rem)] font-bold leading-none tracking-tight text-[rgba(var(--rgb-sand),0.95)]"
          style={{ fontFamily: "var(--font-stack-display)" }}
        >
          <FastCounter to={50} delay={0.12} />
        </dd>
      </div>

      <div>
        <dt className="font-mono text-[0.65rem] uppercase tracking-[0.18em] text-[rgba(var(--rgb-sand),0.72)]">
          {t("trajectoryStatScopeLabel")}
        </dt>
        <dd className="mt-2 text-sm font-semibold leading-relaxed tracking-wide">
          <ScopeReveal />
        </dd>
      </div>
    </dl>
  );
}
