"use client";

import Image from "next/image";
import { CircleDot } from "lucide-react";
import { useSiteLanguage } from "@/shared/i18n/LanguageProvider";
import { LimbLateralityPicker } from "@/widgets/quote/LimbLateralityPicker";
import { DetailHotspot } from "@/widgets/quote/DetailHotspot";
import { RefinementPanel } from "@/widgets/quote/ZoneFlowHelpers";
import { RefinementStepHeader, SelectionSummary, BODY_REFERENCE_IMAGE_FRAME } from "@/widgets/quote/quoteRefinementUi";
import {
  getLegDetailHotspots,
  getLegVisibleFaces,
  isLegDetailHotspotActive,
  isLegSelectionComplete,
  shouldShowLegDetailHotspot,
  LEG_DETAIL_IMAGE,
  LEG_EXTENT_DESC_KEYS,
  LEG_EXTENT_IDS,
  LEG_EXTENT_LABEL_KEYS,
  LEG_FACE_SCOPE_DESC_KEYS,
  LEG_FACE_SCOPE_IDS,
  LEG_FACE_SCOPE_LABEL_KEYS,
  LEG_PART_LABEL_KEYS,
  type LegExtentId,
  type LegFaceScopeId,
  type LegSelection,
} from "@/shared/lib/legZoneParts";
import type { SiteCopyKey } from "@/shared/i18n/siteLanguage";
import {
  LIMB_LATERALITY_LABEL_KEYS,
  type LimbLateralityId,
} from "@/shared/lib/limbLaterality";

type Props = {
  selection: LegSelection | null;
  onSelectionChange: (selection: LegSelection) => void;
};

function OptionChip({
  active,
  label,
  description,
  onClick,
}: {
  active: boolean;
  label: string;
  description: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={[
        "rounded-xl border px-4 py-3.5 text-left transition active:scale-[0.98]",
        active
          ? "border-stone-400/35 bg-stone-600/12 shadow-[inset_0_1px_0_rgba(255,248,240,0.06)]"
          : "border-white/10 bg-black/25 hover:border-stone-500/22 hover:bg-stone-600/8",
      ].join(" ")}
    >
      <span className="flex items-start gap-2">
        <CircleDot className="mt-0.5 h-4 w-4 shrink-0 opacity-70" strokeWidth={1.75} />
        <span className="min-w-0">
          <span className="block text-sm font-semibold text-zinc-50">{label}</span>
          <span className="mt-1 block text-xs leading-relaxed text-zinc-400">{description}</span>
        </span>
      </span>
    </button>
  );
}

function patchSelection(
  current: LegSelection | null,
  patch: Partial<LegSelection>,
): LegSelection {
  return {
    laterality: patch.laterality ?? current?.laterality ?? "ambas",
    faceScope: patch.faceScope ?? current?.faceScope ?? "anterior",
    extent: patch.extent ?? current?.extent ?? "completa",
  };
}

function buildSummary(t: (key: SiteCopyKey) => string, selection: LegSelection): string {
  return [
    t(LIMB_LATERALITY_LABEL_KEYS[selection.laterality]),
    t(LEG_FACE_SCOPE_LABEL_KEYS[selection.faceScope]),
    t(LEG_EXTENT_LABEL_KEYS[selection.extent]),
  ].join(" — ");
}

