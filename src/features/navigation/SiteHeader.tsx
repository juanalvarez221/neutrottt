"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ShoppingBag } from "lucide-react";
import { useReducedMotion } from "framer-motion";
import { BRAND } from "@/shared/config/brand";
import { useCart } from "@/shared/lib/cart";
import { useSiteLanguage } from "@/shared/i18n/LanguageProvider";
import type { SiteCopyKey } from "@/shared/i18n/siteLanguage";
import { cn } from "@/shared/lib/cn";

type NavLink = {
  href: string;
  labelKey: SiteCopyKey;
  /** Etiqueta abreviada para que el carrito nunca quede fuera de pantalla en moviles estrechos. */
  shortLabelKey?: SiteCopyKey;
  /** Se oculta por debajo de 320px para evitar etiquetas truncadas. */
  optional?: boolean;
};

const NAV_LINKS: NavLink[] = [
  {
    href: "/premios",
    labelKey: "navAwards",
    shortLabelKey: "navAwardsShort",
    optional: true,
  },
  { href: "/tienda", labelKey: "navShop" },
];

function isHiddenRoute(pathname: string): boolean {
  return pathname.startsWith("/cotizacion") || pathname.startsWith("/admin");
}

function isActiveLink(pathname: string, href: string): boolean {
  if (href.startsWith("/#")) return false;
  if (href === "/tienda") return pathname.startsWith("/tienda");
  if (href === "/premios") return pathname === "/premios" || pathname.startsWith("/premios/");
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function SiteHeader() {
  const pathname = usePathname();
  const { t } = useSiteLanguage();
  const { dispatch, itemCount } = useCart();
  const reduceMotion = useReducedMotion();
  const [scrolled, setScrolled] = useState(false);
  const [hidden, setHidden] = useState(false);

  useEffect(() => {
    let lastY = window.scrollY;
    let ticking = false;

    const update = () => {
      const y = window.scrollY;
      const delta = y - lastY;
      setScrolled(y > 24);

      if (y < 48) {
        setHidden(false);
      } else if (delta > 6) {
        setHidden(true);
      } else if (delta < -6) {
        setHidden(false);
      }

      lastY = y;
      ticking = false;
    };

    const onScroll = () => {
      if (ticking) return;
      ticking = true;
      window.requestAnimationFrame(update);
    };

    update();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  if (isHiddenRoute(pathname)) return null;

  return (
    <header
      className={cn(
        "site-header fixed inset-x-0 top-0 z-[80]",
        scrolled ? "site-header--solid" : "site-header--clear",
        hidden ? "site-header--hidden" : "site-header--visible",
        reduceMotion && "site-header--instant",
      )}
    >
      <div className="mx-auto flex h-14 max-w-[1400px] items-center gap-3 px-4 sm:h-[4.25rem] sm:gap-4 sm:px-6 lg:px-8">
        <Link
          href="/"
          className="site-header__logo shrink-0"
          aria-label={BRAND.name}
        >
          <span className="site-header__mark" aria-hidden>
            <Image
              src={BRAND.logoMarkSrc}
              alt=""
              width={56}
              height={56}
              priority
              className="site-header__mark-img"
            />
          </span>
        </Link>

        <nav
          className="ml-auto flex min-w-0 items-center gap-0.5 sm:gap-1"
          aria-label={t("navPrimaryLabel")}
        >
          {NAV_LINKS.map((item) => {
            const active = isActiveLink(pathname, item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "relative inline-flex min-h-11 min-w-0 items-center px-2 text-[0.62rem] font-semibold uppercase tracking-[0.1em] transition min-[400px]:px-2.5 min-[400px]:tracking-[0.14em] sm:px-3 sm:text-[0.68rem] sm:tracking-[0.16em]",
                  item.optional && "hidden min-[320px]:inline-flex",
                  active
                    ? "text-[rgba(var(--rgb-sand),0.96)]"
                    : "text-[rgba(var(--rgb-ivory),0.55)] hover:text-[rgba(var(--rgb-sand),0.92)]",
                )}
                style={{ fontFamily: "var(--font-stack-display)" }}
              >
                <span className="truncate">
                  {item.shortLabelKey ? (
                    <>
                      <span className="min-[520px]:hidden">{t(item.shortLabelKey)}</span>
                      <span className="hidden min-[520px]:inline">{t(item.labelKey)}</span>
                    </>
                  ) : (
                    t(item.labelKey)
                  )}
                </span>
                {active ? (
                  <span
                    className="absolute inset-x-2 bottom-1 h-px bg-[rgba(var(--rgb-honey),0.55)] min-[400px]:inset-x-2.5 sm:inset-x-3"
                    aria-hidden
                  />
                ) : null}
              </Link>
            );
          })}

          <button
            type="button"
            onClick={() => dispatch({ type: "OPEN" })}
            className="relative ml-1 inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-[rgba(var(--rgb-sand),0.14)] bg-[rgba(255,255,255,0.03)] text-[rgba(var(--rgb-sand),0.88)] transition hover:border-[rgba(var(--rgb-sand),0.28)] hover:bg-[rgba(255,255,255,0.06)] active:scale-[0.98]"
            aria-label={t("shopCartOpen")}
          >
            <ShoppingBag className="h-4 w-4" strokeWidth={1.6} />
            {itemCount > 0 ? (
              <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-[rgba(var(--rgb-terracotta),0.95)] px-1 font-mono text-[10px] font-bold text-[rgba(var(--rgb-ivory),0.96)]">
                {itemCount > 99 ? "99+" : itemCount}
              </span>
            ) : null}
          </button>
        </nav>
      </div>
    </header>
  );
}
