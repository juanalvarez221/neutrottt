"use client";

import Link from "next/link";
import { useSiteLanguage } from "@/shared/i18n/LanguageProvider";

const FOOTER_LINKS = [
  { href: "/#tatuajes", labelKey: "navPortfolio" as const },
  { href: "/#premios", labelKey: "navAwards" as const },
  { href: "/#seminario", labelKey: "navSeminar" as const },
  { href: "/tienda", labelKey: "navShop" as const },
  { href: "/contacto", labelKey: "navContact" as const },
];

export function SiteFooter() {
  const { t } = useSiteLanguage();

  return (
    <footer className="section-surface border-t border-white/[0.06] px-4 py-14 sm:px-6 md:py-16">
      <div className="mx-auto grid max-w-[1400px] gap-10 md:grid-cols-[1.2fr_0.8fr] md:gap-16">
        <div>
          <p
            className="text-[2rem] leading-none text-[rgba(243,230,215,0.95)] sm:text-[2.4rem]"
            style={{ fontFamily: "var(--font-stack-lettering)" }}
          >
            {t("footerTag")}
          </p>
          <p className="mt-3 max-w-[42ch] text-sm leading-relaxed text-[rgba(var(--rgb-sand),0.65)]">
            {t("footerBody")}
          </p>

          <div className="mt-8 max-w-md border-t border-white/10 pt-6">
            <p className="typo-eyebrow typo-eyebrow-muted">{t("footerNewsletterTitle")}</p>
            <p className="mt-2 text-sm leading-relaxed text-[rgba(var(--rgb-sand),0.7)]">
              {t("footerNewsletterBody")}
            </p>
            <Link
              href="/cotizacion"
              className="btn-accent typo-cta mt-5 inline-flex items-center justify-center rounded-xl px-5 py-3 active:scale-[0.98]"
            >
              {t("footerNewsletterCta")}
            </Link>
          </div>
        </div>

        <div className="md:justify-self-end md:pt-2">
          <p className="typo-eyebrow typo-eyebrow-muted">{t("footerNavLabel")}</p>
          <ul className="mt-4 grid gap-2">
            {FOOTER_LINKS.map((link) => (
              <li key={link.href}>
                <Link
                  href={link.href}
                  className="text-sm font-semibold text-[rgba(243,230,215,0.78)] transition hover:text-[rgba(243,230,215,0.98)]"
                >
                  {t(link.labelKey)}
                </Link>
              </li>
            ))}
            <li>
              <Link
                href="/cotizacion"
                className="text-sm font-semibold text-[rgba(var(--rgb-sand),0.9)] transition hover:text-[rgba(var(--rgb-sand),1)]"
              >
                {t("navBookCta")}
              </Link>
            </li>
          </ul>
        </div>
      </div>
    </footer>
  );
}
