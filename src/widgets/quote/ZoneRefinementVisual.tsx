"use client";

import Image from "next/image";
import type { SiteCopyKey } from "@/shared/i18n/siteLanguage";
import type { HeadPartId } from "@/shared/lib/headZoneParts";
import {
  getHeadDetailHotspots,
  getHeadReferenceImage,
  HEAD_PART_DETAIL_VIEW_LABEL_KEYS,
  HEAD_PART_LABEL_KEYS,
} from "@/shared/lib/headZoneParts";
import type { BackPartId } from "@/shared/lib/backZoneParts";
import {
  BACK_DETAIL_HOTSPOTS,
  BACK_DETAIL_IMAGE,
  BACK_PART_LABEL_KEYS,
} from "@/shared/lib/backZoneParts";
import {
  ARM_DETAIL_IMAGE,
  ARM_PART_LABEL_KEYS,
  getArmDetailHotspots,
  getArmVisibleFaces,
  isArmDetailHotspotActive,
  type ArmPartId,
  type ArmSelection,
} from "@/shared/lib/armZoneParts";
import {
  getLegDetailHotspots,
  getLegVisibleFaces,
  isLegDetailHotspotActive,
  shouldShowLegDetailHotspot,
  LEG_DETAIL_IMAGE,
  LEG_EXTENT_LABEL_KEYS,
  type LegExtentId,
  type LegSelection,
} from "@/shared/lib/legZoneParts";
import { DetailHotspot } from "@/widgets/quote/DetailHotspot";
import { BODY_REFERENCE_IMAGE_FRAME } from "@/widgets/quote/quoteRefinementUi";

export type FlowStepId =
  | "head-part"
  | "back-part"
  | "arm-laterality"
  | "arm-face"
  | "arm-part"
  | "leg-laterality"
  | "leg-face"
  | "leg-extent";

type ZoneRefinementVisualProps = {
  stepId: FlowStepId;
  headPart: HeadPartId | null;
  backPart: BackPartId | null;
  armSelection: ArmSelection | null;
  legSelection: LegSelection | null;
  highlightId: string | null;
  onSelectOption?: (id: string) => void;
  onHighlightOption?: (id: string | null) => void;
  t: (key: SiteCopyKey) => string;
};

function legExtentFromSpot(spotId: string): LegExtentId {
  if (spotId.includes("muslo")) return "muslo";
  return "pierna_baja";
}

function ReferenceImageFrame({
  src,
  alt,
  format = "portrait",
  viewLabel,
  children,
}: {
  src: string;
  alt: string;
  format?: "portrait" | "portrait-tall" | "landscape";
  viewLabel?: string;
  children?: React.ReactNode;
}) {
  const canvasClass =
    format === "landscape"
      ? "zone-refinement-visual__canvas zone-refinement-visual__canvas--landscape"
      : format === "portrait-tall"
        ? "zone-refinement-visual__canvas zone-refinement-visual__canvas--tall"
        : "zone-refinement-visual__canvas zone-refinement-visual__canvas--portrait";

  const sizes =
    format === "landscape"
      ? "(max-width: 640px) 100vw, 720px"
      : "(max-width: 640px) 100vw, 520px";

  return (
    <div className="zone-refinement-visual">
      {viewLabel ? (
        <p className="zone-refinement-visual__label">{viewLabel}</p>
      ) : null}
      <div className={`zone-refinement-visual__frame ${canvasClass} ${BODY_REFERENCE_IMAGE_FRAME}`}>
        <Image src={src} alt={alt} fill quality={95} sizes={sizes} className="object-contain" priority />
        {children}
      </div>
    </div>
  );
}

function hotspotHandlers(
  id: string,
  onSelectOption?: (id: string) => void,
  onHighlightOption?: (id: string | null) => void,
) {
  if (!onSelectOption) return {};

  return {
    onClick: () => onSelectOption(id),
    onPointerEnter: () => onHighlightOption?.(id),
    onPointerLeave: () => onHighlightOption?.(null),
    onFocus: () => onHighlightOption?.(id),
    onBlur: () => onHighlightOption?.(null),
  };
}

