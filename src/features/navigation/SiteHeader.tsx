"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Menu, ShoppingBag, X } from "lucide-react";
import { useReducedMotion } from "framer-motion";
import { LanguageToggle } from "@/features/navigation/LanguageToggle";
import { useCart } from "@/shared/lib/cart";
import { useSiteLanguage } from "@/shared/i18n/LanguageProvider";
import { cn } from "@/shared/lib/cn";

type NavLink = {
  href: string;
  labelKey:
    | "navPortfolio"
    | "navAwards"
    | "navSeminar"
    | "navShop"
    | "navContact";
};

const NAV_LINKS: NavLink[] = [
  { href: "/#tatuajes", labelKey: "navPortfolio" },
  { href: "/#premios", labelKey: "navAwards" },
  { href: "/#seminario", labelKey: "navSeminar" },
  { href: "/tienda", labelKey: "navShop" },
  { href: "/contacto", labelKey: "navContact" },
];

function isHiddenRoute(pathname: string): boolean {
  return pathname.startsWith("/cotizacion") || pathname.startsWith("/admin");
}

export function SiteHeader() {
  const pathname = usePathname();
  const { t } = useSiteLanguage();
  const { dispatch, itemCount } = useCart();
  const reduceMotion = useReducedMotion();
  const [scrolled, setScrolled] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    setMenuOpen(false);
  }, [pathname]);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 24);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    if (!menuOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [menuOpen]);

  if (isHiddenRoute(pathname)) return null;

  return (
    <header
      className={cn(
        "site-header fixed inset-x-0 top-0 z-[80]",
        scrolled || menuOpen ? "site-header--solid" : "site-header--clear",
        reduceMotion && "site-header--instant",
      )}
    >
      <div className="mx-auto flex h-14 max-w-[1400px] items-center gap-3 px-4 sm:h-16 sm:px-6 lg:px-8">
        <Link
          href="/"
          className="site-header__wordmark shrink-0 text-[1.35rem] leading-none sm:text-[1.55rem]"
          style={{ fontFamily: "var(--font-stack-lettering)" }}
        >
          Danniel Cuervo
        </Link>

        <nav className="ml-6 hidden items-center gap-1 lg:flex" aria-label="Principal">
          {NAV_LINKS.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="rounded-lg px-2.5 py-1.5 text-[0.72rem] font-semibold uppercase tracking-[0.14em] text-[rgba(243,230,215,0.72)] transition hover:bg-white/5 hover:text-[rgba(243,230,215,0.95)]"
            >
              {t(item.labelKey)}
            </Link>
          ))}
        </nav>

        <div className="ml-auto flex items-center gap-2 sm:gap-2.5">
          <div className="hidden sm:block">
            <LanguageToggle />
          </div>

          <button
            type="button"
            onClick={() => dispatch({ type: "OPEN" })}
            className="relative inline-flex h-10 w-10 items-center justify-center rounded-xl border border-white/10 bg-white/[0.04] text-[rgba(243,230,215,0.9)] transition hover:bg-white/[0.08] active:scale-[0.98]"
            aria-label={t("shopCartOpen")}
          >
            <ShoppingBag className="h-4 w-4" strokeWidth={1.75} />
            {itemCount > 0 ? (
              <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-[rgba(var(--rgb-camel),0.95)] px-1 font-mono text-[10px] font-bold text-[#1a120c]">
                {itemCount > 99 ? "99+" : itemCount}
              </span>
            ) : null}
          </button>

          <Link
            href="/cotizacion"
            className="btn-accent typo-cta hidden items-center justify-center rounded-xl px-3.5 py-2.5 text-[0.68rem] sm:inline-flex md:px-4"
          >
            {t("navBookCta")}
          </Link>

          <button
            type="button"
            className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-white/10 bg-white/[0.04] text-[rgba(243,230,215,0.9)] lg:hidden"
            aria-expanded={menuOpen}
            aria-controls="site-header-mobile-nav"
            aria-label={menuOpen ? t("navCloseMenu") : t("navOpenMenu")}
            onClick={() => setMenuOpen((open) => !open)}
          >
            {menuOpen ? (
              <X className="h-4 w-4" strokeWidth={1.75} />
            ) : (
              <Menu className="h-4 w-4" strokeWidth={1.75} />
            )}
          </button>
        </div>
      </div>

      {menuOpen ? (
        <div
          id="site-header-mobile-nav"
          className="border-t border-white/10 bg-[#14100d]/96 backdrop-blur-xl lg:hidden"
        >
          <nav className="mx-auto flex max-w-[1400px] flex-col gap-1 px-4 py-4 sm:px-6" aria-label="Mobile">
            {NAV_LINKS.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setMenuOpen(false)}
                className="rounded-xl px-3 py-3 text-sm font-semibold tracking-wide text-[rgba(243,230,215,0.9)] transition hover:bg-white/5"
              >
                {t(item.labelKey)}
              </Link>
            ))}
            <div className="mt-2 flex items-center justify-between gap-3 border-t border-white/10 pt-4">
              <LanguageToggle />
              <Link
                href="/cotizacion"
                onClick={() => setMenuOpen(false)}
                className="btn-accent typo-cta inline-flex flex-1 items-center justify-center rounded-xl px-4 py-3"
              >
                {t("navBookCta")}
              </Link>
            </div>
          </nav>
        </div>
      ) : null}
    </header>
  );
}
