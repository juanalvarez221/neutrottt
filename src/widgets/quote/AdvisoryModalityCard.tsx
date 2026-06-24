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
      whileHover={reduceMotion ? undefined : { y: -2 }}
      whileTap={reduceMotion ? undefined : { scale: 0.995 }}
      className={cn(
        "group relative flex h-full min-h-[17.5rem] flex-col overflow-hidden rounded-2xl border border-white/[0.07] bg-[linear-gradient(165deg,rgba(255,255,255,0.045)_0%,rgba(255,255,255,0.01)_42%,transparent_100%)] p-6 text-left shadow-[inset_0_1px_0_rgba(255,255,255,0.06)] backdrop-blur-sm sm:p-7",
        "transition-[border-color,background-color,box-shadow] duration-500 hover:border-[rgba(var(--rgb-camel),0.32)] hover:bg-[linear-gradient(165deg,rgba(255,255,255,0.06)_0%,rgba(255,255,255,0.015)_48%,transparent_100%)] hover:shadow-[inset_0_1px_0_rgba(255,255,255,0.1),0_20px_48px_rgba(0,0,0,0.22)]",
        className,
      )}
    >
      <span
        aria-hidden
        className="pointer-events-none absolute inset-x-7 top-0 h-px bg-gradient-to-r from-transparent via-[rgba(var(--rgb-camel),0.45)] to-transparent opacity-0 transition-opacity duration-500 group-hover:opacity-100"
      />

      <span className="flex items-start justify-between gap-4">
        <span className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-white/[0.08] bg-white/[0.03] text-[rgba(var(--rgb-ivory),0.82)] transition-colors duration-500 group-hover:border-[rgba(var(--rgb-camel),0.28)] group-hover:bg-white/[0.05]">
          <Icon className="h-[18px] w-[18px]" strokeWidth={1.5} />
        </span>
        <span className="typo-tech text-[11px] tracking-[0.18em] text-zinc-500">
          {durationMin} min
        </span>
      </span>

      <span className="mt-7 block">
        <h3 className="typo-card-title text-[0.98rem] text-zinc-100 sm:text-[1.02rem]">{title}</h3>
        <p className="typo-lead mt-2 text-[rgba(var(--rgb-ivory),0.72)]">{eyebrow}</p>
        {detailLink ? (
          <div className="mt-2">{detailLink}</div>
        ) : detail ? (
          <p className="typo-ui-meta mt-2 text-zinc-500">{detail}</p>
        ) : null}
      </span>

      <p className="typo-card-body mt-5 flex-1 text-zinc-400/95">{body}</p>

      <span className="mt-8 inline-flex items-center gap-2 border-t border-white/[0.06] pt-5 text-sm font-medium text-zinc-300 transition-colors duration-300 group-hover:text-[rgba(var(--rgb-ivory),0.95)]">
        <span className="tracking-[0.02em]">{cta}</span>
        <ArrowUpRight
          className="h-3.5 w-3.5 opacity-55 transition-all duration-300 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 group-hover:opacity-100"
          strokeWidth={1.75}
        />
      </span>
    </motion.button>
  );
}
