"use client";

import Image from "next/image";
import { CircleDot } from "lucide-react";
import { useSiteLanguage } from "@/shared/i18n/LanguageProvider";
import type { SiteCopyKey } from "@/shared/i18n/siteLanguage";
import { LimbLateralityPicker } from "@/widgets/quote/LimbLateralityPicker";
import { DetailHotspot } from "@/widgets/quote/DetailHotspot";
import { RefinementPanel } from "@/widgets/quote/ZoneFlowHelpers";
import { RefinementStepHeader, SelectionSummary, BODY_REFERENCE_IMAGE_FRAME } from "@/widgets/quote/quoteRefinementUi";
import {
  ARM_COVERAGE_PART_IDS,
  ARM_DETAIL_IMAGE,
  ARM_FACE_SCOPE_DESC_KEYS,
  ARM_FACE_SCOPE_IDS,
  ARM_FACE_SCOPE_LABEL_KEYS,
  ARM_PART_LABEL_KEYS,
  ARM_PIECE_PART_IDS,
  getArmDetailHotspots,
  getArmVisibleFaces,
  isArmDetailHotspotActive,
  isArmSelectionComplete,
  type ArmFaceScopeId,
  type ArmPartId,
  type ArmSelection,
} from "@/shared/lib/armZoneParts";
import {
  LIMB_LATERALITY_LABEL_KEYS,
  type LimbLateralityId,
} from "@/shared/lib/limbLaterality";

type Props = {
  selection: ArmSelection | null;
  onSelectionChange: (selection: ArmSelection) => void;
};

function SelectionChip({
  active,
  label,
  onClick,
}: {
  active: boolean;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={[
        "inline-flex min-h-[44px] items-center gap-2 rounded-xl border px-3 py-2.5 text-left text-sm font-semibold transition active:scale-[0.98]",
        active
          ? "border-stone-400/35 bg-stone-600/14 text-stone-100"
          : "border-white/10 bg-white/5 text-zinc-200 hover:border-stone-500/22 hover:bg-stone-600/8",
      ].join(" ")}
    >
      <CircleDot className="h-4 w-4 shrink-0 opacity-70" strokeWidth={1.75} />
      {label}
    </button>
  );
}

