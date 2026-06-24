"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight } from "lucide-react";
import { QuoteShell } from "@/widgets/quote/QuoteShell";
import { BodyAreaSelector } from "@/widgets/quote/BodyAreaSelector";
import { useQuoteOnboardingGate } from "@/widgets/quote/useQuoteOnboardingGate";
import { useSiteLanguage } from "@/shared/i18n/LanguageProvider";
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

export function QuoteLocationStep({ size }: { size: string }) {
  const router = useRouter();
  const { t, language } = useSiteLanguage();
  const gateReady = useQuoteOnboardingGate();

  const [zone, setZone] = useState<ZoneId>("brazo");
  const [zoneOther, setZoneOther] = useState("");

  const [headPart, setHeadPart] = useState<HeadPartId | null>(null);
  const [backPart, setBackPart] = useState<BackPartId | null>(null);

  const [armSelection, setArmSelection] = useState<ArmSelection | null>(null);
  const [legSelection, setLegSelection] = useState<LegSelection | null>(null);

  const isLocationComplete = useMemo(() => {
    if (zone === "cabeza") return Boolean(headPart);
    if (zone === "espalda") return Boolean(backPart);
    if (zone === "brazo") return isArmSelectionComplete(armSelection);
    if (zone === "pierna") return isLegSelectionComplete(legSelection);
    if (zone === "otro") return zoneOther.trim().length >= 3;

    return true;
  }, [armSelection, backPart, headPart, legSelection, zone, zoneOther]);

  const nextHref = useMemo(() => {
    const params = new URLSearchParams();

    params.set("size", size);
    params.set("zone", zone);

    if (zoneOther.trim()) {
      params.set("zoneOther", zoneOther.trim());
    }

    if (headPart) {
      params.set("headPart", headPart);
    }

    if (backPart) {
      params.set("backPart", backPart);
    }

    if (armSelection?.laterality) {
      params.set("armLaterality", armSelection.laterality);
    }

    if (armSelection?.faceScope) {
      params.set("armFaceScope", armSelection.faceScope);
    }

    if (armSelection?.part) {
      params.set("armPart", armSelection.part);
    }

    if (legSelection?.laterality) {
      params.set("legLaterality", legSelection.laterality);
    }

    if (legSelection?.faceScope) {
      params.set("legFaceScope", legSelection.faceScope);
    }

    if (legSelection?.extent) {
      params.set("legExtent", legSelection.extent);
    }

    return `/cotizacion/estilo?${params.toString()}`;
  }, [
    armSelection,
    backPart,
    headPart,
    legSelection,
    size,
    zone,
    zoneOther,
  ]);

  function handleContinue() {
    if (!isLocationComplete) return;
    router.push(nextHref);
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
    <QuoteShell brand="MALIANTEO">
      <section className="relative mb-8">
        <div className="pointer-events-none absolute -left-10 -top-10 h-40 w-40 rounded-full bg-violet-600/15 blur-[60px]" />

        <p className="typo-tech mb-2 uppercase tracking-[0.16em] text-violet-200/85">
          {t("quoteLocationStep")}
        </p>

        <h2 className="typo-section text-[2.2rem] leading-[1.05] md:text-[3.2rem]">
          {t("quoteLocationTitle")}
          <br />
          <span className="bg-gradient-to-r from-white to-zinc-400 bg-clip-text text-transparent">
            {t("quoteLocationTitle2")}
          </span>
        </h2>

        <p className="typo-body mt-4 max-w-2xl leading-relaxed">
          {t("quoteLocationBody")}
        </p>
      </section>

      <section className="mb-8">
        <div className="glass-card rounded-2xl p-5">
          <div className="mb-4 flex items-center gap-3">
            <div className="flex h-6 w-6 items-center justify-center rounded-full border border-violet-500/30 bg-violet-600/10">
              <span className="text-[10px] font-bold text-white">2</span>
            </div>

            <h3 className="typo-subtitle text-sm uppercase tracking-[0.14em] text-zinc-200">
              {language === "en" ? "Body location" : "Ubicación en el cuerpo"}
            </h3>
          </div>

          <BodyAreaSelector
            zone={zone}
            onZoneChange={setZone}
            zoneOther={zoneOther}
            onZoneOtherChange={setZoneOther}
            headPart={headPart}
            onHeadPartChange={setHeadPart}
            backPart={backPart}
            onBackPartChange={setBackPart}
            armSelection={armSelection}
            onArmSelectionChange={setArmSelection}
            legSelection={legSelection}
            onLegSelectionChange={setLegSelection}
          />
        </div>
      </section>

      {!isLocationComplete ? (
        <div className="mb-4 rounded-xl border border-amber-300/20 bg-amber-500/10 px-4 py-3 text-sm font-medium text-amber-100">
          {language === "en"
            ? "Complete the body location before continuing."
            : "Completa la ubicación del cuerpo antes de continuar."}
        </div>
      ) : null}

      <div className="mt-6 flex items-center justify-between gap-3">
        <button
          type="button"
          onClick={() => router.push("/cotizacion/tamano")}
          className="rounded-xl border border-white/10 bg-white/5 px-5 py-3 text-sm font-semibold text-zinc-100 transition hover:bg-white/8"
        >
          {t("commonBack")}
        </button>

        <button
          type="button"
          onClick={handleContinue}
          disabled={!isLocationComplete}
          aria-disabled={!isLocationComplete}
          className={[
            "group inline-flex items-center justify-center gap-2 rounded-xl border px-6 py-3 text-sm font-bold uppercase tracking-[0.2em] text-white transition",
            isLocationComplete
              ? "border-violet-500/35 bg-gradient-to-r from-violet-700 to-fuchsia-600 hover:-translate-y-0.5 hover:shadow-[0_0_20px_rgba(139,92,246,0.35)]"
              : "cursor-not-allowed border-white/10 bg-white/10 text-zinc-500",
          ].join(" ")}
        >
          {t("quoteContinue")}
          <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
        </button>
      </div>
    </QuoteShell>
  );
}