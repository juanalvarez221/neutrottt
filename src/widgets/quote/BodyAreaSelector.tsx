"use client";

import { useState, type CSSProperties } from "react";
import { Bone, CircleDot, MapPin, PersonStanding } from "lucide-react";
import { useSiteLanguage } from "@/shared/i18n/LanguageProvider";
import {
  formatZoneDisplay,
  ZONE_LABEL_KEYS,
  type ZoneId,
} from "@/shared/lib/quoteZones";
import {
  inferArmSelectionHintFromBodySpot,
  isArmBodyMapSpotActive,
  type ArmSelection,
} from "@/shared/lib/armZoneParts";
import {
  inferLegSelectionFromBodySpot,
  isLegBodyMapSpotActive,
  type LegSelection,
} from "@/shared/lib/legZoneParts";
import type { BodyMapLaterality } from "@/shared/lib/limbLaterality";
import type { HeadPartId } from "@/shared/lib/headZoneParts";
import type { BackPartId } from "@/shared/lib/backZoneParts";
import type { LegPartId } from "@/shared/lib/legZoneParts";
import { getBodyMapViewLabel } from "@/widgets/quote/bodyMapViewLabels";
import { BodyImageFrame } from "@/widgets/quote/BodyImageFrame";
import { needsZoneRefinement } from "@/widgets/quote/ZoneFlowHelpers";
import {
  isZoneRefinementComplete,
  ZoneRefinementFlow,
} from "@/widgets/quote/ZoneRefinementFlow";

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
  zone: ZoneId | null;
  onZoneChange: (zone: ZoneId) => void;
  zoneOther: string;
  onZoneOtherChange: (value: string) => void;
  headPart: HeadPartId | null;
  onHeadPartChange: (part: HeadPartId) => void;
  backPart: BackPartId | null;
  onBackPartChange: (part: BackPartId) => void;
  armSelection: ArmSelection | null;
  onArmSelectionChange: (selection: ArmSelection | null) => void;
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

const FRONT_HOTSPOTS: BodyHotspot[] = [
  {
    id: "cabeza",
    className: "left-[42.4%] top-[4.6%] h-[10.4%] w-[15.4%] rounded-[999px]",
  },
  {
    id: "hombro",
    laterality: "derecha",
    className: "left-[27.9%] top-[18.1%] h-[5.8%] w-[11.8%] rounded-[999px]",
  },
  {
    id: "hombro",
    laterality: "izquierda",
    className: "left-[60.3%] top-[18.1%] h-[5.8%] w-[11.8%] rounded-[999px]",
  },
  {
    id: "pecho",
    className: "left-[35.7%] top-[24.4%] h-[9.4%] w-[28.8%] rounded-[28%]",
  },
  {
    id: "abdomen",
    className: "left-[37.9%] top-[35.2%] h-[12.8%] w-[24.1%] rounded-[24%]",
  },
  {
    id: "bicep",
    laterality: "derecha",
    className: "left-[22.7%] top-[24.6%] h-[12.8%] w-[9.1%] rounded-[999px]",
    style: { transform: "rotate(-9deg)" },
  },
  {
    id: "bicep",
    laterality: "izquierda",
    className: "left-[68.2%] top-[24.6%] h-[12.8%] w-[9.1%] rounded-[999px]",
    style: { transform: "rotate(9deg)" },
  },
  {
    id: "antebrazo",
    laterality: "derecha",
    className: "left-[17.4%] top-[37.1%] h-[15.1%] w-[8.3%] rounded-[999px]",
    style: { transform: "rotate(-8deg)" },
  },
  {
    id: "antebrazo",
    laterality: "izquierda",
    className: "left-[74.3%] top-[37.1%] h-[15.1%] w-[8.3%] rounded-[999px]",
    style: { transform: "rotate(8deg)" },
  },
  {
    id: "pierna",
    laterality: "derecha",
    legPart: "muslo_anterior",
    className: "left-[38.9%] top-[56.2%] h-[17.8%] w-[9.8%] rounded-[26%]",
  },
  {
    id: "pierna",
    laterality: "izquierda",
    legPart: "muslo_anterior",
    className: "left-[51.2%] top-[56.2%] h-[17.8%] w-[9.8%] rounded-[26%]",
  },
  {
    id: "pierna",
    laterality: "derecha",
    legPart: "pierna_anterior",
    className: "left-[38.8%] top-[74.2%] h-[17.9%] w-[8.9%] rounded-[24%]",
  },
  {
    id: "pierna",
    laterality: "izquierda",
    legPart: "pierna_anterior",
    className: "left-[52.1%] top-[74.2%] h-[17.9%] w-[8.9%] rounded-[24%]",
  },
];

