"use client";

import Image from "next/image";
import Link from "next/link";
import { ExternalLink, Heart } from "lucide-react";
import { QuoteShell } from "@/widgets/quote/QuoteShell";
import { useSiteLanguage } from "@/shared/i18n/LanguageProvider";

export function QuoteThanksStep() {
  const { t } = useSiteLanguage();

  return (
    <QuoteShell brand="MALIANTEO">
      <section className="relative mx-auto max-w-3xl">
        <div className="pointer-events-none absolute -left-16 -top-16 h-48 w-48 rounded-full bg-fuchsia-600/20 blur-[80px]" />
        <div className="pointer-events-none absolute -right-10 bottom-0 h-44 w-44 rounded-full bg-violet-600/20 blur-[80px]" />

        <article className="glass-card relative overflow-hidden rounded-3xl border border-violet-400/20 p-6 text-center md:p-8">
          <div className="absolute inset-0 bg-[radial-gradient(520px_220px_at_50%_0%,rgba(217,70,239,0.16),transparent_65%)]" />

          <div className="relative z-10">
            <p className="typo-tech inline-flex items-center gap-2 uppercase tracking-[0.16em] text-violet-200/90">
              <Heart className="h-4 w-4 text-fuchsia-300" />
              {t("quoteThanksTag")}
            </p>

            <h1 className="typo-section mt-3 text-[2rem] leading-[1.05] md:text-[2.8rem]">
              {t("quoteThanksTitle")}
            </h1>

            <p className="typo-body mx-auto mt-4 max-w-2xl text-zinc-200">{t("quoteThanksBody")}</p>
            <p className="typo-tech mx-auto mt-3 max-w-2xl text-zinc-400">{t("quoteThanksDataSaved")}</p>

            <div className="mt-7 grid gap-3 sm:grid-cols-3">
              <a
                href="https://www.instagram.com/malianteo_ink/"
                target="_blank"
                rel="noreferrer"
                className="group inline-flex items-center justify-center gap-2 rounded-2xl border border-fuchsia-400/35 bg-gradient-to-r from-fuchsia-600 to-violet-600 px-5 py-4 text-sm font-bold uppercase tracking-[0.14em] text-white transition hover:-translate-y-0.5 hover:shadow-[0_0_28px_rgba(217,70,239,0.45)]"
              >
                <span className="relative h-6 w-6 overflow-hidden rounded-full">
                  <Image
                    src="/brand/instagram-bubble-clean.png"
                    alt="Instagram"
                    fill
                    className="object-contain"
                  />
                </span>
                {t("quoteThanksInstagramCta")}
                <ExternalLink className="h-4 w-4" />
              </a>

              <Link
                href="/cotizacion"
                className="inline-flex items-center justify-center rounded-2xl border border-white/15 bg-white/5 px-5 py-4 text-sm font-semibold uppercase tracking-[0.14em] text-zinc-100 transition hover:bg-white/10"
              >
                {t("quoteThanksNewQuoteCta")}
              </Link>

              <a
                href="https://wa.me/573104798643?text=Hola%20Malianteo%2C%20quiero%20seguir%20con%20mi%20proceso."
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center justify-center gap-2 rounded-2xl border border-emerald-400/35 bg-emerald-500/15 px-5 py-4 text-sm font-semibold uppercase tracking-[0.14em] text-emerald-100 transition hover:bg-emerald-500/20"
              >
                <span className="relative h-6 w-6 overflow-hidden rounded-full">
                  <Image
                    src="/brand/whatsapp-bubble-clean.png"
                    alt="WhatsApp"
                    fill
                    className="object-contain"
                  />
                </span>
                {t("quoteThanksWhatsappCta")}
              </a>
            </div>
          </div>
        </article>
      </section>
    </QuoteShell>
  );
}
