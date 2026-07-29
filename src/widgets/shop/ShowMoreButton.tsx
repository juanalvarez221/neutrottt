"use client";

import { ChevronDown } from "lucide-react";

type ShowMoreButtonProps = {
  expanded: boolean;
  onToggle: () => void;
  moreLabel: string;
  lessLabel: string;
  controlsId: string;
  count?: number;
  className?: string;
};

export function ShowMoreButton({
  expanded,
  onToggle,
  moreLabel,
  lessLabel,
  controlsId,
  count,
  className = "",
}: ShowMoreButtonProps) {
  const label =
    expanded || count == null || count <= 0
      ? expanded
        ? lessLabel
        : moreLabel
      : `${moreLabel} · ${count}`;

  return (
    <button
      type="button"
      aria-expanded={expanded}
      aria-controls={controlsId}
      onClick={onToggle}
      className={
        expanded
          ? `group inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl border border-[rgba(var(--rgb-sand),0.32)] bg-[rgba(18,12,14,0.55)] px-5 text-xs font-semibold uppercase tracking-[0.14em] text-[rgba(var(--rgb-sand),0.92)] shadow-[inset_0_1px_0_rgba(255,255,255,0.06)] transition hover:border-[rgba(var(--rgb-sand),0.5)] hover:text-[rgba(var(--rgb-ivory),0.95)] active:scale-[0.98] sm:w-auto ${className}`
          : `btn-accent typo-cta group inline-flex min-h-11 w-full items-center justify-center gap-2.5 rounded-xl px-6 py-3 text-xs uppercase tracking-[0.14em] active:scale-[0.98] sm:w-auto ${className}`
      }
    >
      <span>{label}</span>
      <ChevronDown
        className={`h-4 w-4 shrink-0 transition-transform duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] ${
          expanded ? "rotate-180 opacity-80" : "opacity-95"
        }`}
        strokeWidth={2}
        aria-hidden
      />
    </button>
  );
}
