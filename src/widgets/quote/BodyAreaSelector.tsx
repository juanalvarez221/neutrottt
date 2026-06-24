"use client";

import Image from "next/image";
import type { CSSProperties } from "react";
import { Bone, CircleDot, MapPin, PersonStanding, Sparkles } from "lucide-react";
import { useSiteLanguage } from "@/shared/i18n/LanguageProvider";
import {
  formatZoneDisplay,
  ZONE_LABEL_KEYS,
  type ZoneId,
} from "@/shared/lib/quoteZones";
import {
  ARM_DETAIL_IMAGE,
  ARM_FACE_SCOPE_DESC_KEYS,
  ARM_FACE_SCOPE_IDS,
  ARM_FACE_SCOPE_LABEL_KEYS,
  ARM_PART_IDS,
  ARM_PART_LABEL_KEYS,
  getArmDetailHotspots,
  getArmVisibleFaces,
  inferArmSelectionFromBodySpot,
  isArmBodyMapSpotActive,
  isArmDetailHotspotActive,
  isArmSelectionComplete,
  type ArmFaceScopeId,
  type ArmPartId,
  type ArmSelection,
} from "@/shared/lib/armZoneParts";
import {
  LEG_DETAIL_IMAGE,
  LEG_EXTENT_DESC_KEYS,
  LEG_EXTENT_IDS,
  LEG_EXTENT_LABEL_KEYS,
  LEG_FACE_SCOPE_DESC_KEYS,
  LEG_FACE_SCOPE_IDS,
  LEG_FACE_SCOPE_LABEL_KEYS,
  getLegDetailHotspots,
  getLegVisibleFaces,
  inferLegSelectionFromBodySpot,
  inferLegSelectionFromPartClick,
  isLegBodyMapSpotActive,
  isLegDetailHotspotActive,
  isLegSelectionComplete,
  shouldShowLegDetailHotspot,
  type LegExtentId,
  type LegFaceScopeId,
  type LegPartId,
  type LegSelection,
} from "@/shared/lib/legZoneParts";
import {
  LIMB_LATERALITY_LABEL_KEYS,
  type BodyMapLaterality,
  type LimbLateralityId,
} from "@/shared/lib/limbLaterality";
import type { HeadPartId } from "@/shared/lib/headZoneParts";
import type { BackPartId } from "@/shared/lib/backZoneParts";
import { HeadZoneRefinement } from "@/widgets/quote/HeadZoneRefinement";
import { BackZoneRefinement } from "@/widgets/quote/BackZoneRefinement";
import { DetailHotspot } from "@/widgets/quote/DetailHotspot";
import { RefinementPanel } from "@/widgets/quote/ZoneFlowHelpers";
import {
  BODY_REFERENCE_IMAGE_FRAME,
  RefinementStepHeader,
  SelectionSummary,
} from "@/widgets/quote/quoteRefinementUi";
import { getBodyMapViewLabel } from "@/widgets/quote/bodyMapViewLabels";

export type { ZoneId };

type BodyMapSide = "front" | "back";

type BodyHotspot = {
  id: ZoneId;
  className: string;
  style?: CSSProperties;
  laterality?: BodyMapLaterality;
  legPart?: LegPartId;
};

type Props = {
  zone: ZoneId;
  onZoneChange: (zone: ZoneId) => void;
  zoneOther: string;
  onZoneOtherChange: (value: string) => void;
  headPart: HeadPartId | null;
  onHeadPartChange: (part: HeadPartId) => void;
  backPart: BackPartId | null;
  onBackPartChange: (part: BackPartId) => void;
  armSelection: ArmSelection | null;
  onArmSelectionChange: (selection: ArmSelection) => void;
  legSelection: LegSelection | null;
  onLegSelectionChange: (selection: LegSelection) => void;
};

const GENERAL_ZONE_IDS: ZoneId[] = [
  "cabeza",
  "hombro",
  "pecho",
  "abdomen",
  "espalda",
  "brazo",
  "pierna",
  "gluteo",
  "otro",
];

const ARM_BODY_ZONE_IDS: ZoneId[] = ["hombro", "bicep", "tricep", "antebrazo"];

const LIMB_LATERALITY_IDS: LimbLateralityId[] = ["izquierda", "derecha", "ambas"];

