"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { QuoteShell } from "@/widgets/quote/QuoteShell";
import { ArrowRight } from "lucide-react";
import { BodyAreaSelector, type ZoneId } from "@/widgets/quote/BodyAreaSelector";
import { useSiteLanguage } from "@/shared/i18n/LanguageProvider";
import { getQuoteConnection } from "@/shared/lib/quoteConnection";
import { getQuoteDraft, isLargeQuoteSize, saveQuoteDraft } from "@/shared/lib/quoteDraft";
import { normalizeZoneId } from "@/shared/lib/quoteZones";

export function QuoteLocationStep({ size }: { size: string }) {
  const router = useRouter();
  const { t } = useSiteLanguage();
  const [zone, setZone] = useState<ZoneId>("brazo_completo");
  const [zoneOther, setZoneOther] = useState("");
  const [error, setError] = useState("");

  const isLarge = isLargeQuoteSize(size);

  useEffect(() => {
    if (!getQuoteConnection()) {
      router.replace("/cotizacion/conexion");
      return;
    }
    const saved = getQuoteDraft();
    if (saved?.zone && saved.size === size) {
      setZone(normalizeZoneId(saved.zone));
      setZoneOther(saved.zoneOther ?? "");
    }
  }, [router, size]);

  const nextHref = useMemo(() => {
    const params = new URLSearchParams({ size, zone });
    if (zone === "otro" && zoneOther.trim()) {
      params.set("zoneOther", zoneOther.trim());
    }
    return `/cotizacion/referencia?${params.toString()}`;
  }, [size, zone, zoneOther]);

  const goNext = () => {
    if (zone === "otro" && !zoneOther.trim()) {
      setError(t("quoteLocationErrorOther"));
      return;
    }
    setError("");
    saveQuoteDraft({
      size,
      zone,
      zoneOther: zone === "otro" ? zoneOther.trim() : undefined,
      notes: getQuoteDraft()?.notes ?? "",
    });
    router.push(nextHref);
  };

  return (
    <QuoteShell greetingKey="quoteGreetLocation">
      <section className="relative mb-8">
        <div className="pointer-events-none absolute -left-10 -top-10 h-40 w-40 rounded-full bg-stone-600/12 blur-[60px]" />
        <p className="typo-tech mb-2 uppercase tracking-[0.16em] text-stone-400">
          {t("quoteLocationStep")}
        </p>
        <h2 className="typo-section quote-step-title">
          {t("quoteLocationTitle")}
          <br />
          <span className="bg-gradient-to-r from-white to-zinc-400 bg-clip-text text-transparent">
            {t("quoteLocationTitle2")}
          </span>
        </h2>
        <p className="typo-body mt-4 max-w-2xl leading-relaxed">
          {isLarge ? t("quoteLocationBodyLarge") : t("quoteLocationBody")}
        </p>
        {isLarge ? (
          <p className="typo-tech mt-3 inline-flex rounded-full border border-stone-500/25 bg-stone-600/10 px-3 py-1.5 text-xs uppercase tracking-[0.14em] text-stone-300">
            {t("quoteSizeLargeNotice")}
          </p>
        ) : null}
      </section>

      <section className="mb-8">
        <div className="glass-card rounded-2xl p-5 md:p-6">
          <div className="mb-5 flex items-center gap-3">
            <div className="flex h-6 w-6 items-center justify-center rounded-full border border-stone-500/30 bg-stone-600/10">
              <span className="text-[10px] font-bold text-white">4</span>
            </div>
            <h3 className="typo-subtitle text-sm uppercase tracking-[0.14em] text-zinc-200">
              {t("quoteLocationCardTitle")}
            </h3>
          </div>
          <BodyAreaSelector
            zone={zone}
            zoneOther={zoneOther}
            onZoneChange={(nextZone) => {
              setZone(nextZone);
              setError("");
            }}
            onZoneOtherChange={setZoneOther}
            isLargeProject={isLarge}
          />
          {error ? <p className="mt-4 text-sm text-amber-200/90">{error}</p> : null}
        </div>
      </section>

      <div className="quote-step-footer mt-6">
        <button
          type="button"
          onClick={() => router.push("/cotizacion/tamano")}
          className="quote-step-footer-back rounded-xl border border-white/10 bg-white/5 px-5 py-3 text-sm font-semibold text-zinc-100 transition hover:bg-white/8"
        >
          {t("commonBack")}
        </button>

        <button
          type="button"
          onClick={goNext}
          className="quote-step-footer-next btn-accent focus-ring typo-cta group inline-flex items-center justify-center gap-2 rounded-xl px-6 py-3 active:scale-[0.98]"
        >
          {t("quoteContinue")}
          <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
        </button>
      </div>
    </QuoteShell>
  );
}
