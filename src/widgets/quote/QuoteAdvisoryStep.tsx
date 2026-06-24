"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { ExternalLink, MapPin, Video } from "lucide-react";
import { motion, useReducedMotion } from "framer-motion";
import { AdvisoryModalityCard } from "@/widgets/quote/AdvisoryModalityCard";
import { QuoteShell } from "@/widgets/quote/QuoteShell";
import { useSiteLanguage } from "@/shared/i18n/LanguageProvider";
import { getAdvisoryDurationMin } from "@/shared/lib/advisoryConfig";
import { getQuoteDraft, isLargeQuoteSize } from "@/shared/lib/quoteDraft";
import { useQuoteOnboardingGate } from "@/widgets/quote/useQuoteOnboardingGate";
import { getStudioFullAddress, STUDIO } from "@/shared/config/studio";

const easeOut = [0.22, 1, 0.36, 1] as const;

export function QuoteAdvisoryStep({ size }: { size: string }) {
  const router = useRouter();
  const { t } = useSiteLanguage();
  const reduceMotion = useReducedMotion();
  const gateReady = useQuoteOnboardingGate();

  useEffect(() => {
    if (!gateReady) return;
    if (!isLargeQuoteSize(size)) {
      router.replace(`/cotizacion/ubicacion?size=${encodeURIComponent(size)}`);
      return;
    }
    const draft = getQuoteDraft();
    if (!draft?.zone) {
      router.replace(`/cotizacion/ubicacion?size=${encodeURIComponent(size)}`);
    }
  }, [gateReady, router, size]);

  const goToBooking = (mode: "presencial" | "virtual") => {
    router.push(
      `/cotizacion/asesoria/agendar?mode=${mode}&size=${encodeURIComponent(size)}`,
    );
  };

  return (
    <QuoteShell greetingKey="quoteGreetAdvisory">
      <motion.section
        initial={reduceMotion ? false : { opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: easeOut }}
        className="mb-9 border-b border-white/[0.07] pb-8 md:mb-11 md:pb-10"
      >
        <div className="flex flex-col gap-7 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-2xl">
            <p className="typo-eyebrow typo-eyebrow-muted mb-4">{t("quoteAdvisoryStep")}</p>
            <h2 className="typo-section quote-step-title">
              {t("quoteAdvisoryTitle")}{" "}
              <span className="text-zinc-400">{t("quoteAdvisoryTitle2")}</span>
            </h2>
            <p className="typo-body mt-4 max-w-lg leading-relaxed text-zinc-400">
              {t("quoteAdvisoryBody")}
            </p>
          </div>

          <div className="flex shrink-0 items-center gap-3 self-start rounded-xl border border-white/[0.06] bg-white/[0.025] px-4 py-3 lg:self-auto">
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[rgba(var(--rgb-camel),0.35)] opacity-60" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-[rgba(var(--rgb-camel),0.85)]" />
            </span>
            <span className="typo-tech text-[11px] tracking-[0.16em] text-zinc-300">
              {t("quoteAdvisorySavedBadge")}
            </span>
          </div>
        </div>
      </motion.section>

      <section className="grid gap-4 md:grid-cols-2 md:gap-5">
        <AdvisoryModalityCard
          icon={MapPin}
          title={t("quoteAdvisoryPresencialTitle")}
          eyebrow={t("quoteAdvisoryPresencialStudio")}
          body={t("quoteAdvisoryPresencialBody")}
          cta={t("quoteAdvisoryPresencialCta")}
          durationMin={getAdvisoryDurationMin("presencial")}
          onClick={() => goToBooking("presencial")}
          detailLink={
            <a
              href={STUDIO.mapsUrl}
              target="_blank"
              rel="noreferrer"
              onClick={(event) => event.stopPropagation()}
              className="typo-ui-meta inline-flex items-center gap-1 text-zinc-500 transition hover:text-[rgba(var(--rgb-ivory),0.8)]"
            >
              {getStudioFullAddress()}
              <ExternalLink className="h-3 w-3 opacity-70" />
            </a>
          }
        />

        <AdvisoryModalityCard
          icon={Video}
          title={t("quoteAdvisoryVirtualTitle")}
          eyebrow={t("quoteAdvisoryVirtualPlatform")}
          detail={t("quoteAdvisoryVirtualDetail")}
          body={t("quoteAdvisoryVirtualBody")}
          cta={t("quoteAdvisoryVirtualCta")}
          durationMin={getAdvisoryDurationMin("virtual")}
          onClick={() => goToBooking("virtual")}
        />
      </section>

      <p className="typo-ui-meta mt-5 text-center text-zinc-500 md:text-left">
        {t("quoteAdvisoryProjectSaved")}
      </p>

      <div className="quote-step-footer mt-8 md:mt-10">
        <button
          type="button"
          onClick={() => {
            const draft = getQuoteDraft();
            const zone = draft?.zone ?? "";
            router.push(
              `/cotizacion/referencia?size=${encodeURIComponent(size)}&zone=${encodeURIComponent(zone)}`,
            );
          }}
          className="quote-step-footer-back rounded-xl border border-white/10 bg-white/5 px-5 py-3 text-sm font-semibold text-zinc-100 transition hover:bg-white/8 active:scale-[0.98]"
        >
          {t("commonBack")}
        </button>
      </div>
    </QuoteShell>
  );
}