const FRONT_HOTSPOTS: BodyHotspot[] = [
  {
    id: "cabeza",
    className: "left-[43.2%] top-[4.6%] h-[10.4%] w-[13.8%] rounded-[999px]",
  },
  {
    id: "hombro",
    laterality: "derecha",
    className: "left-[30.2%] top-[18.1%] h-[5.8%] w-[10.6%] rounded-[999px]",
  },
  {
    id: "hombro",
    laterality: "izquierda",
    className: "left-[59.2%] top-[18.1%] h-[5.8%] w-[10.6%] rounded-[999px]",
  },
  {
    id: "pecho",
    className: "left-[37.2%] top-[24.4%] h-[9.4%] w-[25.8%] rounded-[28%]",
  },
  {
    id: "abdomen",
    className: "left-[39.2%] top-[35.2%] h-[12.8%] w-[21.6%] rounded-[24%]",
  },
  {
    id: "bicep",
    laterality: "derecha",
    className: "left-[25.6%] top-[24.6%] h-[12.8%] w-[8.1%] rounded-[999px]",
    style: { transform: "rotate(-9deg)" },
  },
  {
    id: "bicep",
    laterality: "izquierda",
    className: "left-[66.3%] top-[24.6%] h-[12.8%] w-[8.1%] rounded-[999px]",
    style: { transform: "rotate(9deg)" },
  },
  {
    id: "antebrazo",
    laterality: "derecha",
    className: "left-[20.8%] top-[37.1%] h-[15.1%] w-[7.4%] rounded-[999px]",
    style: { transform: "rotate(-8deg)" },
  },
  {
    id: "antebrazo",
    laterality: "izquierda",
    className: "left-[71.7%] top-[37.1%] h-[15.1%] w-[7.4%] rounded-[999px]",
    style: { transform: "rotate(8deg)" },
  },
  {
    id: "pierna",
    laterality: "derecha",
    legPart: "muslo_anterior",
    className: "left-[40.1%] top-[56.2%] h-[17.8%] w-[8.8%] rounded-[26%]",
  },
  {
    id: "pierna",
    laterality: "izquierda",
    legPart: "muslo_anterior",
    className: "left-[51.1%] top-[56.2%] h-[17.8%] w-[8.8%] rounded-[26%]",
  },
  {
    id: "pierna",
    laterality: "derecha",
    legPart: "pierna_anterior",
    className: "left-[40%] top-[74.2%] h-[17.9%] w-[8%] rounded-[24%]",
  },
  {
    id: "pierna",
    laterality: "izquierda",
    legPart: "pierna_anterior",
    className: "left-[51.9%] top-[74.2%] h-[17.9%] w-[8%] rounded-[24%]",
  },
];

const BACK_HOTSPOTS: BodyHotspot[] = [
  {
    id: "cabeza",
    className: "left-[43.2%] top-[4.6%] h-[10.4%] w-[13.8%] rounded-[999px]",
  },
  {
    id: "hombro",
    laterality: "izquierda",
    className: "left-[30.2%] top-[18.1%] h-[5.8%] w-[10.6%] rounded-[999px]",
  },
  {
    id: "hombro",
    laterality: "derecha",
    className: "left-[59.2%] top-[18.1%] h-[5.8%] w-[10.6%] rounded-[999px]",
  },
  {
    id: "espalda",
    className: "left-[35.2%] top-[22.6%] h-[23.2%] w-[29.8%] rounded-[24%]",
  },
  {
    id: "tricep",
    laterality: "izquierda",
    className: "left-[25.8%] top-[24.9%] h-[12.4%] w-[8%] rounded-[999px]",
    style: { transform: "rotate(-9deg)" },
  },
  {
    id: "tricep",
    laterality: "derecha",
    className: "left-[66.2%] top-[24.9%] h-[12.4%] w-[8%] rounded-[999px]",
    style: { transform: "rotate(9deg)" },
  },
  {
    id: "antebrazo",
    laterality: "izquierda",
    className: "left-[20.9%] top-[37.2%] h-[15%] w-[7.4%] rounded-[999px]",
    style: { transform: "rotate(-8deg)" },
  },
  {
    id: "antebrazo",
    laterality: "derecha",
    className: "left-[71.7%] top-[37.2%] h-[15%] w-[7.4%] rounded-[999px]",
    style: { transform: "rotate(8deg)" },
  },
  {
    id: "gluteo",
    laterality: "izquierda",
    className: "left-[39.1%] top-[47.9%] h-[8.1%] w-[10.2%] rounded-[42%]",
  },
  {
    id: "gluteo",
    laterality: "derecha",
    className: "left-[50.5%] top-[47.9%] h-[8.1%] w-[10.2%] rounded-[42%]",
  },
  {
    id: "pierna",
    laterality: "izquierda",
    legPart: "muslo_posterior",
    className: "left-[40.1%] top-[56.2%] h-[17.8%] w-[8.8%] rounded-[26%]",
  },
  {
    id: "pierna",
    laterality: "derecha",
    legPart: "muslo_posterior",
    className: "left-[51.1%] top-[56.2%] h-[17.8%] w-[8.8%] rounded-[26%]",
  },
  {
    id: "pierna",
    laterality: "izquierda",
    legPart: "pierna_posterior",
    className: "left-[40%] top-[74.2%] h-[17.9%] w-[8%] rounded-[24%]",
  },
  {
    id: "pierna",
    laterality: "derecha",
    legPart: "pierna_posterior",
    className: "left-[51.9%] top-[74.2%] h-[17.9%] w-[8%] rounded-[24%]",
  },
];

