"use client";

import { Check } from "lucide-react";

/** Marco claro para ilustraciones corporales que conservan su fondo fotográfico. */
export const BODY_REFERENCE_IMAGE_FRAME =
  "overflow-hidden rounded-lg border border-white/15 bg-stone-100 shadow-[0_2px_14px_rgba(0,0,0,0.2),inset_0_0_0_1px_rgba(0,0,0,0.05)]";

type StepHeaderProps = {
  step: number;
  total: number;
  title: string;
  hint?: string;
  done?: boolean;
};

export function RefinementStepHeader({ step, total, title, hint, done }: StepHeaderProps) {
  return (
    <div className="space-y-1">
      <div className="flex items-center gap-2">
        <span
          className={[
            "inline-flex h-6 min-w-6 items-center justify-center rounded-full border px-1.5 text-[10px] font-bold uppercase tracking-wider",
            done
              ? "border-stone-400/40 bg-stone-500/20 text-stone-100"
              : "border-stone-500/25 bg-stone-600/10 text-stone-300",
          ].join(" ")}
          aria-hidden
        >
          {done ? <Check className="h-3 w-3" strokeWidth={2.5} /> : step}
        </span>
        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-zinc-400">
          {title}
          {total > 1 ? (
            <span className="ml-1.5 font-normal text-zinc-500">
              ({step}/{total})
            </span>
          ) : null}
        </p>
      </div>
      {hint ? <p className="pl-8 text-sm leading-relaxed text-zinc-500">{hint}</p> : null}
    </div>
  );
}

type SelectionSummaryProps = {
  label: string;
  value: string;
  incomplete?: boolean;
  incompleteHint?: string;
};

export function SelectionSummary({
  label,
  value,
  incomplete,
  incompleteHint,
}: SelectionSummaryProps) {
  return (
    <div
      className={[
        "rounded-lg border px-3 py-2.5",
        incomplete
          ? "border-amber-500/25 bg-amber-950/20"
          : "border-stone-500/20 bg-stone-600/8",
      ].join(" ")}
    >
      <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-zinc-500">{label}</p>
      <p className="mt-0.5 text-sm font-semibold text-stone-200">{value}</p>
      {incomplete && incompleteHint ? (
        <p className="mt-1 text-xs leading-relaxed text-amber-200/85">{incompleteHint}</p>
      ) : null}
    </div>
  );
}
