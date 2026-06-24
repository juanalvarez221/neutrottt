"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ExternalLink, Heart } from "lucide-react";
import { SocialBrandIcon } from "@/shared/ui/SocialBrandIcon";
import { BRAND, WHATSAPP_MESSAGES, whatsappUrl } from "@/shared/config/brand";
import { QuoteShell } from "@/widgets/quote/QuoteShell";
import { useSiteLanguage } from "@/shared/i18n/LanguageProvider";
import { getQuoteCompletionType } from "@/shared/lib/quoteDraft";
import { QUOTE_FLOW_PATHS, startNewQuoteSession } from "@/shared/lib/quoteFlow";

type AdvisoryConfirmation = {
  label: string;
  mode: "presencial" | "virtual";
  whatsappUrl: string;
  meetingLink?: string;
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
    "btn-accent focus-ring typo-cta inline-flex items-center justify-center gap-2 rounded-2xl px-5 py-4 active:scale-[0.98]";
  const secondaryCtaClass =
    "btn-ghost-warm focus-ring inline-flex items-center justify-center rounded-2xl px-5 py-4 text-sm font-semibold uppercase tracking-[0.14em] active:scale-[0.98]";

  const whatsappHref =
    isAdvisory && advisoryConfirmation?.whatsappUrl
      ? advisoryConfirmation.whatsappUrl
      : whatsappUrl(WHATSAPP_MESSAGES.quoteFollowUp);

  return (
    <QuoteShell greetingKey="quoteGreetThanks">
      <section className="relative mx-auto max-w-3xl">
        <div className="pointer-events-none absolute -left-16 -top-16 h-48 w-48 rounded-full bg-stone-600/15 blur-[80px]" />
        <div className="pointer-events-none absolute -right-10 bottom-0 h-44 w-44 rounded-full bg-stone-500/12 blur-[80px]" />

        <article className="glass-card relative overflow-hidden rounded-3xl border border-stone-500/20 p-6 text-center md:p-8">
          <div className="absolute inset-0 bg-[radial-gradient(520px_220px_at_50%_0%,rgba(107,99,92,0.12),transparent_65%)]" />

          <div className="relative z-10">
            <p className="typo-tech inline-flex items-center gap-2 uppercase tracking-[0.16em] text-stone-300">
              <Heart className="h-4 w-4 text-stone-400" />
              {t("quoteThanksTag")}
            </p>

            <h1 className="typo-section quote-step-title mt-3">
              {isAdvisory ? t("quoteThanksAdvisoryTitle") : t("quoteThanksTitle")}
            </h1>

            <p className="typo-body mx-auto mt-4 max-w-2xl text-zinc-200">
              {isAdvisory ? t("quoteThanksAdvisoryBody") : t("quoteThanksBody")}
            </p>

            {isAdvisory && advisoryConfirmation ? (
              <div className="mx-auto mt-4 max-w-xl rounded-2xl border border-stone-500/20 bg-stone-600/10 px-4 py-4 text-left">
                <p className="typo-tech text-xs uppercase tracking-[0.14em] text-stone-400">
                  {t("quoteThanksAdvisorySlot")}
                </p>
                <p className="typo-subtitle mt-1 text-base text-zinc-50">
                  {advisoryConfirmation.label}
                </p>
                <div className="mt-3 space-y-2 text-sm text-zinc-300">
                  <p>Te enviamos los detalles por correo y WhatsApp.</p>
                  <p>Si la asesoría es virtual, recibirás el enlace de reunión en ambos canales.</p>
                  {advisoryConfirmation.meetingLink ? (
                    <div className="rounded-xl border border-amber-500/20 bg-amber-500/10 p-3">
                      <p className="font-semibold text-amber-100">Enlace de reunión</p>
                      <a
                        href={advisoryConfirmation.meetingLink}
                        target="_blank"
                        rel="noreferrer"
                        className="mt-1 inline-flex break-all text-amber-200 underline underline-offset-4"
                      >
                        {advisoryConfirmation.meetingLink}
                      </a>
                    </div>
                  ) : null}
                </div>
              </div>
            ) : null}

            <p className="typo-tech mx-auto mt-3 max-w-2xl text-zinc-400">{t("quoteThanksDataSaved")}</p>

            <div className="mt-7 grid gap-3 md:grid-cols-3">
              <a
                href={BRAND.instagramUrl}
                target="_blank"
                rel="noreferrer"
                className={socialCtaClass}
              >
                <SocialBrandIcon network="instagram" className="h-11 w-11" />
                {t("quoteThanksInstagramCta")}
                <ExternalLink className="h-4 w-4" />
              </a>

              <Link
                href={QUOTE_FLOW_PATHS.quoteStart}
                onClick={() => startNewQuoteSession()}
                className={secondaryCtaClass}
              >
                {t("quoteThanksNewQuoteCta")}
              </Link>

              <a
                href={whatsappHref}
                target="_blank"
                rel="noreferrer"
                className={socialCtaClass}
              >
                <SocialBrandIcon network="whatsapp" className="h-11 w-11" />
                {isAdvisory ? t("quoteThanksAdvisoryWhatsapp") : t("quoteThanksWhatsappCta")}
              </a>
            </div>
          </div>
        </article>
      </section>
    </QuoteShell>
  );
}
