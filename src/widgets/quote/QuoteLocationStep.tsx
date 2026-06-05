"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { QuoteShell } from "@/widgets/quote/QuoteShell";
import { ArrowRight } from "lucide-react";
import { BodyAreaSelector, type ZoneId } from "@/widgets/quote/BodyAreaSelector";
import { useSiteLanguage } from "@/shared/i18n/LanguageProvider";
import { getQuoteConnection } from "@/shared/lib/quoteConnection";
import { getQuoteDraft, isLargeQuoteSize, saveQuoteDraft } from "@/shared/lib/quoteDraft";

export function QuoteLocationStep({ size }: { size: string }) {
  const router = useRouter();
  const { t } = useSiteLanguage();
  const [zone, setZone] = useState<ZoneId>("brazo");

  const isLarge = isLargeQuoteSize(size);

  useEffect(() => {
    if (!getQuoteConnection()) {
      router.replace("/cotizacion/conexion");
      return;
    }
    const saved = getQuoteDraft();
    if (saved?.zone && saved.size === size) {
      setZone(saved.zone as ZoneId);
    }
  }, [router, size]);

  const nextHref = useMemo(
    () =>
      `/cotizacion/referencia?size=${encodeURIComponent(size)}&zone=${encodeURIComponent(zone)}`,
    [size, zone],
  );

  const goNext = () => {
    saveQuoteDraft({ size, zone, notes: getQuoteDraft()?.notes ?? "" });
    router.push(nextHref);
  };

  return (
    <QuoteShell>
      <section className="relative mb-8">
        <div className="pointer-events-none absolute -left-10 -top-10 h-40 w-40 rounded-full bg-amber-600/15 blur-[60px]" />
        <p className="typo-tech mb-2 uppercase tracking-[0.16em] text-amber-200/85">
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
          {isLarge ? t("quoteLocationBodyLarge") : t("quoteLocationBody")}
        </p>
      </section>

      <section className="mb-8">
        <div className="glass-card rounded-2xl p-5">
          <div className="mb-4 flex items-center gap-3">
            <div className="flex h-6 w-6 items-center justify-center rounded-full border border-amber-500/30 bg-amber-600/10">
              <span className="text-[10px] font-bold text-white">4</span>
            </div>
            <h3 className="typo-subtitle text-sm uppercase tracking-[0.14em] text-zinc-200">
              {t("quoteLocationCardTitle")}
            </h3>
          </div>
          <BodyAreaSelector zone={zone} onZoneChange={setZone} isLargeProject={isLarge} />
        </div>
      </section>

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
          onClick={goNext}
          className="group inline-flex items-center justify-center gap-2 rounded-xl border border-amber-500/35 bg-gradient-to-r from-amber-700 to-orange-600 px-6 py-3 text-sm font-bold uppercase tracking-[0.2em] text-white transition hover:-translate-y-0.5 hover:shadow-[0_0_20px_rgba(245,158,11,0.35)]"
        >
          {t("quoteContinue")}
          <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
        </button>
      </div>
    </QuoteShell>
  );
}
