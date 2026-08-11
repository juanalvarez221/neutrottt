"use client";

import { useEffect, useId, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import {
  ArrowLeft,
  Copy,
  Home,
  Languages,
  MessageCircle,
  MoreVertical,
  RotateCcw,
  Save,
  UserRound,
} from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";
import { getFirstName, getQuoteProfile } from "@/shared/lib/quoteProfile";
import type { SiteCopyKey } from "@/shared/i18n/siteLanguage";
import { useSiteLanguage } from "@/shared/i18n/LanguageProvider";
import { BRAND, WHATSAPP_MESSAGES, whatsappUrl } from "@/shared/config/brand";
import { QUOTE_BACKGROUND_VIDEO } from "@/shared/config/quote";
import {
  QUOTE_FLOW_PATHS,
  captureQuoteProgress,
  resolveQuoteBackPath,
  startNewQuoteSession,
} from "@/shared/lib/quoteFlow";
import { HeroBrandTitle } from "@/widgets/home/HeroBrandTitle";
import { cn } from "@/shared/lib/cn";

async function copyText(value: string) {
  if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(value);
    return;
  }
  const input = document.createElement("textarea");
  input.value = value;
  input.setAttribute("readonly", "");
  input.style.position = "fixed";
  input.style.opacity = "0";
  document.body.appendChild(input);
  input.select();
  const ok = document.execCommand("copy");
  document.body.removeChild(input);
  if (!ok) throw new Error("copy-failed");
}