function FaceScopeChip({
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

function patchSelection(current: ArmSelection | null, patch: Partial<ArmSelection>): ArmSelection {
  return {
    laterality: patch.laterality ?? current?.laterality,
    faceScope: patch.faceScope ?? current?.faceScope,
    part: patch.part !== undefined ? patch.part : current?.part ?? null,
  };
}

function buildSummary(
  t: (key: SiteCopyKey) => string,
  selection: ArmSelection & {
    laterality: LimbLateralityId;
    faceScope: ArmFaceScopeId;
    part: ArmPartId;
  },
): string {
  return [
    t(LIMB_LATERALITY_LABEL_KEYS[selection.laterality]),
    t(ARM_FACE_SCOPE_LABEL_KEYS[selection.faceScope]),
    t(ARM_PART_LABEL_KEYS[selection.part]),
  ].join(", ");
}

export function ArmZoneRefinement({ selection, onSelectionChange }: Props) {
  const { t } = useSiteLanguage();
  const hasLaterality = Boolean(selection?.laterality);
  const hasFace = Boolean(selection?.faceScope);
  const complete = isArmSelectionComplete(selection);
  const visibleFaces = selection?.faceScope ? getArmVisibleFaces(selection.faceScope) : [];

  const handleLaterality = (laterality: LimbLateralityId) => {
    onSelectionChange(patchSelection(selection, { laterality }));
  };

  const handleFaceScope = (faceScope: ArmFaceScopeId) => {
    onSelectionChange(patchSelection(selection, { faceScope }));
  };

  const handlePart = (part: ArmPartId) => {
    onSelectionChange(patchSelection(selection, { part }));
  };

  return (
    <RefinementPanel titleKey="quoteArmPartTitle" hintKey="quoteArmPartHint">
      <div className="space-y-2">
        <RefinementStepHeader
          step={1}
          total={3}
          title={t("quoteArmStepLaterality")}
          hint={t("quoteArmStepLateralityHint")}
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
            title={t("quoteArmStepFace")}
            hint={t("quoteArmStepFaceHint")}
            done={hasFace}
          />
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
            {ARM_FACE_SCOPE_IDS.map((id) => (
              <FaceScopeChip
                key={id}
                active={selection?.faceScope === id}
                label={t(ARM_FACE_SCOPE_LABEL_KEYS[id])}
                description={t(ARM_FACE_SCOPE_DESC_KEYS[id])}
                onClick={() => handleFaceScope(id)}
              />
            ))}
          </div>
        </div>
      ) : null}

      {hasLaterality && hasFace && selection ? (
        <div className="space-y-4">
          <RefinementStepHeader
            step={3}
            total={3}
            title={t("quoteArmStepZone")}
            hint={t("quoteArmStepZoneHint")}
            done={Boolean(selection.part)}
          />
          <div
            className={[
              "grid gap-3",
              visibleFaces.length > 1 ? "grid-cols-1 lg:grid-cols-2" : "grid-cols-1",
            ].join(" ")}
          >
            {visibleFaces.map((face) => {
              const detailSrc = ARM_DETAIL_IMAGE[face];
              const detailHotspots = getArmDetailHotspots(face);
              const detailAspect = face === "interna" ? "aspect-[3/4]" : "aspect-[16/9]";
              return (
                <div key={face} className="rounded-xl border border-white/10 bg-stone-600/8 p-3">
                  <div
                    className={`relative mx-auto ${detailAspect} w-full max-w-[min(100%,520px)] ${BODY_REFERENCE_IMAGE_FRAME}`}
                  >
                    <Image
                      src={detailSrc}
                      alt={
                        face === "interna"
                          ? t("quoteArmPartDetailAltInner")
                          : t("quoteArmPartDetailAlt")
                      }
                      fill
                      quality={95}
                      sizes="(max-width: 640px) 100vw, 520px"
                      className="object-contain"
                    />
                    {detailHotspots.map((spot) => {
                      const active = isArmDetailHotspotActive(spot.id, selection.part ?? null);
                      return (
                        <DetailHotspot
                          key={`${face}-${spot.id}`}
                          className={spot.className}
                          active={active}
                          label={t(ARM_PART_LABEL_KEYS[spot.id])}
                          onClick={() => handlePart(spot.id)}
                          showInactive
                        />
                      );
                    })}
                  </div>
                  <p className="mt-2 text-center text-xs font-semibold uppercase tracking-[0.14em] text-zinc-500">
                    {face === "interna"
                      ? t("quoteArmPartDetailLabelInner")
                      : t("quoteArmPartDetailLabelOuter")}
                  </p>
                  {selection.part ? (
                    <p className="mt-1 text-center text-[11px] text-zinc-500">
                      {t("quoteDetailViewHighlightHint")}
                    </p>
                  ) : null}
                </div>
              );
            })}
          </div>

          <div className="space-y-2">
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-zinc-500">
              {t("quoteArmPieceSection")}
            </p>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {ARM_PIECE_PART_IDS.map((id) => (
                <SelectionChip
                  key={id}
                  active={selection.part === id}
                  label={t(ARM_PART_LABEL_KEYS[id])}
                  onClick={() => handlePart(id)}
                />
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-zinc-500">
              {t("quoteArmCoverageSection")}
            </p>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
              {ARM_COVERAGE_PART_IDS.map((id) => (
                <SelectionChip
                  key={id}
                  active={selection.part === id}
                  label={t(ARM_PART_LABEL_KEYS[id])}
                  onClick={() => handlePart(id)}
                />
              ))}
            </div>
          </div>
        </div>
      ) : null}

      {complete && selection?.laterality && selection.faceScope && selection.part ? (
        <SelectionSummary
          label={t("quoteSelectionSummary")}
          value={buildSummary(t, selection as ArmSelection & {
            laterality: LimbLateralityId;
            faceScope: ArmFaceScopeId;
            part: ArmPartId;
          })}
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
