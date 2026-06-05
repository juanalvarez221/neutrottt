"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { ExternalLink, MapPin, Video } from "lucide-react";
import { QuoteShell } from "@/widgets/quote/QuoteShell";
import { useSiteLanguage } from "@/shared/i18n/LanguageProvider";
import { getQuoteConnection } from "@/shared/lib/quoteConnection";
import { getQuoteDraft, isLargeQuoteSize } from "@/shared/lib/quoteDraft";
import { getQuoteProfile } from "@/shared/lib/quoteProfile";
import { getStudioFullAddress, STUDIO } from "@/shared/config/studio";

export function QuoteAdvisoryStep({ size }: { size: string }) {
  const router = useRouter();
  const { t } = useSiteLanguage();

  useEffect(() => {
    if (!getQuoteProfile() || !getQuoteConnection()) {
      router.replace("/cotizacion");
      return;
    }
    if (!isLargeQuoteSize(size)) {
      router.replace(`/cotizacion/ubicacion?size=${encodeURIComponent(size)}`);
      return;
    }
    const draft = getQuoteDraft();
    if (!draft?.zone) {
      router.replace(`/cotizacion/ubicacion?size=${encodeURIComponent(size)}`);
    }
  }, [router, size]);

  const goToBooking = (mode: "presencial" | "virtual") => {
    router.push(
      `/cotizacion/asesoria/agendar?mode=${mode}&size=${encodeURIComponent(size)}`,
    );
  };

  return (
    <QuoteShell>
      <section className="relative mb-8">
        <div className="pointer-events-none absolute -left-10 -top-10 h-40 w-40 rounded-full bg-amber-600/15 blur-[60px]" />
        <p className="typo-tech mb-2 uppercase tracking-[0.16em] text-amber-200/85">
          {t("quoteAdvisoryStep")}
        </p>
        <h2 className="typo-section text-[2.2rem] leading-[1.05] md:text-[3.2rem]">
          {t("quoteAdvisoryTitle")}
          <br />
          <span className="bg-gradient-to-r from-white to-zinc-400 bg-clip-text text-transparent">
            {t("quoteAdvisoryTitle2")}
          </span>
        </h2>
        <p className="typo-body mt-3 max-w-lg text-sm text-zinc-300">{t("quoteAdvisoryBody")}</p>
      </section>

      <section className="grid gap-4 md:grid-cols-2">
        <button
          type="button"
          onClick={() => goToBooking("presencial")}
          className="glass-card group rounded-2xl p-5 text-left transition hover:-translate-y-1 hover:border-amber-500/30"
        >
          <div className="mb-4 inline-flex h-11 w-11 items-center justify-center rounded-2xl border border-amber-500/30 bg-amber-600/15">
            <MapPin className="h-5 w-5 text-amber-200" />
          </div>
          <h3 className="typo-subtitle text-base text-zinc-50">
            {t("quoteAdvisoryPresencialTitle")}
          </h3>
          <p className="mt-2 text-sm font-semibold text-amber-100/90">
            {t("quoteAdvisoryPresencialStudio")}
          </p>
          <a
            href={STUDIO.mapsUrl}
            target="_blank"
            rel="noreferrer"
            onClick={(event) => event.stopPropagation()}
            className="typo-tech mt-1 inline-flex items-center gap-1 text-xs text-zinc-400 transition hover:text-amber-200/90"
          >
            {getStudioFullAddress()}
            <ExternalLink className="h-3 w-3" />
          </a>
          <p className="typo-body mt-3 text-sm text-zinc-300">{t("quoteAdvisoryPresencialBody")}</p>
          <span className="typo-cta mt-5 inline-flex items-center gap-2 text-sm font-bold uppercase tracking-[0.14em] text-amber-200 transition group-hover:text-amber-100">
            {t("quoteAdvisoryPresencialCta")}
          </span>
        </button>

        <button
          type="button"
          onClick={() => goToBooking("virtual")}
          className="glass-card group rounded-2xl p-5 text-left transition hover:-translate-y-1 hover:border-amber-500/30"
        >
          <div className="mb-4 inline-flex h-11 w-11 items-center justify-center rounded-2xl border border-amber-500/30 bg-amber-600/15">
            <Video className="h-5 w-5 text-amber-200" />
          </div>
          <h3 className="typo-subtitle text-base text-zinc-50">{t("quoteAdvisoryVirtualTitle")}</h3>
          <p className="mt-2 text-sm font-semibold text-amber-100/90">
            {t("quoteAdvisoryVirtualPlatform")}
          </p>
          <p className="typo-tech mt-1 text-xs text-zinc-400">{t("quoteAdvisoryVirtualDetail")}</p>
          <p className="typo-body mt-3 text-sm text-zinc-300">{t("quoteAdvisoryVirtualBody")}</p>
          <span className="typo-cta mt-5 inline-flex items-center gap-2 text-sm font-bold uppercase tracking-[0.14em] text-amber-200 transition group-hover:text-amber-100">
            {t("quoteAdvisoryVirtualCta")}
          </span>
        </button>
      </section>

      <p className="typo-tech mt-5 text-xs uppercase tracking-[0.14em] text-zinc-500">
        {t("quoteAdvisoryNote")}
      </p>

      <div className="mt-8">
        <button
          type="button"
          onClick={() => {
            const draft = getQuoteDraft();
            const zone = draft?.zone ?? "";
            router.push(
              `/cotizacion/referencia?size=${encodeURIComponent(size)}&zone=${encodeURIComponent(zone)}`,
            );
          }}
          className="rounded-xl border border-white/10 bg-white/5 px-5 py-3 text-sm font-semibold text-zinc-100 transition hover:bg-white/8"
        >
          {t("commonBack")}
        </button>
      </div>
    </QuoteShell>
  );
}