export function QuoteShell({
  children,
  brand = BRAND.name,
  showGreeting = true,
  greetingKey = "quoteGreetStart",
}: {
  children: React.ReactNode;
  brand?: string;
  showGreeting?: boolean;
  greetingKey?: SiteCopyKey;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const { language, setLanguage, t } = useSiteLanguage();
  const [firstName, setFirstName] = useState<string | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const menuButtonRef = useRef<HTMLButtonElement>(null);
  const menuId = useId();

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      setFirstName(getFirstName());
    });
    return () => window.cancelAnimationFrame(frame);
  }, []);

  useEffect(() => {
    captureQuoteProgress(pathname, window.location.search);
  }, [pathname]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reducedMotion) {
      video.pause();
      return;
    }

    video.play().catch(() => {
      /* autoplay blocked, gradient fallback remains visible */
    });
  }, []);

  useEffect(() => {
    if (!menuOpen) return;

    const onPointerDown = (event: MouseEvent | TouchEvent) => {
      const target = event.target as Node | null;
      if (!target) return;
      if (menuRef.current?.contains(target)) return;
      if (menuButtonRef.current?.contains(target)) return;
      setMenuOpen(false);
    };

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMenuOpen(false);
    };

    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("touchstart", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("touchstart", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [menuOpen]);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(null), 2400);
    return () => window.clearTimeout(timer);
  }, [toast]);

  const closeMenu = () => setMenuOpen(false);

  const showToast = (message: string) => {
    setToast(message);
  };

  const persistCurrentStep = () => {
    captureQuoteProgress(pathname, window.location.search);
  };

  const goBack = () => {
    persistCurrentStep();
    const params = new URLSearchParams(window.location.search);
    router.push(resolveQuoteBackPath(pathname, params));
  };

  const saveAndExit = () => {
    persistCurrentStep();
    closeMenu();
    showToast(t("quoteMenuSaveExitDone"));
    window.setTimeout(() => {
      router.push("/");
    }, 450);
  };

  const restartQuote = () => {
    const confirmed = window.confirm(t("quoteMenuRestartConfirm"));
    if (!confirmed) return;
    closeMenu();
    startNewQuoteSession();
    router.push(QUOTE_FLOW_PATHS.quoteStart);
  };

  const editProfile = () => {
    persistCurrentStep();
    closeMenu();
    router.push(QUOTE_FLOW_PATHS.profileEdit);
  };

  const goHome = () => {
    persistCurrentStep();
    closeMenu();
    router.push("/");
  };

  const copyStepLink = async () => {
    persistCurrentStep();
    try {
      await copyText(window.location.href);
      closeMenu();
      showToast(t("quoteMenuCopyLinkDone"));
    } catch {
      showToast(t("quoteMenuCopyLinkFail"));
    }
  };

  const openWhatsApp = () => {
    persistCurrentStep();
    closeMenu();
    const profile = getQuoteProfile();
    const message = profile?.name
      ? WHATSAPP_MESSAGES.quoteInProgressNamed.replace("{name}", profile.name.trim())
      : WHATSAPP_MESSAGES.quoteInProgress;
    window.open(whatsappUrl(message), "_blank", "noopener,noreferrer");
  };

  const toggleLanguage = () => {
    const next = language === "es" ? "en" : "es";
    setLanguage(next);
    closeMenu();
    showToast(
      t("quoteMenuLanguageDone", {
        language: next === "es" ? "Español" : "English",
      }),
    );
  };

  const menuItems = [
    {
      id: "save",
      label: t("quoteMenuSaveExit"),
      icon: Save,
      onClick: saveAndExit,
    },
    {
      id: "restart",
      label: t("quoteMenuRestart"),
      icon: RotateCcw,
      onClick: restartQuote,
    },
    {
      id: "profile",
      label: t("quoteMenuEditProfile"),
      icon: UserRound,
      onClick: editProfile,
    },
    {
      id: "copy",
      label: t("quoteMenuCopyLink"),
      icon: Copy,
      onClick: () => {
        void copyStepLink();
      },
    },
    {
      id: "whatsapp",
      label: t("quoteMenuWhatsapp"),
      icon: MessageCircle,
      onClick: openWhatsApp,
    },
    {
      id: "language",
      label: t("quoteMenuLanguage", {
        language: language === "es" ? "EN" : "ES",
      }),
      icon: Languages,
      onClick: toggleLanguage,
    },
    {
      id: "home",
      label: t("quoteMenuHome"),
      icon: Home,
      onClick: goHome,
    },
  ] as const;

  return (
    <div className="quote-shell relative isolate min-h-dvh overflow-hidden bg-background text-ivory">
      <div className="pointer-events-none absolute inset-0 -z-10" aria-hidden>
        <video
          ref={videoRef}
          src={QUOTE_BACKGROUND_VIDEO}
          className="quote-shell-video h-full w-full object-cover"
          autoPlay
          muted
          loop
          playsInline
          preload="metadata"
          disablePictureInPicture
        />
        <div className="absolute inset-0 quote-shell-overlay" />
      </div>

      <header className="sticky top-0 z-50 border-b border-white/10 bg-black/35 backdrop-blur-md">
        <div className="relative flex w-full items-center justify-between px-4 py-4 sm:px-6 md:px-10">
          <button
            type="button"
            onClick={goBack}
            className="opacity-80 transition hover:opacity-100 active:scale-[0.98]"
            aria-label={t("quoteBackAria")}
          >
            <ArrowLeft className="h-6 w-6 text-zinc-200" />
          </button>
          <HeroBrandTitle name={brand} variant="header" />
          <div className="relative">
            <button
              ref={menuButtonRef}
              type="button"
              onClick={() => setMenuOpen((open) => !open)}
              className="opacity-80 transition hover:opacity-100 active:scale-[0.98]"
              aria-label={t("quoteMenuAria")}
              aria-haspopup="menu"
              aria-expanded={menuOpen}
              aria-controls={menuId}
            >
              <MoreVertical className="h-6 w-6 text-zinc-200" />
            </button>

            <AnimatePresence>
              {menuOpen ? (
                <motion.div
                  ref={menuRef}
                  id={menuId}
                  role="menu"
                  aria-label={t("quoteMenuAria")}
                  initial={{ opacity: 0, y: -6, scale: 0.98 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: -4, scale: 0.98 }}
                  transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
                  className="absolute right-0 top-[calc(100%+0.65rem)] z-50 w-[min(18.5rem,calc(100vw-2rem))] overflow-hidden rounded-2xl border border-white/12 bg-[rgba(12,10,8,0.96)] p-1.5 shadow-[0_18px_50px_-28px_rgba(0,0,0,0.9)] backdrop-blur-xl"
                >
                  {menuItems.map((item) => {
                    const Icon = item.icon;
                    return (
                      <button
                        key={item.id}
                        type="button"
                        role="menuitem"
                        onClick={item.onClick}
                        className={cn(
                          "flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm font-medium text-zinc-100 transition",
                          "hover:bg-white/8 active:scale-[0.99]",
                        )}
                      >
                        <span className="flex h-8 w-8 items-center justify-center rounded-lg border border-white/10 bg-white/5">
                          <Icon className="h-4 w-4 text-stone-300" strokeWidth={1.75} />
                        </span>
                        <span className="min-w-0 flex-1 leading-snug">{item.label}</span>
                      </button>
                    );
                  })}
                </motion.div>
              ) : null}
            </AnimatePresence>
          </div>
        </div>
      </header>

      <AnimatePresence>
        {toast ? (
          <motion.div
            role="status"
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            className="pointer-events-none fixed inset-x-0 top-[4.75rem] z-[60] flex justify-center px-4"
          >
            <p className="rounded-full border border-white/12 bg-black/75 px-4 py-2 text-sm font-medium text-zinc-100 shadow-[0_12px_40px_-20px_rgba(0,0,0,0.9)] backdrop-blur-md">
              {toast}
            </p>
          </motion.div>
        ) : null}
      </AnimatePresence>

      <motion.main
        initial={{ opacity: 0, y: 14 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.45, ease: "easeOut" }}
        className="relative z-10 w-full pl-[max(1rem,env(safe-area-inset-left))] pr-[max(1rem,env(safe-area-inset-right))] pb-[max(1.75rem,calc(1rem+env(safe-area-inset-bottom)))] pt-6 sm:pl-6 sm:pr-6 sm:pt-8 md:pl-10 md:pr-10"
      >
        {showGreeting && firstName ? (
          <motion.p
            key={greetingKey}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
            className="typo-body mb-6 max-w-2xl text-sm leading-relaxed text-stone-300/92 sm:mb-8 md:text-[0.95rem]"
          >
            {t(greetingKey, { name: firstName })}
          </motion.p>
        ) : null}
        {children}
      </motion.main>
    </div>
  );
}
