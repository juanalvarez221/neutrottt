"use client";

import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { useSiteLanguage } from "@/shared/i18n/LanguageProvider";
import type { SiteCopyKey } from "@/shared/i18n/siteLanguage";
import type { ZoneId } from "@/shared/lib/quoteZones";
import type { HeadPartId } from "@/shared/lib/headZoneParts";
import { HEAD_PART_LABEL_KEYS } from "@/shared/lib/headZoneParts";
import type { BackPartId } from "@/shared/lib/backZoneParts";
import { BACK_PART_IDS, BACK_PART_LABEL_KEYS } from "@/shared/lib/backZoneParts";
import {
  ARM_COVERAGE_PART_IDS,
  ARM_FACE_SCOPE_IDS,
  ARM_FACE_SCOPE_LABEL_KEYS,
  ARM_PART_LABEL_KEYS,
  ARM_PIECE_PART_IDS,
  isArmSelectionComplete,
  type ArmFaceScopeId,
  type ArmPartId,
  type ArmSelection,
} from "@/shared/lib/armZoneParts";
import {
  LEG_EXTENT_IDS,
  LEG_EXTENT_LABEL_KEYS,
  LEG_FACE_SCOPE_IDS,
  LEG_FACE_SCOPE_LABEL_KEYS,
  isLegSelectionComplete,
  type LegExtentId,
  type LegFaceScopeId,
  type LegSelection,
} from "@/shared/lib/legZoneParts";
import {
  ARM_LATERALITY_SIDE_IDS,
  LIMB_LATERALITY_IDS,
  LIMB_LATERALITY_LABEL_KEYS,
  type LimbLateralityId,
} from "@/shared/lib/limbLaterality";
import { PopupOptionButton, ZoneStepPopup } from "@/widgets/quote/ZoneStepPopup";
import { needsZoneRefinement } from "@/widgets/quote/ZoneFlowHelpers";
import { ZoneRefinementVisual, type FlowStepId } from "@/widgets/quote/ZoneRefinementVisual";

const HEAD_PART_IDS: HeadPartId[] = [
  "cuero_cabelludo",
  "frente",
  "sien",
  "lateral_derecho",
  "lateral_izquierdo",
  "detras_oreja",
  "nuca",
];

function getSelectedForStep(
  stepId: FlowStepId,
  headPart: HeadPartId | null,
  backPart: BackPartId | null,
  armSelection: ArmSelection | null,
  legSelection: LegSelection | null,
): string | null {
  switch (stepId) {
    case "head-part":
      return headPart;
    case "back-part":
      return backPart;
    case "arm-laterality":
      return armSelection?.laterality ?? null;
    case "arm-face":
      return armSelection?.faceScope ?? null;
    case "arm-part":
      return armSelection?.part ?? null;
    case "leg-laterality":
      return legSelection?.laterality ?? null;
    case "leg-face":
      return legSelection?.faceScope ?? null;
    case "leg-extent":
      return legSelection?.extent ?? null;
    default:
      return null;
  }
}

function stepsForZone(zone: ZoneId): FlowStepId[] {
  switch (zone) {
    case "cabeza":
      return ["head-part"];
    case "espalda":
      return ["back-part"];
    case "brazo":
      return ["arm-laterality", "arm-face", "arm-part"];
    case "pierna":
      return ["leg-laterality", "leg-face", "leg-extent"];
    default:
      return [];
  }
}

function isStepComplete(
  stepId: FlowStepId,
  headPart: HeadPartId | null,
  backPart: BackPartId | null,
  armSelection: ArmSelection | null,
  legSelection: LegSelection | null,
): boolean {
  switch (stepId) {
    case "head-part":
      return Boolean(headPart);
    case "back-part":
      return Boolean(backPart);
    case "arm-laterality":
      return Boolean(armSelection?.laterality);
    case "arm-face":
      return Boolean(armSelection?.faceScope);
    case "arm-part":
      return Boolean(armSelection?.part);
    case "leg-laterality":
      return Boolean(legSelection?.laterality);
    case "leg-face":
      return Boolean(legSelection?.faceScope);
    case "leg-extent":
      return Boolean(legSelection?.extent);
    default:
      return false;
  }
}

