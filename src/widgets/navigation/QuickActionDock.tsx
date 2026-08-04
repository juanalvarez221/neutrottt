"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { PenLine } from "lucide-react";
import { useSiteLanguage } from "@/shared/i18n/LanguageProvider";
import { cn } from "@/shared/lib/cn";

/** Rutas con nav inferior móvil: el dock sube para no taparla. */
const APP_SHELL_ROUTES = ["/contacto", "/proyectos"] as const;
const QUOTE_ROUTE_PREFIX = "/cotizacion";

/** Ciclo del CTA: ícono → expandir etiqueta → colapsar. */
const EXPAND_INTERVAL_MS = 7800;
const EXPAND_VISIBLE_MS = 3200;
const EXPAND_INITIAL_DELAY_MS = 2600;

function resolveDockPlacement(pathname: string) {
  const hasMobileNav = APP_SHELL_ROUTES.some(
    (route) => pathname === route || pathname.startsWith(`${route}/`),
  );
  return hasMobileNav ? "quick-action-dock--nav" : "quick-action-dock--default";
}

function QuickActionDockPanel({ pathname }: { pathname: string }) {
  const { t } = useSiteLanguage();
  const reduceMotion = useReducedMotion();
  const idleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const expandCycleRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const expandHideRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pausedRef = useRef(false);

  const [isScrolling, setIsScrolling] = useState(false);
  const [isIdle, setIsIdle] = useState(false);
  const [expanded, setExpanded] = useState(false);

  const placement = resolveDockPlacement(pathname);

  const clearCycleTimer = useCallback(() => {
    if (expandCycleRef.current) clearTimeout(expandCycleRef.current);
    expandCycleRef.current = null;
  }, []);

  const clearHideTimer = useCallback(() => {
    if (expandHideRef.current) clearTimeout(expandHideRef.current);
    expandHideRef.current = null;
  }, []);

  const clearExpandTimers = useCallback(() => {
    clearCycleTimer();
    clearHideTimer();
  }, [clearCycleTimer, clearHideTimer]);

  const showExpanded = useCallback(() => {
    if (pausedRef.current || reduceMotion) return;
    clearHideTimer();
    setExpanded(true);
    expandHideRef.current = setTimeout(() => setExpanded(false), EXPAND_VISIBLE_MS);
  }, [clearHideTimer, reduceMotion]);

  const scheduleExpand = useCallback(
    (delayMs: number) => {
      if (reduceMotion) return;
      clearCycleTimer();
      expandCycleRef.current = setTimeout(() => {
        if (!pausedRef.current) showExpanded();
        scheduleExpand(EXPAND_INTERVAL_MS);
      }, delayMs);
    },
    [clearCycleTimer, reduceMotion, showExpanded],
  );

  const resetIdleTimer = useCallback(() => {
    setIsIdle(false);
    if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
    idleTimerRef.current = setTimeout(() => setIsIdle(true), 4200);
  }, []);

  const pauseAndExpand = useCallback(() => {
    pausedRef.current = true;
    setIsIdle(false);
    setExpanded(true);
    clearHideTimer();
  }, [clearHideTimer]);

  const resumeIdle = useCallback(() => {
    pausedRef.current = false;
    setExpanded(false);
    resetIdleTimer();
  }, [resetIdleTimer]);

  useEffect(() => {
    const timer = setTimeout(() => setIsIdle(true), 4200);
    scheduleExpand(EXPAND_INITIAL_DELAY_MS);
    return () => {
      clearTimeout(timer);
      if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
      clearExpandTimers();
    };
  }, [clearExpandTimers, scheduleExpand]);

  useEffect(() => {
    let scrollClear: ReturnType<typeof setTimeout> | null = null;
    const handleScroll = () => {
      setIsScrolling(true);
      setIsIdle(false);
      setExpanded(false);
      if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
      if (scrollClear) clearTimeout(scrollClear);
      scrollClear = setTimeout(() => {
        setIsScrolling(false);
        resetIdleTimer();
      }, 680);
    };
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", handleScroll);
      if (scrollClear) clearTimeout(scrollClear);
    };
  }, [resetIdleTimer]);

  const dockOpacity = isScrolling ? 0.72 : isIdle ? 0.78 : 0.96;

  return (
    <div
      className={cn("quick-action-dock pointer-events-none", placement)}
      onMouseEnter={() => {
        pauseAndExpand();
        if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
      }}
      onMouseLeave={resumeIdle}
      onFocusCapture={() => {
        pauseAndExpand();
        resetIdleTimer();
      }}
      onBlurCapture={resumeIdle}
    >
      <motion.div
        className="pointer-events-auto relative flex flex-col items-end"
        animate={{ opacity: dockOpacity }}
        transition={{ duration: reduceMotion ? 0 : 0.35, ease: "easeOut" }}
      >
        <motion.div layout whileTap={reduceMotion ? undefined : { scale: 0.97 }}>
          <Link
            href="/cotizacion"
            target="_blank"
            rel="noopener noreferrer"
            aria-label={t("quickActionsQuote")}
            className={cn(
              "quick-action-dock__cta",
              expanded && "quick-action-dock__cta--expanded",
            )}
            onClick={() => setExpanded(false)}
          >
            <span className="quick-action-dock__cta-icon" aria-hidden>
              <PenLine className="h-[1.1rem] w-[1.1rem]" strokeWidth={2.15} />
            </span>
            <AnimatePresence initial={false}>
              {expanded ? (
                <motion.span
                  key="quote-label"
                  initial={reduceMotion ? false : { opacity: 0, maxWidth: 0 }}
                  animate={{ opacity: 1, maxWidth: "12rem" }}
                  exit={reduceMotion ? undefined : { opacity: 0, maxWidth: 0 }}
                  transition={{ type: "spring", stiffness: 320, damping: 28 }}
                  className="quick-action-dock__cta-label"
                >
                  {t("quickActionsQuoteShout")}
                </motion.span>
              ) : null}
            </AnimatePresence>
          </Link>
        </motion.div>
      </motion.div>
    </div>
  );
}

/** CTA flotante de cotización; se oculta dentro del flujo /cotizacion. */
export function QuickActionDock() {
  const pathname = usePathname();
  if (pathname.startsWith(QUOTE_ROUTE_PREFIX)) return null;
  return <QuickActionDockPanel key={pathname} pathname={pathname} />;
}
