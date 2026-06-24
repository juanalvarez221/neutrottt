"use client";

import Image from "next/image";
import { CircleDot } from "lucide-react";
import { useSiteLanguage } from "@/shared/i18n/LanguageProvider";
import {
  BACK_DETAIL_HOTSPOTS,
  BACK_DETAIL_IMAGE,
  BACK_PART_IDS,
  BACK_PART_LABEL_KEYS,
  type BackPartId,
} from "@/shared/lib/backZoneParts";
import { DetailHotspot } from "@/widgets/quote/DetailHotspot";
import { RefinementPanel } from "@/widgets/quote/ZoneFlowHelpers";
import { RefinementStepHeader, SelectionSummary, BODY_REFERENCE_IMAGE_FRAME } from "@/widgets/quote/quoteRefinementUi";

type Props = {
  backPart: BackPartId | null;
  onBackPartChange: (part: BackPartId) => void;
};

export function BackZoneRefinement({ backPart, onBackPartChange }: Props) {
  const { t } = useSiteLanguage();

  return (
    <RefinementPanel titleKey="quoteBackPartTitle" hintKey="quoteBackPartHint">
      <RefinementStepHeader
        step={1}
        total={1}
        title={t("quoteBackPartTitle")}
        hint={t("quoteBackPartHint")}
        done={Boolean(backPart)}
      />

      <div className="grid grid-cols-2 gap-2">
        {BACK_PART_IDS.map((id) => {
          const active = backPart === id;
          return (
            <button
              key={id}
              type="button"
              onClick={() => onBackPartChange(id)}
              aria-pressed={active}
              className={[
                "inline-flex min-h-[44px] items-center gap-2 rounded-xl border px-3 py-2.5 text-left text-sm font-semibold transition active:scale-[0.98]",
                active
                  ? "border-stone-400/35 bg-stone-600/14 text-stone-100"
                  : "border-white/10 bg-white/5 text-zinc-200 hover:border-stone-500/22 hover:bg-stone-600/8",
              ].join(" ")}
            >
              <CircleDot className="h-4 w-4 shrink-0 opacity-70" strokeWidth={1.75} />
              {t(BACK_PART_LABEL_KEYS[id])}
            </button>
          );
        })}
      </div>

      <div className="rounded-xl border border-white/10 bg-stone-600/8 p-3">
        <div
          className={`relative mx-auto aspect-[3/4] w-full max-w-[min(100%,300px)] ${BODY_REFERENCE_IMAGE_FRAME}`}
        >
          <Image
            src={BACK_DETAIL_IMAGE}
            alt={t("quoteBackPartDetailAlt")}
            fill
            quality={95}
            sizes="(max-width: 640px) 280px, 300px"
            className="object-contain"
          />
          {BACK_DETAIL_HOTSPOTS.map((spot) => {
            const active = backPart === spot.id;
            const label = t(BACK_PART_LABEL_KEYS[spot.id]);
            return (
              <DetailHotspot
                key={spot.id}
                className={spot.className}
                active={active}
                label={label}
                onClick={() => onBackPartChange(spot.id)}
                showInactive
              />
            );
          })}
        </div>
        <p className="mt-2 text-center text-xs font-semibold uppercase tracking-[0.14em] text-zinc-500">
          {t("quoteBackPartDetailLabel")}
        </p>
        {backPart ? (
          <p className="mt-1 text-center text-[11px] text-zinc-500">{t("quoteDetailViewHighlightHint")}</p>
        ) : null}
      </div>

      {backPart ? (
        <SelectionSummary
          label={t("quoteSelectionSummary")}
          value={t(BACK_PART_LABEL_KEYS[backPart])}
        />
      ) : (
        <SelectionSummary
          label={t("quoteSelectionSummary")}
          value="—"
          incomplete
          incompleteHint={t("quoteRefinementIncomplete")}
        />
      )}
    </RefinementPanel>
  );
}