function firstIncompleteStepIndex(
  zone: ZoneId,
  headPart: HeadPartId | null,
  backPart: BackPartId | null,
  armSelection: ArmSelection | null,
  legSelection: LegSelection | null,
): number {
  const steps = stepsForZone(zone);
  const index = steps.findIndex(
    (stepId) => !isStepComplete(stepId, headPart, backPart, armSelection, legSelection),
  );
  return index >= 0 ? index : Math.max(0, steps.length - 1);
}

export function isZoneRefinementComplete(
  zone: ZoneId | null,
  headPart: HeadPartId | null,
  backPart: BackPartId | null,
  armSelection: ArmSelection | null,
  legSelection: LegSelection | null,
): boolean {
  if (!zone) return false;
  if (!needsZoneRefinement(zone)) return true;
  if (zone === "cabeza") return Boolean(headPart);
  if (zone === "espalda") return Boolean(backPart);
  if (zone === "brazo") return isArmSelectionComplete(armSelection);
  if (zone === "pierna") return isLegSelectionComplete(legSelection);
  return true;
}

type Props = {
  open: boolean;
  zone: ZoneId;
  headPart: HeadPartId | null;
  onHeadPartChange: (part: HeadPartId) => void;
  backPart: BackPartId | null;
  onBackPartChange: (part: BackPartId) => void;
  armSelection: ArmSelection | null;
  onArmSelectionChange: (selection: ArmSelection) => void;
  legSelection: LegSelection | null;
  onLegSelectionChange: (selection: LegSelection) => void;
  onClose: () => void;
  onComplete: () => void;
};

function patchArm(current: ArmSelection | null, patch: Partial<ArmSelection>): ArmSelection {
  return {
    laterality: patch.laterality ?? current?.laterality,
    faceScope: patch.faceScope ?? current?.faceScope,
    part: patch.part !== undefined ? patch.part : current?.part ?? null,
  };
}

function patchLeg(current: LegSelection | null, patch: Partial<LegSelection>): LegSelection {
  return {
    laterality: patch.laterality ?? current?.laterality,
    faceScope: patch.faceScope ?? current?.faceScope,
    extent: patch.extent ?? current?.extent,
  };
}

