"use client";

import type { ReactNode } from "react";

type QuoteStepHeaderProps = {
  eyebrow: string;
  title: string;
  titleAccent?: string;
  body?: string;
};

/** Studio header — no Paso N, no amber orbs, no gradient text. */
export function QuoteStepHeader({
  eyebrow,
  title,
  titleAccent,
  body,
}: QuoteStepHeaderProps) {
  return (
    <header className="mb-8 max-w-2xl border-b border-[rgba(var(--rgb-sand),0.14)] pb-6">
      <p className="font-mono text-[0.62rem] uppercase tracking-[0.18em] text-[rgba(var(--rgb-sand),0.55)]">
        {eyebrow}
      </p>
      <h2 className="typo-gothic mt-3 text-[clamp(1.85rem,4.5vw,2.75rem)] leading-[0.95] text-[rgba(var(--rgb-sand),0.96)]">
        {title}
        {titleAccent ? (
          <>
            <br />
            <span className="text-[rgba(var(--rgb-ivory),0.72)]">{titleAccent}</span>
          </>
        ) : null}
      </h2>
      {body ? (
        <p className="mt-4 max-w-[42ch] text-sm leading-relaxed text-[rgba(var(--rgb-ivory),0.62)]">
          {body}
        </p>
      ) : null}
    </header>
  );
}

type QuotePanelProps = {
  label?: string;
  children: ReactNode;
  className?: string;
};

export function QuotePanel({ label, children, className = "" }: QuotePanelProps) {
  return (
    <section
      className={`rounded-2xl border border-[rgba(var(--rgb-sand),0.14)] bg-[rgba(12,10,8,0.72)] p-5 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] backdrop-blur-md sm:p-6 ${className}`}
    >
      {label ? (
        <p className="mb-4 font-mono text-[0.58rem] uppercase tracking-[0.16em] text-[rgba(var(--rgb-sand),0.45)]">
          {label}
        </p>
      ) : null}
      {children}
    </section>
  );
}

export function QuotePrimaryCta({
  children,
  onClick,
  disabled,
  type = "button",
}: {
  children: ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  type?: "button" | "submit";
}) {
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className="btn-accent typo-cta group inline-flex w-full min-h-12 items-center justify-center gap-2 rounded-xl px-5 py-4 active:scale-[0.98] disabled:opacity-50"
    >
      {children}
    </button>
  );
}
