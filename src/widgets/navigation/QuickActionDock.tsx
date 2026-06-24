"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { X, Zap } from "lucide-react";
import { BRAND, WHATSAPP_MESSAGES, whatsappUrl } from "@/shared/config/brand";
import { useSiteLanguage } from "@/shared/i18n/LanguageProvider";
import type { SiteCopyKey } from "@/shared/i18n/siteLanguage";
import { SocialBrandIcon } from "@/shared/ui/SocialBrandIcon";
import { cn } from "@/shared/lib/cn";

const APP_SHELL_ROUTES = ["/contacto", "/proyectos"] as const;
const QUOTE_ROUTE_PREFIX = "/cotizacion";

type DockAction = {
  id: string;
  labelKey: SiteCopyKey;
  href: string;
  external?: boolean;
  primary?: boolean;
  icon: "quote" | "whatsapp" | "instagram" | "tiktok";
};

const DOCK_ACTIONS: DockAction[] = [
  {
    id: "quote",
    labelKey: "quickActionsQuote",
    href: "/cotizacion",
    icon: "quote",
    primary: true,
  },
  {
    id: "whatsapp",
    labelKey: "quickActionsWhatsapp",
    href: whatsappUrl(WHATSAPP_MESSAGES.quote),
    external: true,
    icon: "whatsapp",
  },
  {
    id: "instagram",
    labelKey: "quickActionsInstagram",
    href: BRAND.instagramUrl,
    external: true,
    icon: "instagram",
  },
  {
    id: "tiktok",
    labelKey: "quickActionsTiktok",
    href: BRAND.tiktokUrl,
    external: true,
    icon: "tiktok",
  },
];

function resolveDockPlacement(pathname: string) {
  const hasMobileNav = APP_SHELL_ROUTES.some(
    (route) => pathname === route || pathname.startsWith(`${route}/`),
  );

  if (hasMobileNav) {
    return "quick-action-dock--nav";
  }

  return "quick-action-dock--default";
}

function ActionIcon({ icon }: { icon: DockAction["icon"] }) {
  return <SocialBrandIcon network={icon} framed={false} className="text-sand" />;
}

function QuickActionDockPanel({ pathname }: { pathname: string }) {
  const { t } = useSiteLanguage();
  const reduceMotion = useReducedMotion();
  const dockRef = useRef<HTMLDivElement>(null);
  const idleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const scrollTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [open, setOpen] = useState(false);
  const [isScrolling, setIsScrolling] = useState(false);
  const [isIdle, setIsIdle] = useState(false);

  const placement = resolveDockPlacement(pathname);

  const resetIdleTimer = useCallback(() => {
    setIsIdle(false);
    if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
    idleTimerRef.current = setTimeout(() => setIsIdle(true), 4200);
  }, []);

  const closeDock = useCallback(() => setOpen(false), []);

  useEffect(() => {
    const timer = setTimeout(() => setIsIdle(true), 4200);
    return () => {
      clearTimeout(timer);
      if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
      if (scrollTimerRef.current) clearTimeout(scrollTimerRef.current);
    };
  }, []);

  useEffect(() => {
    if (!open) return;

    const handlePointerDown = (event: PointerEvent) => {
      if (!dockRef.current?.contains(event.target as Node)) {
        closeDock();
      }
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") closeDock();
    };

    window.addEventListener("pointerdown", handlePointerDown);
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("pointerdown", handlePointerDown);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [open, closeDock]);

  useEffect(() => {
    const onScroll = () => {
      setIsScrolling(true);
      if (!open) setIsIdle(false);
      if (scrollTimerRef.current) clearTimeout(scrollTimerRef.current);
      scrollTimerRef.current = setTimeout(() => {
        setIsScrolling(false);
        resetIdleTimer();
      }, 680);
    };

    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      if (scrollTimerRef.current) clearTimeout(scrollTimerRef.current);
    };
  }, [open, resetIdleTimer]);

  useEffect(() => {
    if (!open) return;
    const timer = setTimeout(closeDock, 9000);
    return () => clearTimeout(timer);
  }, [open, closeDock]);

  const dockOpacity = open ? 1 : isScrolling ? 0.72 : isIdle ? 0.58 : 0.92;

  return (
    <div
      ref={dockRef}
      className={cn("quick-action-dock pointer-events-none", placement)}
      onMouseEnter={() => {
        setIsIdle(false);
        if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
      }}
      onMouseLeave={resetIdleTimer}
      onFocusCapture={resetIdleTimer}
    >
      <motion.div
        className="pointer-events-auto flex flex-col items-end gap-2"
        animate={{ opacity: dockOpacity }}
        transition={{ duration: reduceMotion ? 0 : 0.35, ease: "easeOut" }}
      >
        <AnimatePresence initial={false}>
          {open ? (
            <motion.div
              key="quick-action-menu"
              initial={{ opacity: 0, y: 10, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 8, scale: 0.97 }}
              transition={{ duration: reduceMotion ? 0.12 : 0.28, ease: [0.22, 1, 0.36, 1] }}
              className="quick-action-dock__menu"
              role="menu"
              aria-label={t("quickActionsMenu")}
            >
              {DOCK_ACTIONS.map((action, index) => {
                const label = t(action.labelKey);
                const itemClass = cn(
                  "quick-action-dock__item",
                  action.primary && "quick-action-dock__item--primary",
                );

                const content = (
                  <>
                    <span className="quick-action-dock__icon" aria-hidden>
                      <ActionIcon icon={action.icon} />
                    </span>
                    <span className="quick-action-dock__label">{label}</span>
                  </>
                );

                const motionProps = {
                  initial: reduceMotion ? false : { opacity: 0, x: 10 },
                  animate: { opacity: 1, x: 0 },
                  exit: reduceMotion ? undefined : { opacity: 0, x: 8 },
                  transition: {
                    duration: 0.22,
                    delay: reduceMotion ? 0 : index * 0.045,
                    ease: [0.22, 1, 0.36, 1] as const,
                  },
                };

                if (action.external) {
                  return (
                    <motion.a
                      key={action.id}
                      {...motionProps}
                      href={action.href}
                      target="_blank"
                      rel="noreferrer"
                      role="menuitem"
                      className={itemClass}
                      onClick={closeDock}
                    >
                      {content}
                    </motion.a>
                  );
                }

                return (
                  <motion.div key={action.id} {...motionProps}>
                    <Link
                      href={action.href}
                      role="menuitem"
                      className={itemClass}
                      onClick={closeDock}
                    >
                      {content}
                    </Link>
                  </motion.div>
                );
              })}
            </motion.div>
          ) : null}
        </AnimatePresence>

        <motion.button
          type="button"
          aria-expanded={open}
          aria-haspopup="menu"
          aria-label={open ? t("quickActionsClose") : t("quickActionsToggle")}
          onClick={() => {
            resetIdleTimer();
            setOpen((value) => !value);
          }}
          className={cn(
            "quick-action-dock__toggle",
            open && "quick-action-dock__toggle--open",
          )}
          whileTap={reduceMotion ? undefined : { scale: 0.96 }}
        >
          {open ? (
            <X className="h-[1.15rem] w-[1.15rem]" strokeWidth={2.25} />
          ) : (
            <Zap className="h-[1.15rem] w-[1.15rem]" strokeWidth={2.25} />
          )}
        </motion.button>
      </motion.div>
    </div>
  );
}

export function QuickActionDock() {
  const pathname = usePathname();

  if (pathname.startsWith(QUOTE_ROUTE_PREFIX)) {
    return null;
  }

  return <QuickActionDockPanel key={pathname} pathname={pathname} />;
}
