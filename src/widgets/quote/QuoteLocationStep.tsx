"use client";

import { useCallback, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight } from "lucide-react";
import { QuoteShell } from "@/widgets/quote/QuoteShell";
import {
  QuoteBodyLocationSelector,
  getInitialQuoteBodyLocationMode,
  type QuoteBodyLocationMode,
} from "@/widgets/quote/QuoteBodyLocationSelector";
import { useQuoteOnboardingGate } from "@/widgets/quote/useQuoteOnboardingGate";
import { useSiteLanguage } from "@/shared/i18n/LanguageProvider";
import {
  getQuoteDraft,
  isLargeQuoteSize,
  saveQuoteDraft,
} from "@/shared/lib/quoteDraft";
import type { ZoneId } from "@/shared/lib/quoteZones";
import type { HeadPartId } from "@/shared/lib/headZoneParts";
import type { BackPartId } from "@/shared/lib/backZoneParts";
import {
  isArmSelectionComplete,
  type ArmSelection,
} from "@/shared/lib/armZoneParts";
import {
  isLegSelectionComplete,
  type LegSelection,
} from "@/shared/lib/legZoneParts";
import type { BodySelectionTargetId } from "@/widgets/body-3d/ux/bodySelectionSerialization";
import {
  buildBody3DNavigationParams,
  buildLegacyQuoteLocationFromBodyTargets,
  isBody3DLocationComplete,
  normalizeQuoteBodyTargets,
  readBodyTargetsFromDraft,
} from "@/widgets/quote/quoteBodyLocation";

function readInitialTargets(): BodySelectionTargetId[] {
  if (typeof window === "undefined") return [];
  return readBodyTargetsFromDraft(getQuoteDraft());
}

