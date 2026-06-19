"use client";

import { AnimatePresence, motion } from "framer-motion";
import { MapPin, X } from "lucide-react";

export interface SummaryChip {
  id: string;
  label: string;
  /** Committed chips can be removed; the live draft chip resets the flow. */
  removable: boolean;
}

export function SelectionSummary({
  chips,
  onRemove,
}: {
  chips: SummaryChip[];
  onRemove: (id: string) => void;
}) {
  if (chips.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-[#5C4A32]/50 bg-[#1C1410]/40 px-4 py-3">
        <p className="text-[13px] leading-relaxed text-zinc-500">
          Aún no hay zona seleccionada. Tu elección aparecerá aquí en tiempo real.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <AnimatePresence initial={false}>
        {chips.map((chip) => (
          <motion.div
            key={chip.id}
            layout
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
            className="flex items-center gap-2.5 rounded-2xl border border-[#A07840]/35 bg-[#C9893A]/12 px-3.5 py-2.5"
          >
            <MapPin className="h-4 w-4 shrink-0 text-[#E8A84E]" strokeWidth={1.75} />
            <span className="min-w-0 flex-1 truncate text-[13px] font-medium text-[#FBE7C6]">
              {chip.label}
            </span>
            <button
              type="button"
              onClick={() => onRemove(chip.id)}
              aria-label="Quitar selección"
              className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[#A07840] transition-colors hover:bg-[#3D3020]/60 hover:text-[#E8A84E]"
            >
              <X className="h-3.5 w-3.5" strokeWidth={2.25} />
            </button>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}
