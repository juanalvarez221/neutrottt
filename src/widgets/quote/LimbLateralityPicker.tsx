"use client";

import { CircleDot } from "lucide-react";
import { useSiteLanguage } from "@/shared/i18n/LanguageProvider";
import {
  LIMB_LATERALITY_DESC_KEYS,
  LIMB_LATERALITY_IDS,
  LIMB_LATERALITY_LABEL_KEYS,
  type LimbLateralityId,
} from "@/shared/lib/limbLaterality";

type Props = {
  value: LimbLateralityId | null;
  onChange: (value: LimbLateralityId) => void;
  labelKey?: "quoteLimbLateralityLabel" | "quoteLimbLateralityLabelArm" | "quoteLimbLateralityLabelLeg";
  hideLabel?: boolean;
};

export function LimbLateralityPicker({
  value,
  onChange,
  labelKey = "quoteLimbLateralityLabel",
  hideLabel = false,
}: Props) {
  const { t } = useSiteLanguage();

  return (
    <div className="space-y-2">
      {hideLabel ? null : (
        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-zinc-500">{t(labelKey)}</p>
      )}
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
        {LIMB_LATERALITY_IDS.map((id) => (
          <button
            key={id}
            type="button"
            onClick={() => onChange(id)}
            aria-pressed={value === id}
            className={[
              "rounded-xl border px-4 py-3.5 text-left transition active:scale-[0.98]",
              value === id
                ? "border-stone-400/35 bg-stone-600/12 shadow-[inset_0_1px_0_rgba(255,248,240,0.06)]"
                : "border-white/10 bg-black/25 hover:border-stone-500/22 hover:bg-stone-600/8",
            ].join(" ")}
          >
            <span className="flex items-start gap-2">
              <CircleDot className="mt-0.5 h-4 w-4 shrink-0 opacity-70" strokeWidth={1.75} />
              <span className="min-w-0">
                <span className="block text-sm font-semibold text-zinc-50">
                  {t(LIMB_LATERALITY_LABEL_KEYS[id])}
                </span>
                <span className="mt-1 block text-xs leading-relaxed text-zinc-400">
                  {t(LIMB_LATERALITY_DESC_KEYS[id])}
                </span>
              </span>
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}
