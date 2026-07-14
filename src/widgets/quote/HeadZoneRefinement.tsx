"use client";

import Image from "next/image";
import { CircleDot } from "lucide-react";
import { useSiteLanguage } from "@/shared/i18n/LanguageProvider";
import {
  getHeadDetailHotspots,
  getHeadReferenceImage,
  HEAD_PART_DETAIL_VIEW_ALT_KEYS,
  HEAD_PART_DETAIL_VIEW_LABEL_KEYS,
  HEAD_PART_LABEL_KEYS,
  type HeadPartId,
} from "@/shared/lib/headZoneParts";
import { DetailHotspot } from "@/widgets/quote/DetailHotspot";
import { RefinementPanel } from "@/widgets/quote/ZoneFlowHelpers";
import {
  BODY_REFERENCE_IMAGE_FRAME,
  RefinementStepHeader,
  SelectionSummary,
} from "@/widgets/quote/quoteRefinementUi";

const HEAD_GROUPS: {
  labelKey: "quoteHeadPartGroupUpper" | "quoteHeadPartGroupSides" | "quoteHeadPartGroupBack";
  ids: HeadPartId[];
}[] = [
  {
    labelKey: "quoteHeadPartGroupUpper",
    ids: ["cuero_cabelludo", "frente", "sien"],
  },
  {
    labelKey: "quoteHeadPartGroupSides",
    ids: ["lateral_derecho", "lateral_izquierdo", "detras_oreja"],
  },
  {
    labelKey: "quoteHeadPartGroupBack",
    ids: ["nuca"],
  },
];

type Props = {
  headPart: HeadPartId | null;
  onHeadPartChange: (part: HeadPartId) => void;
};

export function HeadZoneRefinement({ headPart, onHeadPartChange }: Props) {
  const { t } = useSiteLanguage();

  const detailSrc = getHeadReferenceImage(headPart);
  const detailHotspots = getHeadDetailHotspots(detailSrc);

  const detailLabelKey = headPart
    ? HEAD_PART_DETAIL_VIEW_LABEL_KEYS[headPart]
    : undefined;

  const detailAltKey = headPart
    ? HEAD_PART_DETAIL_VIEW_ALT_KEYS[headPart]
    : "quoteHeadPartScalpViewAlt";

  return (
    <RefinementPanel titleKey="quoteHeadPartTitle" hintKey="quoteHeadPartHint">
      <RefinementStepHeader
        step={1}
        total={1}
        title={t("quoteHeadPartTitle")}
        done={Boolean(headPart)}
      />

      <div className="rounded-xl border border-white/10 bg-stone-600/8 p-3">
        <div
          className={`relative mx-auto aspect-[4/5] w-full max-w-[min(100%,280px)] ${BODY_REFERENCE_IMAGE_FRAME}`}
        >
          <Image
            src={detailSrc}
            alt={t(detailAltKey)}
            fill
            quality={95}
            sizes="(max-width: 640px) 260px, 280px"
            className="object-contain"
          />

          {detailHotspots.map((spot, index) => (
            <DetailHotspot
              key={`${spot.id}-${index}`}
              className={spot.className}
              active={headPart === spot.id}
              label={t(HEAD_PART_LABEL_KEYS[spot.id])}
              onClick={() => onHeadPartChange(spot.id)}
              showInactive
            />
          ))}
        </div>

        <p className="mt-2 text-center text-xs font-semibold uppercase tracking-[0.14em] text-zinc-500">
          {detailLabelKey ? t(detailLabelKey) : t("quoteHeadPartPickPreview")}
        </p>

        {headPart ? (
          <p className="mt-1 text-center text-[11px] text-zinc-500">
            {t("quoteDetailViewHighlightHint")}
          </p>
        ) : null}
      </div>

      <div className="space-y-4">
        {HEAD_GROUPS.map((group) => (
          <div key={group.labelKey} className="space-y-2">
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-zinc-500">
              {t(group.labelKey)}
            </p>

            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {group.ids.map((id) => {
                const active = headPart === id;

                return (
                  <button
                    key={id}
                    type="button"
                    onClick={() => onHeadPartChange(id)}
                    aria-pressed={active}
                    className={[
                      "inline-flex min-h-[44px] items-center gap-2 rounded-xl border px-3 py-2.5 text-left text-sm font-semibold transition active:scale-[0.98]",
                      active
                        ? "border-stone-400/35 bg-stone-600/14 text-stone-100"
                        : "border-white/10 bg-white/5 text-zinc-200 hover:border-stone-500/22 hover:bg-stone-600/8",
                    ].join(" ")}
                  >
                    <CircleDot
                      className="h-4 w-4 shrink-0 opacity-70"
                      strokeWidth={1.75}
                    />
                    {t(HEAD_PART_LABEL_KEYS[id])}
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      {headPart ? (
        <SelectionSummary
          label={t("quoteSelectionSummary")}
          value={t(HEAD_PART_LABEL_KEYS[headPart])}
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