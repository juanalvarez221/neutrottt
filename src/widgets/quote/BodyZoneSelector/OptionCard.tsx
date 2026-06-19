"use client";

import { motion } from "framer-motion";
import { Check } from "lucide-react";
import type { IconType } from "./bodyZonesConfig";
import { cn } from "@/shared/lib/cn";

export function OptionCard({
  icon: Icon,
  label,
  description,
  selected,
  wide,
  count,
  onClick,
}: {
  icon: IconType;
  label: string;
  description?: string;
  selected?: boolean;
  wide?: boolean;
  count?: number;
  onClick: () => void;
}) {
  return (
    <motion.button
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      layout
      initial={false}
      animate={selected ? { scale: [1.045, 1.02] } : { scale: 1 }}
      transition={{ duration: 0.15, ease: [0.16, 1, 0.3, 1] }}
      whileHover={{ scale: selected ? 1.02 : 1.01 }}
      whileTap={{ scale: 0.98 }}
      className={cn(
        "group relative flex w-full items-start gap-3 rounded-2xl border p-4 text-left transition-colors duration-200",
        wide ? "col-span-full" : "col-span-1",
        selected
          ? "border-[#E8A84E]/55 bg-[#C9893A]/15 shadow-[inset_0_1px_0_rgba(255,248,240,0.08)]"
          : "border-[#5C4A32]/45 bg-[#1C1410]/60 hover:border-[#A07840]/70 hover:bg-[#3D3020]/40",
      )}
    >
      <span
        className={cn(
          "flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border transition-colors duration-200",
          selected
            ? "border-[#E8A84E]/45 bg-[#C9893A]/25 text-[#F2C078]"
            : "border-[#5C4A32]/50 bg-[#241A0E] text-[#A07840] group-hover:text-[#E8A84E]",
        )}
      >
        <Icon className="h-[18px] w-[18px]" strokeWidth={1.75} />
      </span>

      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-2">
          <span className={cn("text-[15px] font-semibold leading-tight", selected ? "text-[#FBE7C6]" : "text-zinc-100")}>
            {label}
          </span>
          {typeof count === "number" && count > 0 ? (
            <span className="rounded-full bg-[#C9893A]/30 px-2 py-0.5 font-mono text-[11px] font-bold text-[#F2C078]">
              {count}
            </span>
          ) : null}
        </span>
        {description ? (
          <span className="mt-1 block text-[13px] leading-snug text-zinc-400">{description}</span>
        ) : null}
      </span>

      <motion.span
        initial={false}
        animate={{ opacity: selected ? 1 : 0, scale: selected ? 1 : 0.6 }}
        transition={{ duration: 0.15 }}
        className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[#C9893A] text-[#1C1410]"
        aria-hidden={!selected}
      >
        <Check className="h-3.5 w-3.5" strokeWidth={3} />
      </motion.span>
    </motion.button>
  );
}