export function LegZoneRefinement({ selection, onSelectionChange }: Props) {
  const { t } = useSiteLanguage();
  const hasLaterality = Boolean(selection?.laterality);
  const complete = isLegSelectionComplete(selection);
  const visibleFaces = selection ? getLegVisibleFaces(selection.faceScope) : [];

  const handleLaterality = (laterality: LimbLateralityId) => {
    onSelectionChange(patchSelection(selection, { laterality }));
  };

  const handleFaceScope = (faceScope: LegFaceScopeId) => {
    onSelectionChange(patchSelection(selection, { faceScope }));
  };

  const handleExtent = (extent: LegExtentId) => {
    onSelectionChange(patchSelection(selection, { extent }));
  };

  return (
    <RefinementPanel titleKey="quoteLegPartTitle" hintKey="quoteLegPartHint">
      <div className="space-y-2">
        <RefinementStepHeader
          step={1}
          total={3}
          title={t("quoteLegStepLaterality")}
          hint={t("quoteLegStepLateralityHint")}
          done={hasLaterality}
        />
        <LimbLateralityPicker
          value={selection?.laterality ?? null}
          onChange={handleLaterality}
          hideLabel
        />
      </div>

      {hasLaterality ? (
        <div className="space-y-2">
          <RefinementStepHeader
            step={2}
            total={3}
            title={t("quoteLegStepFace")}
            hint={t("quoteLegStepFaceHint")}
            done={Boolean(selection?.faceScope)}
          />
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
            {LEG_FACE_SCOPE_IDS.map((id) => (
              <OptionChip
                key={id}
                active={selection?.faceScope === id}
                label={t(LEG_FACE_SCOPE_LABEL_KEYS[id])}
                description={t(LEG_FACE_SCOPE_DESC_KEYS[id])}
                onClick={() => handleFaceScope(id)}
              />
            ))}
          </div>
        </div>
      ) : null}

      {hasLaterality ? (
        <div className="space-y-2">
          <RefinementStepHeader
            step={3}
            total={3}
            title={t("quoteLegStepExtent")}
            hint={t("quoteLegStepExtentHint")}
            done={Boolean(selection?.extent)}
          />
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
            {LEG_EXTENT_IDS.map((id) => (
              <OptionChip
                key={id}
                active={selection?.extent === id}
                label={t(LEG_EXTENT_LABEL_KEYS[id])}
                description={t(LEG_EXTENT_DESC_KEYS[id])}
                onClick={() => handleExtent(id)}
              />
            ))}
          </div>
        </div>
      ) : null}

      {hasLaterality && selection && visibleFaces.length > 0 ? (
        <div
          className={[
            "grid gap-3",
            visibleFaces.length > 1 ? "grid-cols-1 md:grid-cols-2" : "grid-cols-1",
          ].join(" ")}
        >
          {visibleFaces.map((face) => {
            const detailSrc = LEG_DETAIL_IMAGE[face];
            const hotspots = getLegDetailHotspots(face);
            return (
              <div key={face} className="rounded-xl border border-white/10 bg-stone-600/8 p-3">
                <div
                  className={`relative mx-auto aspect-[3/4] w-full max-w-[min(100%,280px)] ${BODY_REFERENCE_IMAGE_FRAME}`}
                >
                  <Image
                    src={detailSrc}
                    alt={
                      face === "posterior"
                        ? t("quoteLegPartDetailAltPosterior")
                        : t("quoteLegPartDetailAlt")
                    }
                    fill
                    quality={95}
                    sizes="(max-width: 640px) 280px, 280px"
                    className="object-contain"
                  />
                  {hotspots.map((spot) => {
                    if (!shouldShowLegDetailHotspot(spot, selection)) return null;
                    const active = isLegDetailHotspotActive(spot, selection);
                    const sideLabel = t(LIMB_LATERALITY_LABEL_KEYS[spot.laterality]);
                    const partLabel = t(LEG_PART_LABEL_KEYS[spot.id]);
                    return (
                      <DetailHotspot
                        key={`${face}-${spot.laterality}-${spot.id}`}
                        className={spot.className}
                        active={active}
                        label={active ? `${sideLabel} · ${partLabel}` : partLabel}
                        showInactive
                      />
                    );
                  })}
                </div>
                <p className="mt-2 text-center text-xs font-semibold uppercase tracking-[0.14em] text-zinc-500">
                  {face === "posterior"
                    ? t("quoteLegPartDetailLabelPosterior")
                    : t("quoteLegPartDetailLabel")}
                </p>
                {selection.extent ? (
                  <p className="mt-1 text-center text-[11px] text-zinc-500">
                    {t("quoteDetailViewHighlightHint")}
                  </p>
                ) : null}
              </div>
            );
          })}
        </div>
      ) : null}

      {complete && selection ? (
        <SelectionSummary label={t("quoteSelectionSummary")} value={buildSummary(t, selection)} />
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
