/**
 * Selector de ubicación corporal para cotización.
 * 3D principal; 2D solo como fallback técnico (sin toggle visible).
 */

"use client";

import { NEUTRO_BODY_V1_MODEL } from "@/widgets/body-3d/bodyModelDefinition";
import { BodyPremiumSelector } from "@/widgets/body-3d/ux/BodyPremiumSelector";
import type { BodySelectionTargetId } from "@/widgets/body-3d/ux/bodySelectionSerialization";
import { BodyAreaSelector } from "@/widgets/quote/BodyAreaSelector";
import { Body3DErrorBoundary } from "@/widgets/quote/Body3DErrorBoundary";
import { isWebGLAvailable } from "@/widgets/quote/isWebGLAvailable";
import type { ZoneId } from "@/shared/lib/quoteZones";
import type { HeadPartId } from "@/shared/lib/headZoneParts";
import type { BackPartId } from "@/shared/lib/backZoneParts";
import type { ArmSelection } from "@/shared/lib/armZoneParts";
import type { LegSelection } from "@/shared/lib/legZoneParts";

export type QuoteBodyLocationMode = "3d" | "2d-fallback";

type LegacyBodyProps = {
  zone: ZoneId | null;
  onZoneChange: (zone: ZoneId) => void;
  zoneOther: string;
  onZoneOtherChange: (value: string) => void;
  headPart: HeadPartId | null;
  onHeadPartChange: (value: HeadPartId | null) => void;
  backPart: BackPartId | null;
  onBackPartChange: (value: BackPartId | null) => void;
  armSelection: ArmSelection | null;
  onArmSelectionChange: (value: ArmSelection | null) => void;
  legSelection: LegSelection | null;
  onLegSelectionChange: (value: LegSelection | null) => void;
};

type QuoteBodyLocationSelectorProps = {
  value: readonly BodySelectionTargetId[];
  onChange: (next: BodySelectionTargetId[]) => void;
  legacy: LegacyBodyProps;
  mode: QuoteBodyLocationMode;
  onFallback: () => void;
};

/** Inicialización de modo: WebGL ausente → fallback inmediato. */
export function getInitialQuoteBodyLocationMode(): QuoteBodyLocationMode {
  if (typeof window === "undefined") return "3d";
  return isWebGLAvailable() ? "3d" : "2d-fallback";
}

function FallbackNotice({ children }: { children: React.ReactNode }) {
  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-amber-300/20 bg-amber-500/10 px-4 py-3 text-sm leading-relaxed text-amber-50/95">
        No pudimos cargar el selector 3D.
        <br />
        Puedes continuar seleccionando la zona desde el mapa.
      </div>
      {children}
    </div>
  );
}

export function QuoteBodyLocationSelector({
  value,
  onChange,
  legacy,
  mode,
  onFallback,
}: QuoteBodyLocationSelectorProps) {
  const legacySelector = (
    <BodyAreaSelector
      zone={legacy.zone}
      onZoneChange={legacy.onZoneChange}
      zoneOther={legacy.zoneOther}
      onZoneOtherChange={legacy.onZoneOtherChange}
      headPart={legacy.headPart}
      onHeadPartChange={legacy.onHeadPartChange}
      backPart={legacy.backPart}
      onBackPartChange={legacy.onBackPartChange}
      armSelection={legacy.armSelection}
      onArmSelectionChange={legacy.onArmSelectionChange}
      legSelection={legacy.legSelection}
      onLegSelectionChange={legacy.onLegSelectionChange}
    />
  );

  if (mode === "2d-fallback") {
    return <FallbackNotice>{legacySelector}</FallbackNotice>;
  }

  return (
    <Body3DErrorBoundary
      onError={onFallback}
      fallback={<FallbackNotice>{legacySelector}</FallbackNotice>}
    >
      <BodyPremiumSelector
        model={NEUTRO_BODY_V1_MODEL}
        value={value}
        onChange={onChange}
        showLabContinue={false}
        frameHeight="min(58dvh, 560px)"
        className="w-full"
      />
    </Body3DErrorBoundary>
  );
}