const BODY_HOTSPOTS: Record<BodyMapSide, BodyHotspot[]> = {
  front: FRONT_HOTSPOTS,
  back: BACK_HOTSPOTS,
};

const BODY_IMAGE: Record<BodyMapSide, string> = {
  front: "/body/body-map-front.png",
  back: "/body/body-map-back.png",
};

function isArmBodyZone(id: ZoneId): boolean {
  return ARM_BODY_ZONE_IDS.includes(id);
}

function getZoneIcon(id: ZoneId) {
  if (id === "espalda") return <PersonStanding className="h-4 w-4" />;
  if (id === "pecho") return <Bone className="h-4 w-4" />;
  if (id === "brazo" || id === "pierna") return <MapPin className="h-4 w-4" />;
  return <CircleDot className="h-4 w-4" />;
}

function optionButtonClass(active: boolean) {
  return [
    "inline-flex min-h-[44px] items-center gap-2 rounded-xl border px-3 py-2.5 text-left text-sm font-semibold transition active:scale-[0.98]",
    active
      ? "border-stone-400/35 bg-stone-600/14 text-stone-100 shadow-[0_0_18px_rgba(107,99,92,0.16)]"
      : "border-white/10 bg-white/5 text-zinc-200 hover:border-stone-500/22 hover:bg-stone-600/8",
  ].join(" ");
}

function BodyMapImage({
  side,
  zone,
  armSelection,
  legSelection,
  onSpotClick,
}: {
  side: BodyMapSide;
  zone: ZoneId;
  armSelection: ArmSelection | null;
  legSelection: LegSelection | null;
  onSpotClick: (spot: BodyHotspot, side: BodyMapSide) => void;
}) {
  const { t, language } = useSiteLanguage();

  function isSpotActive(spot: BodyHotspot) {
    if (zone === "brazo") {
      if (
        isArmBodyMapSpotActive(
          side,
          spot.id,
          spot.laterality,
          armSelection,
        )
      ) {
        return true;
      }

      if (!armSelection?.part && isArmBodyZone(spot.id)) {
        return true;
      }
    }

    if (zone === "pierna") {
      if (
        isLegBodyMapSpotActive(
          side,
          spot.legPart,
          spot.laterality,
          legSelection,
        )
      ) {
        return true;
      }

      if (!legSelection && spot.id === "pierna") {
        return true;
      }
    }

    return zone === spot.id;
  }

  return (
    <div className="glass-card relative overflow-hidden rounded-2xl p-3">
      <div className="relative mx-auto aspect-[3/4] w-full max-w-[min(100%,330px)] overflow-hidden rounded-xl border border-white/12 bg-black/20">
        <Image
          src={BODY_IMAGE[side]}
          alt={
            side === "front"
              ? language === "en"
                ? "Front body map"
                : "Mapa corporal frontal"
              : language === "en"
                ? "Back body map"
                : "Mapa corporal posterior"
          }
          fill
          quality={100}
          sizes="(max-width: 640px) 300px, 330px"
          className="object-contain"
          priority
        />

        {BODY_HOTSPOTS[side].map((spot, index) => {
          const active = isSpotActive(spot);
          const label = t(ZONE_LABEL_KEYS[spot.id]);

          return (
            <button
              key={`${side}-${spot.id}-${spot.laterality ?? "center"}-${spot.legPart ?? "body"}-${index}`}
              type="button"
              onClick={() => onSpotClick(spot, side)}
              aria-label={label}
              aria-pressed={active}
              style={spot.style}
              className={[
                "absolute z-10 border transition-all duration-200 outline-none",
                "focus-visible:ring-2 focus-visible:ring-stone-400/70",
                spot.className,
                active
                  ? "border-stone-200/90 bg-stone-500/25 shadow-[0_0_0_1px_rgba(232,226,218,0.45)_inset,0_0_18px_rgba(107,99,92,0.35)]"
                  : "border-white/25 bg-black/10 hover:border-stone-300/55 hover:bg-stone-500/12",
              ].join(" ")}
            />
          );
        })}
      </div>

      <span className="mt-2 block text-center text-xs font-semibold uppercase tracking-[0.16em] text-zinc-300">
        {getBodyMapViewLabel(side, language)}
      </span>
    </div>
  );
}