export function ZoneRefinementVisual({
  stepId,
  headPart,
  backPart,
  armSelection,
  legSelection,
  highlightId,
  onSelectOption,
  onHighlightOption,
  t,
}: ZoneRefinementVisualProps) {
  if (stepId === "head-part") {
    const guidePart = (headPart ?? highlightId ?? "frente") as HeadPartId;
    const src = getHeadReferenceImage(guidePart);
    const hotspots = getHeadDetailHotspots(src);
    const labelKey = headPart
      ? HEAD_PART_DETAIL_VIEW_LABEL_KEYS[headPart]
      : "quoteHeadPartPickPreview";

    return (
      <ReferenceImageFrame
        src={src}
        alt={t("quoteHeadPartScalpViewAlt")}
        format="portrait-tall"
        viewLabel={t(labelKey)}
      >
        {hotspots.map((spot, index) => (
          <DetailHotspot
            key={`${spot.id}-${index}`}
            className={spot.className}
            active={headPart === spot.id}
            preview={highlightId === spot.id && headPart !== spot.id}
            label={t(HEAD_PART_LABEL_KEYS[spot.id])}
            showInactive
            {...hotspotHandlers(spot.id, onSelectOption, onHighlightOption)}
          />
        ))}
      </ReferenceImageFrame>
    );
  }

  if (stepId === "back-part") {
    return (
      <ReferenceImageFrame
        src={BACK_DETAIL_IMAGE}
        alt={t("quoteBackPartDetailAlt")}
        format="portrait"
        viewLabel={t("quoteBackPartDetailLabel")}
      >
        {BACK_DETAIL_HOTSPOTS.map((spot) => (
          <DetailHotspot
            key={spot.id}
            className={spot.className}
            active={backPart === spot.id}
            preview={highlightId === spot.id && backPart !== spot.id}
            label={t(BACK_PART_LABEL_KEYS[spot.id])}
            showInactive
            {...hotspotHandlers(spot.id, onSelectOption, onHighlightOption)}
          />
        ))}
      </ReferenceImageFrame>
    );
  }

  if (stepId === "arm-part" && armSelection?.faceScope) {
    const faces = getArmVisibleFaces(armSelection.faceScope);
    const partHighlight = (armSelection.part ?? highlightId) as ArmPartId | null;

    return (
      <div className="zone-refinement-visual-stack">
        {faces.map((face) => {
          const detailHotspots = getArmDetailHotspots(face);

          return (
            <ReferenceImageFrame
              key={face}
              src={ARM_DETAIL_IMAGE[face]}
              alt={face === "interna" ? t("quoteArmPartDetailAltInner") : t("quoteArmPartDetailAlt")}
              format={face === "interna" ? "portrait" : "landscape"}
              viewLabel={
                face === "interna" ? t("quoteArmPartDetailLabelInner") : t("quoteArmPartDetailLabelOuter")
              }
            >
              {detailHotspots.map((spot) => (
                <DetailHotspot
                  key={`${face}-${spot.id}`}
                  className={spot.className}
                  active={partHighlight ? isArmDetailHotspotActive(spot.id, partHighlight) : false}
                  preview={
                    !armSelection.part &&
                    highlightId !== null &&
                    isArmDetailHotspotActive(spot.id, highlightId as ArmPartId)
                  }
                  label={t(ARM_PART_LABEL_KEYS[spot.id])}
                  showInactive
                  {...hotspotHandlers(spot.id, onSelectOption, onHighlightOption)}
                />
              ))}
            </ReferenceImageFrame>
          );
        })}
      </div>
    );
  }

  if (stepId === "arm-face" || stepId === "arm-laterality" || stepId === "arm-part") {
    const previewFace =
      armSelection?.faceScope === "interna"
        ? "interna"
        : armSelection?.faceScope === "externa"
          ? "externa"
          : "externa";

    return (
      <ReferenceImageFrame
        src={ARM_DETAIL_IMAGE[previewFace]}
        alt={
          previewFace === "interna" ? t("quoteArmPartDetailAltInner") : t("quoteArmPartDetailAlt")
        }
        format={previewFace === "interna" ? "portrait" : "landscape"}
        viewLabel={
          previewFace === "interna"
            ? t("quoteArmPartDetailLabelInner")
            : t("quoteArmPartDetailLabelOuter")
        }
      />
    );
  }

  if (stepId === "leg-extent" && legSelection?.faceScope && legSelection.laterality) {
    const faces = getLegVisibleFaces(legSelection.faceScope);
    const previewSelection: LegSelection = {
      ...legSelection,
      extent: (legSelection.extent ?? highlightId) as LegExtentId | undefined,
    };

    return (
      <div className="zone-refinement-visual-stack">
        {faces.map((face) => (
          <ReferenceImageFrame
            key={face}
            src={LEG_DETAIL_IMAGE[face]}
            alt={face === "posterior" ? t("quoteLegPartDetailAltPosterior") : t("quoteLegPartDetailAlt")}
            format="portrait"
            viewLabel={
              face === "posterior"
                ? t("quoteLegPartDetailLabelPosterior")
                : t("quoteLegPartDetailLabel")
            }
          >
            {getLegDetailHotspots(face).map((spot) => {
              if (!shouldShowLegDetailHotspot(spot, previewSelection)) return null;
              const extentKey = legExtentFromSpot(spot.id);
              return (
                <DetailHotspot
                  key={`${face}-${spot.laterality}-${spot.id}`}
                  className={spot.className}
                  active={isLegDetailHotspotActive(spot, previewSelection)}
                  preview={
                    !legSelection.extent &&
                    highlightId !== null &&
                    isLegDetailHotspotActive(spot, {
                      ...legSelection,
                      extent: highlightId as LegExtentId,
                    })
                  }
                  label={t(LEG_EXTENT_LABEL_KEYS[extentKey])}
                  showInactive
                  {...hotspotHandlers(extentKey, onSelectOption, onHighlightOption)}
                />
              );
            })}
          </ReferenceImageFrame>
        ))}
      </div>
    );
  }

  if (stepId === "leg-face" || stepId === "leg-laterality" || stepId === "leg-extent") {
    return (
      <ReferenceImageFrame
        src={LEG_DETAIL_IMAGE.anterior}
        alt={t("quoteLegPartDetailAlt")}
        format="portrait"
        viewLabel={t("quoteLegPartDetailLabel")}
      />
    );
  }

  return null;
}
