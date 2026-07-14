"use client";

import Image from "next/image";
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
import { SelectionSummary, BODY_REFERENCE_IMAGE_FRAME } from "@/widgets/quote/quoteRefinementUi";

type Props = {
  backPart: BackPartId | null;
  onBackPartChange: (part: BackPartId) => void;
};

export function BackZoneRefinement({ backPart, onBackPartChange }: Props) {
  const { t } = useSiteLanguage();

  return (
    <RefinementPanel titleKey="quoteBackPartTitle" hintKey="quoteBackPartHint">
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        {BACK_PART_IDS.map((id) => {
          const active = backPart === id;
          const label = t(BACK_PART_LABEL_KEYS[id]);
          return (
            <button
              key={id}
              type="button"
              onClick={() => onBackPartChange(id)}
              aria-pressed={active}
              className={[
                "connection-choice focus-ring min-h-[3.25rem]",
                active ? "connection-choice--selected" : "",
              ].join(" ")}
            >
              <span className="connection-choice__label">{label}</span>
              <span
                className={[
                  "connection-choice__indicator connection-choice__indicator--radio",
                  active ? "connection-choice__indicator--on" : "",
                ].join(" ")}
                aria-hidden
              >
                {active ? <span className="connection-choice__radio-dot" /> : null}
              </span>
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
          <p className="mt-1 text-center text-[11px] text-zinc-500">
            {t("quoteDetailViewHighlightHint")}
          </p>
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
          value="-"
          incomplete
          incompleteHint={t("quoteRefinementIncomplete")}
        />
      )}
    </RefinementPanel>
  );
}
