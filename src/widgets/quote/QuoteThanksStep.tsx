"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ExternalLink, Heart } from "lucide-react";
import { SocialBrandIcon } from "@/shared/ui/SocialBrandIcon";
import { BRAND, WHATSAPP_MESSAGES, whatsappUrl } from "@/shared/config/brand";
import { QuoteShell } from "@/widgets/quote/QuoteShell";
import { useSiteLanguage } from "@/shared/i18n/LanguageProvider";
import { getQuoteCompletionType } from "@/shared/lib/quoteDraft";

type AdvisoryConfirmation = {
  label: string;
  mode: "presencial" | "virtual";
  whatsappUrl: string;
};

export function QuoteThanksStep() {
  const { t } = useSiteLanguage();
  const [isAdvisory, setIsAdvisory] = useState(false);
  const [advisoryConfirmation, setAdvisoryConfirmation] = useState<AdvisoryConfirmation | null>(
    null,
  );

  useEffect(() => {
    setIsAdvisory(getQuoteCompletionType() === "asesoria");
    const raw = sessionStorage.getItem("quote_advisory_confirmation");
    if (!raw) return;
    try {
      setAdvisoryConfirmation(JSON.parse(raw) as AdvisoryConfirmation);
    } catch {
      setAdvisoryConfirmation(null);
    }
  }, []);

  const socialCtaClass =
    "inline-flex items-center justify-center gap-2 rounded-2xl border border-orange-400/35 bg-gradient-to-r from-orange-600 to-amber-600 px-5 py-4 text-sm font-bold uppercase tracking-[0.14em] text-white transition hover:-translate-y-0.5 hover:shadow-[0_0_28px_rgba(249,115,22,0.45)]";
  const secondaryCtaClass =
    "inline-flex items-center justify-center rounded-2xl border border-amber-400/20 bg-white/[0.04] px-5 py-4 text-sm font-semibold uppercase tracking-[0.14em] text-amber-100/85 transition hover:border-amber-400/35 hover:bg-amber-950/25 hover:text-amber-50";

  const whatsappHref =
    isAdvisory && advisoryConfirmation?.whatsappUrl
      ? advisoryConfirmation.whatsappUrl
      : whatsappUrl(WHATSAPP_MESSAGES.quoteFollowUp);

  return (
    <QuoteShell>
      <section className="relative mx-auto max-w-3xl">
        <div className="pointer-events-none absolute -left-16 -top-16 h-48 w-48 rounded-full bg-orange-600/20 blur-[80px]" />
        <div className="pointer-events-none absolute -right-10 bottom-0 h-44 w-44 rounded-full bg-amber-600/20 blur-[80px]" />

        <article className="glass-card relative overflow-hidden rounded-3xl border border-amber-400/20 p-6 text-center md:p-8">
          <div className="absolute inset-0 bg-[radial-gradient(520px_220px_at_50%_0%,rgba(249,115,22,0.16),transparent_65%)]" />

          <div className="relative z-10">
            <p className="typo-tech inline-flex items-center gap-2 uppercase tracking-[0.16em] text-amber-200/90">
              <Heart className="h-4 w-4 text-orange-300" />
              {t("quoteThanksTag")}
            </p>

            <h1 className="typo-section mt-3 text-[2rem] leading-[1.05] md:text-[2.8rem]">
              {isAdvisory ? t("quoteThanksAdvisoryTitle") : t("quoteThanksTitle")}
            </h1>

            <p className="typo-body mx-auto mt-4 max-w-2xl text-zinc-200">
              {isAdvisory ? t("quoteThanksAdvisoryBody") : t("quoteThanksBody")}
            </p>

            {isAdvisory && advisoryConfirmation ? (
              <div className="mx-auto mt-4 max-w-xl rounded-2xl border border-amber-500/25 bg-amber-600/10 px-4 py-3 text-left">
                <p className="typo-tech text-xs uppercase tracking-[0.14em] text-amber-200/80">
                  {t("quoteThanksAdvisorySlot")}
                </p>
                <p className="typo-subtitle mt-1 text-base text-zinc-50">
                  {advisoryConfirmation.label}
                </p>
              </div>
            ) : null}

            <p className="typo-tech mx-auto mt-3 max-w-2xl text-zinc-400">{t("quoteThanksDataSaved")}</p>

            <div className="mt-7 grid gap-3 sm:grid-cols-3">
              <a
                href={BRAND.instagramUrl}
                target="_blank"
                rel="noreferrer"
                className={socialCtaClass}
              >
                <SocialBrandIcon network="instagram" size={36} className="h-9 w-9" />
                {t("quoteThanksInstagramCta")}
                <ExternalLink className="h-4 w-4" />
              </a>

              <Link href="/cotizacion" className={secondaryCtaClass}>
                {t("quoteThanksNewQuoteCta")}
              </Link>

              <a
                href={whatsappHref}
                target="_blank"
                rel="noreferrer"
                className={socialCtaClass}
              >
                <SocialBrandIcon network="whatsapp" size={36} className="h-9 w-9" />
                {isAdvisory ? t("quoteThanksAdvisoryWhatsapp") : t("quoteThanksWhatsappCta")}
              </a>
            </div>
          </div>
        </article>
      </section>
    </QuoteShell>
  );
}