export function QuoteLocationStep({ size }: { size: string }) {
  const router = useRouter();
  const { t } = useSiteLanguage();
  const gateReady = useQuoteOnboardingGate();

  const [selectedBodyTargets, setSelectedBodyTargets] = useState<
    BodySelectionTargetId[]
  >(readInitialTargets);
  const [selectorMode, setSelectorMode] = useState<QuoteBodyLocationMode>(
    getInitialQuoteBodyLocationMode,
  );

  // Estado legacy — solo activo en fallback 2D
  const [zone, setZone] = useState<ZoneId | null>(null);
  const [zoneOther, setZoneOther] = useState("");
  const [headPart, setHeadPart] = useState<HeadPartId | null>(null);
  const [backPart, setBackPart] = useState<BackPartId | null>(null);
  const [armSelection, setArmSelection] = useState<ArmSelection | null>(null);
  const [legSelection, setLegSelection] = useState<LegSelection | null>(null);

  const handleTargetsChange = useCallback((next: BodySelectionTargetId[]) => {
    setSelectedBodyTargets(normalizeQuoteBodyTargets(next));
  }, []);

  const handleFallback = useCallback(() => {
    setSelectorMode("2d-fallback");
  }, []);

  const handleZoneChange = useCallback((next: ZoneId) => {
    setZone(next);
    if (next !== "cabeza") setHeadPart(null);
    if (next !== "espalda") setBackPart(null);
    if (next !== "brazo") setArmSelection(null);
    if (next !== "pierna") setLegSelection(null);
    if (next !== "otro") setZoneOther("");
  }, []);

  const isLegacyComplete = useMemo(() => {
    if (!zone) return false;
    if (zone === "cabeza") return Boolean(headPart);
    if (zone === "espalda") return Boolean(backPart);
    if (zone === "brazo") return isArmSelectionComplete(armSelection);
    if (zone === "pierna") return isLegSelectionComplete(legSelection);
    if (zone === "otro") return zoneOther.trim().length >= 3;
    return true;
  }, [armSelection, backPart, headPart, legSelection, zone, zoneOther]);

  const isLocationComplete =
    selectorMode === "3d"
      ? isBody3DLocationComplete(selectedBodyTargets)
      : isLegacyComplete;

  function handleContinue() {
    if (!isLocationComplete) return;

    const base = getQuoteDraft() ?? { size };

    if (selectorMode === "3d") {
      const bodyFields = buildLegacyQuoteLocationFromBodyTargets(
        selectedBodyTargets,
      );
      saveQuoteDraft({
        ...base,
        size,
        ...bodyFields,
        headPart: undefined,
        backPart: undefined,
        armLaterality: undefined,
        armFaceScope: undefined,
        armPart: undefined,
        legLaterality: undefined,
        legFaceScope: undefined,
        legExtent: undefined,
      });

      if (isLargeQuoteSize(size)) {
        router.push(`/cotizacion/asesoria?size=${encodeURIComponent(size)}`);
        return;
      }

      const params = buildBody3DNavigationParams(size, selectedBodyTargets);
      router.push(`/cotizacion/estilo?${params.toString()}`);
      return;
    }

    if (!zone) return;

    saveQuoteDraft({
      ...base,
      size,
      zone,
      zoneOther: zoneOther.trim() || undefined,
      headPart: headPart ?? undefined,
      backPart: backPart ?? undefined,
      armLaterality: armSelection?.laterality,
      armFaceScope: armSelection?.faceScope,
      armPart: armSelection?.part ?? undefined,
      legLaterality: legSelection?.laterality,
      legFaceScope: legSelection?.faceScope,
      legExtent: legSelection?.extent,
      selectedBodyTargets: undefined,
    });

    if (isLargeQuoteSize(size)) {
      router.push(`/cotizacion/asesoria?size=${encodeURIComponent(size)}`);
      return;
    }

    const params = new URLSearchParams();
    params.set("size", size);
    params.set("zone", zone);
    if (zoneOther.trim()) params.set("zoneOther", zoneOther.trim());
    if (headPart) params.set("headPart", headPart);
    if (backPart) params.set("backPart", backPart);
    if (armSelection?.laterality) {
      params.set("armLaterality", armSelection.laterality);
    }
    if (armSelection?.faceScope) {
      params.set("armFaceScope", armSelection.faceScope);
    }
    if (armSelection?.part) params.set("armPart", armSelection.part);
    if (legSelection?.laterality) {
      params.set("legLaterality", legSelection.laterality);
    }
    if (legSelection?.faceScope) {
      params.set("legFaceScope", legSelection.faceScope);
    }
    if (legSelection?.extent) params.set("legExtent", legSelection.extent);
    router.push(`/cotizacion/estilo?${params.toString()}`);
  }

  if (!gateReady) {
    return (
      <QuoteShell showGreeting={false}>
        <div className="flex min-h-[40dvh] items-center justify-center">
          <p className="typo-tech text-sm uppercase tracking-[0.18em] text-stone-400">
            Cargando…
          </p>
        </div>
      </QuoteShell>
    );
  }

  return (
    <QuoteShell greetingKey="quoteGreetLocation">
      <header className="mb-5 max-w-2xl border-b border-[rgba(var(--rgb-sand),0.14)] pb-5 sm:mb-6">
        <p className="font-mono text-[0.62rem] uppercase tracking-[0.18em] text-[rgba(var(--rgb-sand),0.55)]">
          {t("quoteLocationStep")}
        </p>
        <h2 className="typo-gothic mt-3 text-[clamp(1.85rem,4.5vw,2.75rem)] leading-[0.95] text-[rgba(var(--rgb-sand),0.96)]">
          {t("quoteLocationTitle")}
          <br />
          <span className="text-[rgba(var(--rgb-ivory),0.72)]">{t("quoteLocationTitle2")}</span>
        </h2>
        <p className="mt-3 max-w-[42ch] text-sm leading-relaxed text-[rgba(var(--rgb-ivory),0.62)]">
          {t("quoteLocationBody")}
        </p>
      </header>

      <section className="mb-4 sm:mb-5">
        <QuoteBodyLocationSelector
          value={selectedBodyTargets}
          onChange={handleTargetsChange}
          mode={selectorMode}
          onFallback={handleFallback}
          resetKey={size}
          legacy={{
            zone,
            onZoneChange: handleZoneChange,
            zoneOther,
            onZoneOtherChange: setZoneOther,
            headPart,
            onHeadPartChange: setHeadPart,
            backPart,
            onBackPartChange: setBackPart,
            armSelection,
            onArmSelectionChange: setArmSelection,
            legSelection,
            onLegSelectionChange: setLegSelection,
          }}
        />
      </section>

      {!isLocationComplete ? (
        <div className="mb-3 rounded-xl border border-[rgba(var(--rgb-honey),0.22)] bg-[rgba(var(--rgb-cafe),0.45)] px-4 py-3 text-sm font-medium text-[rgba(var(--rgb-sand),0.88)]">
          {selectorMode === "3d"
            ? t("quoteBody3dEmptyContinue")
            : t("quoteRefinementIncomplete")}
        </div>
      ) : null}

      <div className="quote-step-footer mt-4 sm:mt-5">
        <button
          type="button"
          onClick={() => router.push("/cotizacion/tamano")}
          className="quote-step-footer-back rounded-xl border border-white/10 bg-white/5 px-5 py-3 text-sm font-semibold text-zinc-100 transition hover:bg-white/8"
        >
          {t("commonBack")}
        </button>

        <button
          type="button"
          onClick={handleContinue}
          disabled={!isLocationComplete}
          aria-disabled={!isLocationComplete}
          className={[
            "quote-step-footer-next btn-accent focus-ring typo-cta group inline-flex items-center justify-center gap-2 rounded-xl px-6 py-3 active:scale-[0.98]",
            !isLocationComplete ? "cursor-not-allowed opacity-45" : "",
          ].join(" ")}
        >
          {t("quoteContinue")}
          <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
        </button>
      </div>
    </QuoteShell>
  );
}