export function ZoneRefinementFlow({
  open,
  zone,
  headPart,
  onHeadPartChange,
  backPart,
  onBackPartChange,
  armSelection,
  onArmSelectionChange,
  legSelection,
  onLegSelectionChange,
  onClose,
  onComplete,
}: Props) {
  const { t } = useSiteLanguage();
  const steps = useMemo(() => stepsForZone(zone), [zone]);

  const [stepIndex, setStepIndex] = useState(() =>
    firstIncompleteStepIndex(zone, headPart, backPart, armSelection, legSelection),
  );
  const [hoveredOption, setHoveredOption] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setStepIndex(firstIncompleteStepIndex(zone, headPart, backPart, armSelection, legSelection));
  }, [open, zone, headPart, backPart, armSelection, legSelection]);

  const currentStepId = steps[stepIndex] ?? steps[0];
  const total = steps.length;

  useEffect(() => {
    setHoveredOption(null);
  }, [currentStepId]);

  const selectedForStep = getSelectedForStep(
    currentStepId,
    headPart,
    backPart,
    armSelection,
    legSelection,
  );
  const highlightId = hoveredOption ?? selectedForStep;

  const hoverProps = (id: string) => ({
    onHover: () => setHoveredOption(id),
    onHoverEnd: () => setHoveredOption(null),
  });

  const handleSelectOption = useCallback(
    (id: string) => {
      switch (currentStepId) {
        case "head-part":
          onHeadPartChange(id as HeadPartId);
          break;
        case "back-part":
          onBackPartChange(id as BackPartId);
          break;
        case "arm-laterality":
          onArmSelectionChange(patchArm(armSelection, { laterality: id as LimbLateralityId }));
          break;
        case "arm-face":
          onArmSelectionChange(patchArm(armSelection, { faceScope: id as ArmFaceScopeId }));
          break;
        case "arm-part":
          onArmSelectionChange(patchArm(armSelection, { part: id as ArmPartId }));
          break;
        case "leg-laterality":
          onLegSelectionChange(patchLeg(legSelection, { laterality: id as LimbLateralityId }));
          break;
        case "leg-face":
          onLegSelectionChange(patchLeg(legSelection, { faceScope: id as LegFaceScopeId }));
          break;
        case "leg-extent":
          onLegSelectionChange(patchLeg(legSelection, { extent: id as LegExtentId }));
          break;
        default:
          break;
      }
    },
    [
      armSelection,
      currentStepId,
      legSelection,
      onArmSelectionChange,
      onBackPartChange,
      onHeadPartChange,
      onLegSelectionChange,
    ],
  );

  const canConfirm = isStepComplete(
    currentStepId,
    headPart,
    backPart,
    armSelection,
    legSelection,
  );

  const isLastStep = stepIndex >= steps.length - 1;

  const handleConfirmStep = useCallback(() => {
    if (!canConfirm) return;
    if (stepIndex >= steps.length - 1) {
      onComplete();
      return;
    }
    setStepIndex((current) => current + 1);
  }, [canConfirm, onComplete, stepIndex, steps.length]);

  const visualPanel = (
    <ZoneRefinementVisual
      stepId={currentStepId}
      headPart={headPart}
      backPart={backPart}
      armSelection={armSelection}
      legSelection={legSelection}
      highlightId={highlightId}
      onSelectOption={handleSelectOption}
      onHighlightOption={setHoveredOption}
      t={t}
    />
  );

  const wrapOptions = (options: ReactNode) => (
    <div className="zone-step-popup__options">{options}</div>
  );

  const handleBack = () => {
    setStepIndex((current) => Math.max(0, current - 1));
  };

  const titleKeyForStep = (stepId: FlowStepId): SiteCopyKey => {
    switch (stepId) {
      case "head-part":
        return "quoteHeadPartTitle";
      case "back-part":
        return "quoteBackPartTitle";
      case "arm-laterality":
        return armSelection?.part === "hombro"
          ? "quoteLimbLateralityLabelShoulder"
          : "quoteLimbLateralityLabelArm";
      case "arm-face":
        return "quoteArmStepFace";
      case "arm-part":
        return "quoteArmStepZone";
      case "leg-laterality":
        return "quoteLimbLateralityLabelLeg";
      case "leg-face":
        return "quoteLegStepFace";
      case "leg-extent":
        return "quoteLegStepExtent";
      default:
        return "quoteHeadPartTitle";
    }
  };

  const subtitleKeyForStep = (stepId: FlowStepId): SiteCopyKey | null => {
    switch (stepId) {
      case "arm-laterality":
        return "quoteArmStepLateralityHint";
      case "arm-face":
        return "quoteArmStepFaceHint";
      case "leg-face":
        return "quoteLegStepFaceHint";
      case "leg-extent":
        return "quoteLegStepExtentHint";
      default:
        return null;
    }
  };

  const renderStep = () => {
    switch (currentStepId) {
      case "head-part":
        return wrapOptions(
          <>
            {HEAD_PART_IDS.map((id) => (
              <PopupOptionButton
                key={id}
                label={t(HEAD_PART_LABEL_KEYS[id])}
                active={headPart === id}
                {...hoverProps(id)}
                onClick={() => handleSelectOption(id)}
              />
            ))}
          </>,
        );

      case "back-part":
        return wrapOptions(
          <>
            {BACK_PART_IDS.map((id) => (
              <PopupOptionButton
                key={id}
                label={t(BACK_PART_LABEL_KEYS[id])}
                active={backPart === id}
                {...hoverProps(id)}
                onClick={() => handleSelectOption(id)}
              />
            ))}
          </>,
        );

      case "arm-laterality":
        return wrapOptions(
          <>
            {ARM_LATERALITY_SIDE_IDS.map((id) => (
              <PopupOptionButton
                key={id}
                label={t(LIMB_LATERALITY_LABEL_KEYS[id])}
                active={armSelection?.laterality === id}
                {...hoverProps(id)}
                onClick={() => handleSelectOption(id)}
              />
            ))}
          </>,
        );

      case "arm-face":
        return wrapOptions(
          <>
            {ARM_FACE_SCOPE_IDS.map((id) => (
              <PopupOptionButton
                key={id}
                label={t(ARM_FACE_SCOPE_LABEL_KEYS[id])}
                active={armSelection?.faceScope === id}
                {...hoverProps(id)}
                onClick={() => handleSelectOption(id)}
              />
            ))}
          </>,
        );

      case "arm-part":
        return wrapOptions(
          <>
            {ARM_PIECE_PART_IDS.map((id) => (
              <PopupOptionButton
                key={id}
                label={t(ARM_PART_LABEL_KEYS[id])}
                active={armSelection?.part === id}
                {...hoverProps(id)}
                onClick={() => handleSelectOption(id)}
              />
            ))}
            {ARM_COVERAGE_PART_IDS.map((id) => (
              <PopupOptionButton
                key={id}
                label={t(ARM_PART_LABEL_KEYS[id])}
                active={armSelection?.part === id}
                {...hoverProps(id)}
                onClick={() => handleSelectOption(id)}
              />
            ))}
          </>,
        );

      case "leg-laterality":
        return wrapOptions(
          <>
            {LIMB_LATERALITY_IDS.map((id) => (
              <PopupOptionButton
                key={id}
                label={t(LIMB_LATERALITY_LABEL_KEYS[id])}
                active={legSelection?.laterality === id}
                {...hoverProps(id)}
                onClick={() => handleSelectOption(id)}
              />
            ))}
          </>,
        );

      case "leg-face":
        return wrapOptions(
          <>
            {LEG_FACE_SCOPE_IDS.map((id) => (
              <PopupOptionButton
                key={id}
                label={t(LEG_FACE_SCOPE_LABEL_KEYS[id])}
                active={legSelection?.faceScope === id}
                {...hoverProps(id)}
                onClick={() => handleSelectOption(id)}
              />
            ))}
          </>,
        );

      case "leg-extent":
        return wrapOptions(
          <>
            {LEG_EXTENT_IDS.map((id) => (
              <PopupOptionButton
                key={id}
                label={t(LEG_EXTENT_LABEL_KEYS[id])}
                active={legSelection?.extent === id}
                {...hoverProps(id)}
                onClick={() => handleSelectOption(id)}
              />
            ))}
          </>,
        );

      default:
        return null;
    }
  };

  const subtitleKey = subtitleKeyForStep(currentStepId);
  const visualCompact =
    currentStepId === "arm-part" ||
    currentStepId === "head-part" ||
    currentStepId === "leg-extent";

  return (
    <ZoneStepPopup
      open={open}
      step={stepIndex + 1}
      total={total}
      title={t(titleKeyForStep(currentStepId))}
      subtitle={subtitleKey ? t(subtitleKey) : undefined}
      onClose={onClose}
      onBack={handleBack}
      canBack={stepIndex > 0}
      stepKey={`${zone}-${currentStepId}-${stepIndex}`}
      visual={visualPanel}
      visualCompact={visualCompact}
      confirmLabel={isLastStep ? t("quotePopupConfirm") : t("quotePopupNext")}
      onConfirm={handleConfirmStep}
      canConfirm={canConfirm}
    >
      {renderStep()}
    </ZoneStepPopup>
  );
}