const BACK_HOTSPOTS: BodyHotspot[] = [
  {
    id: "cabeza",
    className: "left-[42.4%] top-[4.6%] h-[10.4%] w-[15.4%] rounded-[999px]",
  },
  {
    id: "hombro",
    laterality: "izquierda",
    className: "left-[27.9%] top-[18.1%] h-[5.8%] w-[11.8%] rounded-[999px]",
  },
  {
    id: "hombro",
    laterality: "derecha",
    className: "left-[60.3%] top-[18.1%] h-[5.8%] w-[11.8%] rounded-[999px]",
  },
  {
    id: "espalda",
    className: "left-[33.5%] top-[22.6%] h-[23.2%] w-[33.3%] rounded-[24%]",
  },
  {
    id: "tricep",
    laterality: "izquierda",
    className: "left-[22.9%] top-[24.9%] h-[12.4%] w-[8.9%] rounded-[999px]",
    style: { transform: "rotate(-9deg)" },
  },
  {
    id: "tricep",
    laterality: "derecha",
    className: "left-[68.1%] top-[24.9%] h-[12.4%] w-[8.9%] rounded-[999px]",
    style: { transform: "rotate(9deg)" },
  },
  {
    id: "antebrazo",
    laterality: "izquierda",
    className: "left-[17.5%] top-[37.2%] h-[15%] w-[8.3%] rounded-[999px]",
    style: { transform: "rotate(-8deg)" },
  },
  {
    id: "antebrazo",
    laterality: "derecha",
    className: "left-[74.3%] top-[37.2%] h-[15%] w-[8.3%] rounded-[999px]",
    style: { transform: "rotate(8deg)" },
  },
  {
    id: "gluteo",
    laterality: "izquierda",
    className: "left-[37.8%] top-[47.9%] h-[8.1%] w-[11.4%] rounded-[42%]",
  },
  {
    id: "gluteo",
    laterality: "derecha",
    className: "left-[50.5%] top-[47.9%] h-[8.1%] w-[11.4%] rounded-[42%]",
  },
  {
    id: "pierna",
    laterality: "izquierda",
    legPart: "muslo_posterior",
    className: "left-[38.9%] top-[56.2%] h-[17.8%] w-[9.8%] rounded-[26%]",
  },
  {
    id: "pierna",
    laterality: "derecha",
    legPart: "muslo_posterior",
    className: "left-[51.2%] top-[56.2%] h-[17.8%] w-[9.8%] rounded-[26%]",
  },
  {
    id: "pierna",
    laterality: "izquierda",
    legPart: "pierna_posterior",
    className: "left-[38.8%] top-[74.2%] h-[17.9%] w-[8.9%] rounded-[24%]",
  },
  {
    id: "pierna",
    laterality: "derecha",
    legPart: "pierna_posterior",
    className: "left-[52.1%] top-[74.2%] h-[17.9%] w-[8.9%] rounded-[24%]",
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
  zone: ZoneId | null;
  armSelection: ArmSelection | null;
  legSelection: LegSelection | null;
  onSpotClick: (spot: BodyHotspot, side: BodyMapSide) => void;
}) {
  const { t, language } = useSiteLanguage();

  function isSpotActive(spot: BodyHotspot) {
    if (!zone) return false;

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

      return false;
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

      return false;
    }

    return zone === spot.id;
  }

  return (
    <div className="glass-card relative overflow-hidden rounded-2xl p-3">
      <BodyImageFrame
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
        className="mx-auto w-full max-w-[min(100%,330px)]"
        sizes="(max-width: 640px) 300px, 330px"
        priority
        quality={100}
      >
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
                "body-map-hotspot absolute z-10 outline-none touch-manipulation",
                "focus-visible:ring-2 focus-visible:ring-stone-300/80 focus-visible:ring-offset-1 focus-visible:ring-offset-transparent",
                spot.className,
                active ? "body-map-hotspot--active" : "body-map-hotspot--idle",
              ].join(" ")}
            />
          );
        })}
      </BodyImageFrame>

      <span className="mt-2 block text-center text-xs font-semibold uppercase tracking-[0.16em] text-zinc-300">
        {getBodyMapViewLabel(side, language)}
      </span>
    </div>
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
  const [flowOpen, setFlowOpen] = useState(false);

  const refinementComplete = isZoneRefinementComplete(
    zone,
    headPart,
    backPart,
    armSelection,
    legSelection,
  );

  const selectionLabel = zone
    ? formatZoneDisplay(zone, zoneOther, t, {
        headPart: headPart ?? undefined,
        backPart: backPart ?? undefined,
        armLaterality: armSelection?.laterality,
        armFaceScope: armSelection?.faceScope,
        armPart: armSelection?.part ?? undefined,
        legLaterality: legSelection?.laterality,
        legFaceScope: legSelection?.faceScope,
        legExtent: legSelection?.extent,
      })
    : language === "en"
      ? "Pick an area"
      : "Elige una zona";

  function handleBodySpotClick(spot: BodyHotspot, side: BodyMapSide) {
    if (isArmBodyZone(spot.id)) {
      const hint = inferArmSelectionHintFromBodySpot(spot.id, side);
      onZoneChange("brazo");
      onArmSelectionChange(hint ?? {});
      setFlowOpen(true);
      return;
    }

    if (spot.id === "pierna" && spot.legPart && spot.laterality) {
      onZoneChange("pierna");
      onLegSelectionChange(inferLegSelectionFromBodySpot(spot.legPart, spot.laterality));
      setFlowOpen(true);
      return;
    }

    onZoneChange(spot.id);
    if (needsZoneRefinement(spot.id)) {
      setFlowOpen(true);
    }
  }

  function handleZoneButtonClick(id: ZoneId) {
    if (id === "hombro") {
      onZoneChange("brazo");
      onArmSelectionChange({ part: "hombro" });
      setFlowOpen(true);
      return;
    }

    if (id === "brazo") {
      onZoneChange("brazo");
      onArmSelectionChange(null);
      setFlowOpen(true);
      return;
    }

    onZoneChange(id);
    if (needsZoneRefinement(id)) {
      setFlowOpen(true);
    }
  }

  function isZoneChipActive(id: ZoneId): boolean {
    if (id === "hombro") {
      return zone === "brazo" && armSelection?.part === "hombro";
    }
    if (id === "brazo") {
      return zone === "brazo" && armSelection?.part !== "hombro";
    }
    return zone === id;
  }

  return (
    <div className="space-y-5">
      <div className="space-y-1 text-center">
        <h3 className="typo-section text-[1.75rem] leading-tight md:text-[2.1rem]">
          {t("quoteZonePickTitle")}
        </h3>
        <p className="typo-body mx-auto max-w-md text-sm text-zinc-400">
          {t("quoteZonePickHint")}
        </p>
      </div>

      <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-3 sm:p-4">
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
          {GENERAL_ZONE_IDS.map((id) => {
            const active = isZoneChipActive(id);

            return (
              <button
                key={id}
                type="button"
                onClick={() => handleZoneButtonClick(id)}
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
          <div className="mt-3">
            <label className="mb-1.5 block text-xs font-semibold uppercase tracking-[0.12em] text-zinc-500">
              {t("quoteZoneOtherLabel")}
            </label>
            <input
              value={zoneOther}
              onChange={(event) => onZoneOtherChange(event.target.value)}
              placeholder={t("quoteZoneOtherPlaceholder")}
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

      <div
        className={[
          "rounded-xl border px-4 py-3",
          refinementComplete || !zone
            ? "border-stone-500/20 bg-stone-600/8"
            : "border-amber-400/25 bg-amber-950/20",
        ].join(" ")}
      >
        <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-zinc-500">
          {t("quoteSelectionSummary")}
        </p>
        <p className="mt-0.5 text-base font-bold text-zinc-100">{selectionLabel}</p>

        {zone && needsZoneRefinement(zone) && !refinementComplete ? (
          <button
            type="button"
            onClick={() => setFlowOpen(true)}
            className="focus-ring mt-3 inline-flex min-h-[44px] items-center rounded-xl border border-amber-300/30 bg-amber-500/12 px-4 py-2 text-sm font-semibold text-amber-100 transition hover:bg-amber-500/18 active:scale-[0.98]"
          >
            {t("quoteZoneResumeDetail")}
          </button>
        ) : null}
      </div>

      {zone && needsZoneRefinement(zone) ? (
        <ZoneRefinementFlow
          open={flowOpen}
          zone={zone}
          headPart={headPart}
          onHeadPartChange={onHeadPartChange}
          backPart={backPart}
          onBackPartChange={onBackPartChange}
          armSelection={armSelection}
          onArmSelectionChange={onArmSelectionChange}
          legSelection={legSelection}
          onLegSelectionChange={onLegSelectionChange}
          onClose={() => setFlowOpen(false)}
          onComplete={() => setFlowOpen(false)}
        />
      ) : null}
    </div>
  );
}