function ArmZoneRefinement({
  selection,
  onSelectionChange,
}: {
  selection: ArmSelection | null;
  onSelectionChange: (selection: ArmSelection) => void;
}) {
  const { t, language } = useSiteLanguage();

  const safeSelection: ArmSelection = selection ?? {
    laterality: "ambas",
    faceScope: "externa",
    part: null,
  };

  const visibleFaces = getArmVisibleFaces(safeSelection.faceScope);
  const complete = isArmSelectionComplete(selection);

  function updateSelection(patch: Partial<ArmSelection>) {
    onSelectionChange({
      ...safeSelection,
      ...patch,
    });
  }

  return (
    <RefinementPanel titleKey="quoteZoneArm" hintKey="quoteZoneArmDesc">
      <RefinementStepHeader
        step={1}
        total={3}
        title={language === "en" ? "Choose the arm" : "Elige el brazo"}
        hint={
          language === "en"
            ? "Select left, right or both arms."
            : "Selecciona brazo izquierdo, derecho o ambos."
        }
        done={Boolean(selection?.laterality)}
      />

      <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
        {LIMB_LATERALITY_IDS.map((id) => {
          const active = safeSelection.laterality === id;

          return (
            <button
              key={id}
              type="button"
              onClick={() => updateSelection({ laterality: id })}
              aria-pressed={active}
              className={optionButtonClass(active)}
            >
              <CircleDot className="h-4 w-4 shrink-0 opacity-70" />
              {t(LIMB_LATERALITY_LABEL_KEYS[id])}
            </button>
          );
        })}
      </div>

      <RefinementStepHeader
        step={2}
        total={3}
        title={language === "en" ? "Choose the visible face" : "Elige la cara del brazo"}
        hint={language === "en" ? "Outer, inner or both faces." : "Cara externa, interna o ambas."}
        done={Boolean(selection?.faceScope)}
      />

      <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
        {ARM_FACE_SCOPE_IDS.map((id: ArmFaceScopeId) => {
          const active = safeSelection.faceScope === id;

          return (
            <button
              key={id}
              type="button"
              onClick={() => updateSelection({ faceScope: id })}
              aria-pressed={active}
              className={optionButtonClass(active)}
            >
              <CircleDot className="h-4 w-4 shrink-0 opacity-70" />
              <span>
                <span className="block">{t(ARM_FACE_SCOPE_LABEL_KEYS[id])}</span>
                <span className="mt-0.5 block text-[11px] font-medium text-zinc-400">
                  {t(ARM_FACE_SCOPE_DESC_KEYS[id])}
                </span>
              </span>
            </button>
          );
        })}
      </div>

      <RefinementStepHeader
        step={3}
        total={3}
        title={language === "en" ? "Choose the exact arm area" : "Elige la zona exacta del brazo"}
        hint={
          language === "en"
            ? "Shoulder, biceps, triceps, forearm, hand or sleeve coverage."
            : "Hombro, bíceps, tríceps, antebrazo, mano o extensión tipo manga."
        }
        done={Boolean(selection?.part)}
      />

      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        {ARM_PART_IDS.map((id: ArmPartId) => {
          const active = safeSelection.part === id;

          return (
            <button
              key={id}
              type="button"
              onClick={() => updateSelection({ part: id })}
              aria-pressed={active}
              className={optionButtonClass(active)}
            >
              <CircleDot className="h-4 w-4 shrink-0 opacity-70" />
              {t(ARM_PART_LABEL_KEYS[id])}
            </button>
          );
        })}
      </div>

      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
        {visibleFaces.map((face) => (
          <div key={face} className="rounded-xl border border-white/10 bg-stone-600/8 p-3">
            <div
              className={[
                "relative mx-auto w-full overflow-hidden",
                face === "externa" ? "aspect-[16/9] max-w-[420px]" : "aspect-[4/5] max-w-[280px]",
                BODY_REFERENCE_IMAGE_FRAME,
              ].join(" ")}
            >
              <Image
                src={ARM_DETAIL_IMAGE[face]}
                alt={
                  face === "externa"
                    ? language === "en"
                      ? "Outer arm detail"
                      : "Detalle de brazo externo"
                    : language === "en"
                      ? "Inner arm detail"
                      : "Detalle de brazo interno"
                }
                fill
                quality={95}
                sizes="(max-width: 640px) 300px, 420px"
                className="object-contain"
              />

              {getArmDetailHotspots(face).map((spot) => (
                <DetailHotspot
                  key={`${face}-${spot.id}`}
                  className={spot.className}
                  active={isArmDetailHotspotActive(spot.id, safeSelection.part)}
                  label={t(ARM_PART_LABEL_KEYS[spot.id])}
                  onClick={() => updateSelection({ part: spot.id })}
                  showInactive
                />
              ))}
            </div>

            <p className="mt-2 text-center text-xs font-semibold uppercase tracking-[0.14em] text-zinc-500">
              {t(ARM_FACE_SCOPE_LABEL_KEYS[face])}
            </p>
          </div>
        ))}
      </div>

      {complete ? (
        <SelectionSummary
          label={t("quoteSelectionSummary")}
          value={formatZoneDisplay("brazo", undefined, t, {
            armLaterality: safeSelection.laterality,
            armFaceScope: safeSelection.faceScope,
            armPart: safeSelection.part ?? undefined,
          })}
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

function LegZoneRefinement({
  selection,
  onSelectionChange,
}: {
  selection: LegSelection | null;
  onSelectionChange: (selection: LegSelection) => void;
}) {
  const { t, language } = useSiteLanguage();

  const safeSelection: LegSelection = selection ?? {
    laterality: "ambas",
    faceScope: "anterior",
    extent: "muslo",
  };

  const visibleFaces = getLegVisibleFaces(safeSelection.faceScope);
  const complete = isLegSelectionComplete(selection);

  function updateSelection(patch: Partial<LegSelection>) {
    onSelectionChange({
      ...safeSelection,
      ...patch,
    });
  }

  return (
    <RefinementPanel titleKey="quoteZoneLeg" hintKey="quoteLegExtentFullDesc">
      <RefinementStepHeader
        step={1}
        total={3}
        title={language === "en" ? "Choose the leg" : "Elige la pierna"}
        hint={
          language === "en"
            ? "Select left, right or both legs."
            : "Selecciona pierna izquierda, derecha o ambas."
        }
        done={Boolean(selection?.laterality)}
      />

      <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
        {LIMB_LATERALITY_IDS.map((id) => {
          const active = safeSelection.laterality === id;

          return (
            <button
              key={id}
              type="button"
              onClick={() => updateSelection({ laterality: id })}
              aria-pressed={active}
              className={optionButtonClass(active)}
            >
              <CircleDot className="h-4 w-4 shrink-0 opacity-70" />
              {t(LIMB_LATERALITY_LABEL_KEYS[id])}
            </button>
          );
        })}
      </div>

      <RefinementStepHeader
        step={2}
        total={3}
        title={language === "en" ? "Choose the leg face" : "Elige la cara de la pierna"}
        hint={language === "en" ? "Anterior, posterior or both." : "Cara anterior, posterior o ambas."}
        done={Boolean(selection?.faceScope)}
      />

      <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
        {LEG_FACE_SCOPE_IDS.map((id: LegFaceScopeId) => {
          const active = safeSelection.faceScope === id;

          return (
            <button
              key={id}
              type="button"
              onClick={() => updateSelection({ faceScope: id })}
              aria-pressed={active}
              className={optionButtonClass(active)}
            >
              <CircleDot className="h-4 w-4 shrink-0 opacity-70" />
              <span>
                <span className="block">{t(LEG_FACE_SCOPE_LABEL_KEYS[id])}</span>
                <span className="mt-0.5 block text-[11px] font-medium text-zinc-400">
                  {t(LEG_FACE_SCOPE_DESC_KEYS[id])}
                </span>
              </span>
            </button>
          );
        })}
      </div>

      <RefinementStepHeader
        step={3}
        total={3}
        title={language === "en" ? "Choose the leg coverage" : "Elige la extensión"}
        hint={language === "en" ? "Thigh, lower leg or full leg." : "Muslo, pierna baja o pierna completa."}
        done={Boolean(selection?.extent)}
      />

      <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
        {LEG_EXTENT_IDS.map((id: LegExtentId) => {
          const active = safeSelection.extent === id;

          return (
            <button
              key={id}
              type="button"
              onClick={() => updateSelection({ extent: id })}
              aria-pressed={active}
              className={optionButtonClass(active)}
            >
              <CircleDot className="h-4 w-4 shrink-0 opacity-70" />
              <span>
                <span className="block">{t(LEG_EXTENT_LABEL_KEYS[id])}</span>
                <span className="mt-0.5 block text-[11px] font-medium text-zinc-400">
                  {t(LEG_EXTENT_DESC_KEYS[id])}
                </span>
              </span>
            </button>
          );
        })}
      </div>

      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
        {visibleFaces.map((face) => (
          <div key={face} className="rounded-xl border border-white/10 bg-stone-600/8 p-3">
            <div
              className={[
                "relative mx-auto aspect-[3/4] w-full max-w-[300px] overflow-hidden",
                BODY_REFERENCE_IMAGE_FRAME,
              ].join(" ")}
            >
              <Image
                src={LEG_DETAIL_IMAGE[face]}
                alt={
                  face === "anterior"
                    ? language === "en"
                      ? "Anterior leg detail"
                      : "Detalle anterior de pierna"
                    : language === "en"
                      ? "Posterior leg detail"
                      : "Detalle posterior de pierna"
                }
                fill
                quality={95}
                sizes="(max-width: 640px) 280px, 300px"
                className="object-contain"
              />

              {getLegDetailHotspots(face)
                .filter((spot) => shouldShowLegDetailHotspot(spot, safeSelection))
                .map((spot) => (
                  <DetailHotspot
                    key={`${face}-${spot.laterality}-${spot.id}`}
                    className={spot.className}
                    active={isLegDetailHotspotActive(spot, safeSelection)}
                    label={t(LEG_EXTENT_LABEL_KEYS[safeSelection.extent])}
                    onClick={() => {
                      const inferred = inferLegSelectionFromPartClick(spot.id, safeSelection);

                      onSelectionChange({
                        ...inferred,
                        laterality: spot.laterality,
                      });
                    }}
                    showInactive
                  />
                ))}
            </div>

            <p className="mt-2 text-center text-xs font-semibold uppercase tracking-[0.14em] text-zinc-500">
              {t(LEG_FACE_SCOPE_LABEL_KEYS[face])}
            </p>
          </div>
        ))}
      </div>

      {complete ? (
        <SelectionSummary
          label={t("quoteSelectionSummary")}
          value={formatZoneDisplay("pierna", undefined, t, {
            legLaterality: safeSelection.laterality,
            legFaceScope: safeSelection.faceScope,
            legExtent: safeSelection.extent,
          })}
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

export function BodyAreaSelector({
  zone,
  onZoneChange,
  zoneOther,
  onZoneOtherChange,
  headPart,
  onHeadPartChange,
  backPart,
  onBackPartChange,
  armSelection,
  onArmSelectionChange,
  legSelection,
  onLegSelectionChange,
}: Props) {
  const { t, language } = useSiteLanguage();

  const progress = 50;

  const selectionLabel = formatZoneDisplay(zone, zoneOther, t, {
    headPart: headPart ?? undefined,
    backPart: backPart ?? undefined,
    armLaterality: armSelection?.laterality,
    armFaceScope: armSelection?.faceScope,
    armPart: armSelection?.part ?? undefined,
    legLaterality: legSelection?.laterality,
    legFaceScope: legSelection?.faceScope,
    legExtent: legSelection?.extent,
  });

  function handleBodySpotClick(spot: BodyHotspot, side: BodyMapSide) {
    if (isArmBodyZone(spot.id) && spot.laterality) {
      const inferred = inferArmSelectionFromBodySpot(spot.id, side, spot.laterality);

      onZoneChange("brazo");

      if (inferred) {
        onArmSelectionChange(inferred);
      }

      return;
    }

    if (spot.id === "pierna" && spot.legPart && spot.laterality) {
      onZoneChange("pierna");
      onLegSelectionChange(inferLegSelectionFromBodySpot(spot.legPart, spot.laterality));
      return;
    }

    onZoneChange(spot.id);
  }

  return (
    <div className="space-y-6">
      <div>
        <p className="typo-tech text-center uppercase tracking-[0.14em] text-zinc-300">
          {language === "en" ? "Step 2 of 4" : "Paso 2 de 4"}
        </p>

        <div className="mt-2 h-2 w-full overflow-hidden rounded-full border border-white/10 bg-white/5">
          <div
            className="h-full rounded-full bg-gradient-to-r from-stone-500/90 via-stone-400/80 to-zinc-300/90"
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>

      <div className="space-y-2">
        <h3 className="typo-section text-center text-[2rem] leading-tight md:text-[2.5rem]">
          {language === "en" ? "Where is the tattoo going?" : "¿Dónde va el tatuaje?"}
        </h3>

        <p className="typo-body mx-auto max-w-2xl text-center">
          {language === "en"
            ? "Choose the body area, then refine it if needed. This helps create a clearer and more accurate quote."
            : "Elige la zona del cuerpo y luego afínala si hace falta. Esto ayuda a crear una cotización más clara y precisa."}
        </p>
      </div>

      <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
        <p className="mb-3 inline-flex items-center gap-2 text-sm font-bold uppercase tracking-[0.14em] text-zinc-200">
          <Sparkles className="h-4 w-4 text-stone-300" />
          {language === "en" ? "General area" : "Zona general"}
        </p>

        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
          {GENERAL_ZONE_IDS.map((id) => {
            const active = zone === id;

            return (
              <button
                key={id}
                type="button"
                onClick={() => onZoneChange(id)}
                aria-pressed={active}
                className={optionButtonClass(active)}
              >
                {getZoneIcon(id)}
                {t(ZONE_LABEL_KEYS[id])}
              </button>
            );
          })}
        </div>

        {zone === "otro" ? (
          <div className="mt-4">
            <label className="mb-2 block text-xs font-semibold uppercase tracking-[0.14em] text-zinc-400">
              {language === "en" ? "Describe the area" : "Describe la zona"}
            </label>

            <input
              value={zoneOther}
              onChange={(event) => onZoneOtherChange(event.target.value)}
              placeholder={
                language === "en"
                  ? "Example: ribs, ankle, neck side..."
                  : "Ejemplo: costillas, tobillo, lateral del cuello..."
              }
              className="w-full rounded-xl border border-white/10 bg-black/30 px-4 py-3 text-sm font-semibold text-zinc-100 outline-none transition placeholder:text-zinc-600 focus:border-stone-400/50"
            />
          </div>
        ) : null}
      </div>

      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
        <BodyMapImage
          side="front"
          zone={zone}
          armSelection={armSelection}
          legSelection={legSelection}
          onSpotClick={handleBodySpotClick}
        />

        <BodyMapImage
          side="back"
          zone={zone}
          armSelection={armSelection}
          legSelection={legSelection}
          onSpotClick={handleBodySpotClick}
        />
      </div>

      <div className="rounded-2xl border border-stone-500/20 bg-stone-600/8 p-4">
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-zinc-400">
          {language === "en" ? "Current selection" : "Selección actual"}
        </p>

        <p className="mt-1 text-lg font-bold text-zinc-100">{selectionLabel}</p>

        <p className="mt-1 text-sm text-zinc-400">
          {language === "en"
            ? "Use the map or the detail controls below to make the location more precise."
            : "Usa el mapa o los controles de detalle para hacer la ubicación más precisa."}
        </p>
      </div>

      {zone === "cabeza" ? (
        <HeadZoneRefinement headPart={headPart} onHeadPartChange={onHeadPartChange} />
      ) : null}

      {zone === "espalda" ? (
        <BackZoneRefinement backPart={backPart} onBackPartChange={onBackPartChange} />
      ) : null}

      {zone === "brazo" ? (
        <ArmZoneRefinement selection={armSelection} onSelectionChange={onArmSelectionChange} />
      ) : null}

      {zone === "pierna" ? (
        <LegZoneRefinement selection={legSelection} onSelectionChange={onLegSelectionChange} />
      ) : null}
    </div>
  );
}