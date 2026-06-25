"use client";

import type { LucideIcon } from "lucide-react";
import { ArrowUpRight } from "lucide-react";
import { motion, useReducedMotion } from "framer-motion";
import { cn } from "@/shared/lib/cn";

const easeOut = [0.22, 1, 0.36, 1] as const;

export function AdvisoryModalityCard({
  icon: Icon,
  title,
  eyebrow,
  detail,
  detailLink,
  body,
  cta,
  durationMin,
  variant = "presencial",
  className,
  onClick,
}: {
  icon: LucideIcon;
  title: string;
  eyebrow: string;
  detail?: React.ReactNode;
  detailLink?: React.ReactNode;
  body: string;
  cta: string;
  durationMin: number;
  variant?: "presencial" | "virtual";
  className?: string;
  onClick: () => void;
}) {
  const reduceMotion = useReducedMotion();

  return (
    <motion.button
      type="button"
      onClick={onClick}
      initial={reduceMotion ? false : { opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.55, ease: easeOut }}
      whileHover={reduceMotion ? undefined : { y: -3 }}
      whileTap={reduceMotion ? undefined : { scale: 0.985 }}
      className={cn(
        "advisory-modality-card group relative flex h-full min-h-[17.5rem] flex-col p-6 text-left sm:p-7",
        variant === "virtual"
          ? "advisory-modality-card--virtual"
          : "advisory-modality-card--presencial",
        className,
      )}
    >
      <span className="relative z-[1] flex items-start justify-between gap-4">
        <span className="advisory-modality-card__icon">
          <Icon className="h-[18px] w-[18px]" strokeWidth={1.65} />
        </span>
        <span className="advisory-modality-card__duration typo-tech">
          {durationMin} min
        </span>
      </span>

      <span className="relative z-[1] mt-7 block">
        <h3 className="typo-card-title text-[0.98rem] text-[rgba(var(--rgb-ivory),0.96)] sm:text-[1.02rem]">
          {title}
        </h3>
        <p className="advisory-modality-card__eyebrow typo-lead mt-2">{eyebrow}</p>
        {detailLink ? (
          <div className="mt-2">{detailLink}</div>
        ) : detail ? (
          <p className="typo-ui-meta mt-2 text-[rgba(var(--rgb-sand),0.72)]">{detail}</p>
        ) : null}
      </span>

      <p className="advisory-modality-card__body typo-card-body relative z-[1] mt-5 flex-1">
        {body}
      </p>

      <span className="advisory-modality-card__footer relative z-[1] mt-8 inline-flex items-center gap-2 pt-5 text-sm font-semibold">
        <span className="tracking-[0.04em]">{cta}</span>
        <ArrowUpRight
          className="h-3.5 w-3.5 opacity-80 transition-all duration-300 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 group-hover:opacity-100"
          strokeWidth={1.85}
        />
      </span>
    </motion.button>
  );
}
