"use client";

import Image from "next/image";
import Link from "next/link";
import { BRAND, WHATSAPP_MESSAGES, whatsappUrl } from "@/shared/config/brand";
import { STUDIO } from "@/shared/config/studio";
import { useSiteLanguage } from "@/shared/i18n/LanguageProvider";
import { SocialBrandIcon } from "@/shared/ui/SocialBrandIcon";

const FOOTER_LINKS = [
  { href: "/proyectos", labelKey: "navPortfolio" as const },
  { href: "/#trayectoria", labelKey: "navAwards" as const },
  { href: "/#aprender", labelKey: "navSeminar" as const },
  { href: "/#artista", labelKey: "merchTag" as const },
  { href: "/tienda", labelKey: "navShop" as const },
  { href: "/contacto", labelKey: "navContact" as const },
];

export function SiteFooter() {
  const { t } = useSiteLanguage();
  const year = new Date().getFullYear();

  return (
    <footer className="border-t border-[rgba(var(--rgb-sand),0.12)] bg-[#0a0708] px-4 py-7 sm:px-6 md:py-8">
      <div className="mx-auto flex max-w-[1400px] flex-col gap-6">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between lg:gap-8">
          <div className="min-w-0">
            <Link
              href="/"
              className="inline-flex items-center transition hover:opacity-95 active:scale-[0.98]"
              aria-label={BRAND.name}
            >
              <Image
                src={BRAND.logoMarkSrc}
                alt=""
                width={48}
                height={48}
                className="h-11 w-11 object-contain drop-shadow-[0_8px_16px_rgba(0,0,0,0.35)] sm:h-12 sm:w-12"
              />
            </Link>
            <p className="mt-2.5 font-mono text-[0.62rem] uppercase tracking-[0.16em] text-[rgba(var(--rgb-ivory),0.42)]">
              {t("footerBody")}
            </p>
          </div>

          <nav aria-label={t("footerNavLabel")}>
            <ul className="flex flex-wrap items-center gap-x-4 gap-y-2">
              {FOOTER_LINKS.map((link) => (
                <li key={link.href}>
                  <Link
                    href={link.href}
                    className="text-[0.72rem] font-semibold uppercase tracking-[0.12em] text-[rgba(var(--rgb-ivory),0.62)] transition hover:text-[rgba(var(--rgb-sand),0.95)]"
                    style={{ fontFamily: "var(--font-stack-display)" }}
                  >
                    {t(link.labelKey)}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>

          <div className="flex flex-wrap items-center gap-2.5">
            <a
              href={BRAND.instagramUrl}
              target="_blank"
              rel="noopener noreferrer"
              aria-label={t("footerInstagramAria")}
              className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-[rgba(var(--rgb-sand),0.16)] text-[rgba(var(--rgb-sand),0.8)] transition hover:border-[rgba(var(--rgb-sand),0.35)] hover:bg-[rgba(var(--rgb-terracotta),0.12)] active:scale-[0.98]"
            >
              <SocialBrandIcon network="instagram" framed={false} className="h-4 w-4 text-current" />
            </a>
            <a
              href={whatsappUrl(WHATSAPP_MESSAGES.contact)}
              target="_blank"
              rel="noopener noreferrer"
              aria-label={t("footerWhatsappAria")}
              className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-[rgba(var(--rgb-sand),0.16)] text-[rgba(var(--rgb-sand),0.8)] transition hover:border-[rgba(var(--rgb-sand),0.35)] hover:bg-[rgba(var(--rgb-terracotta),0.12)] active:scale-[0.98]"
            >
              <SocialBrandIcon network="whatsapp" framed={false} className="h-4 w-4 text-current" />
            </a>
          </div>
        </div>

        <div className="flex flex-col gap-2 border-t border-[rgba(var(--rgb-sand),0.1)] pt-4 sm:flex-row sm:items-center sm:justify-between">
          <p className="font-mono text-[0.6rem] uppercase tracking-[0.14em] text-[rgba(var(--rgb-ivory),0.35)]">
            © {year} {BRAND.name}. {t("footerRights")}
          </p>
          <a
            href={STUDIO.mapsUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="font-mono text-[0.6rem] uppercase tracking-[0.14em] text-[rgba(var(--rgb-ivory),0.4)] transition hover:text-[rgba(var(--rgb-sand),0.85)]"
          >
            {STUDIO.locationShort}
          </a>
        </div>
      </div>
    </footer>
  );
}
