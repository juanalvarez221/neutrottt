"use client";

import { useEffect, type ReactNode } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { ArrowLeft, ArrowRight, X } from "lucide-react";
import { useSiteLanguage } from "@/shared/i18n/LanguageProvider";

type ZoneStepPopupProps = {
  open: boolean;
  step: number;
  total: number;
  title: string;
  subtitle?: string;
  onClose: () => void;
  onBack?: () => void;
  canBack?: boolean;
  children: ReactNode;
  stepKey: string;
  visual?: ReactNode;
  visualCompact?: boolean;
  confirmLabel?: string;
  onConfirm?: () => void;
  canConfirm?: boolean;
};

export function ZoneStepPopup({
  open,
  step,
  total,
  title,
  subtitle,
  onClose,
  onBack,
  canBack = false,
  children,
  stepKey,
  visual,
  visualCompact = false,
  confirmLabel,
  onConfirm,
  canConfirm = false,
}: ZoneStepPopupProps) {
  const { t } = useSiteLanguage();

  useEffect(() => {
    if (!open) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = previous;
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [open, onClose]);

  return (
    <AnimatePresence>
      {open ? (
        <motion.div
          className="zone-step-popup fixed inset-0 z-[80] flex items-center justify-center p-3 sm:p-5"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          role="dialog"
          aria-modal="true"
          aria-labelledby="zone-step-popup-title"
        >
          <button
            type="button"
            className="absolute inset-0 bg-zinc-950/82 backdrop-blur-md"
            aria-label={t("quotePopupClose")}
            onClick={onClose}
          />

          <motion.div
            initial={{ opacity: 0, y: 32, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 24, scale: 0.98 }}
            transition={{ type: "spring", stiffness: 420, damping: 32 }}
            className="zone-step-popup__panel relative z-10 flex w-full max-w-[min(100%,40rem)] flex-col overflow-hidden"
            onClick={(event) => event.stopPropagation()}
          >
            <header className="zone-step-popup__header flex items-center gap-2 px-4 pb-3 pt-4 sm:px-5 sm:pt-5">
              {canBack && onBack ? (
                <button
                  type="button"
                  onClick={onBack}
                  className="focus-ring inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-white/10 text-zinc-200 transition hover:bg-white/8 active:scale-[0.96]"
                  aria-label={t("quotePopupBack")}
                >
                  <ArrowLeft className="h-4 w-4" strokeWidth={2} />
                </button>
              ) : (
                <span className="h-10 w-10 shrink-0" aria-hidden />
              )}

              <div className="flex min-w-0 flex-1 justify-center gap-1.5" aria-hidden>
                {Array.from({ length: total }, (_, index) => (
                  <span
                    key={index}
                    className={[
                      "h-1.5 rounded-full transition-all duration-300",
                      index + 1 === step
                        ? "w-6 bg-stone-300"
                        : index + 1 < step
                          ? "w-1.5 bg-stone-500"
                          : "w-1.5 bg-white/20",
                    ].join(" ")}
                  />
                ))}
              </div>

              <button
                type="button"
                onClick={onClose}
                className="focus-ring inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-white/10 text-zinc-200 transition hover:bg-white/8 active:scale-[0.96]"
                aria-label={t("quotePopupClose")}
              >
                <X className="h-4 w-4" strokeWidth={2} />
              </button>
            </header>

            <div className="px-4 sm:px-5">
              <h3
                id="zone-step-popup-title"
                className="text-center text-[1.35rem] font-bold leading-tight tracking-tight text-zinc-50 sm:text-[1.5rem]"
              >
                {title}
              </h3>
              {subtitle ? (
                <p className="mt-1.5 text-center text-sm text-zinc-400">{subtitle}</p>
              ) : null}
            </div>

            <div className="zone-step-popup__main min-h-0 flex flex-1 flex-col">
              {visual ? (
                <div
                  className={[
                    "zone-step-popup__visual-slot shrink-0 px-4 pt-1 sm:px-5",
                    visualCompact ? "zone-step-popup__visual-slot--compact" : "",
                  ].join(" ")}
                >
                  {visual}
                </div>
              ) : null}

              <div className="zone-step-popup__options-scroll min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-3 sm:px-5 sm:py-4">
                <AnimatePresence mode="wait">
                  <motion.div
                    key={stepKey}
                    initial={{ opacity: 0, x: 28 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -28 }}
                    transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
                  >
                    {children}
                  </motion.div>
                </AnimatePresence>
              </div>
            </div>

            {onConfirm && confirmLabel ? (
              <footer className="zone-step-popup__footer shrink-0 border-t border-white/10 px-4 py-3 sm:px-5 sm:py-4">
                {!canConfirm ? (
                  <p className="mb-2.5 text-center text-xs text-zinc-500">{t("quoteRefinementIncomplete")}</p>
                ) : null}
                <button
                  type="button"
                  onClick={onConfirm}
                  disabled={!canConfirm}
                  aria-disabled={!canConfirm}
                  className={[
                    "focus-ring btn-accent typo-cta group inline-flex w-full min-h-[52px] items-center justify-center gap-2 rounded-xl px-6 py-3.5 active:scale-[0.98]",
                    !canConfirm ? "cursor-not-allowed opacity-45" : "",
                  ].join(" ")}
                >
                  {confirmLabel}
                  <ArrowRight
                    className={[
                      "h-4 w-4 transition-transform",
                      canConfirm ? "group-hover:translate-x-1" : "",
                    ].join(" ")}
                    strokeWidth={2}
                  />
                </button>
              </footer>
            ) : null}
          </motion.div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}

export function PopupOptionButton({
  label,
  active,
  onClick,
  onHover,
  onHoverEnd,
  wide = false,
}: {
  label: string;
  active?: boolean;
  onClick: () => void;
  onHover?: () => void;
  onHoverEnd?: () => void;
  wide?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      onMouseEnter={onHover}
      onMouseLeave={onHoverEnd}
      onFocus={onHover}
      onBlur={onHoverEnd}
      aria-pressed={active}
      className={[
        "focus-ring min-h-[52px] rounded-2xl border px-4 py-3.5 text-left text-[0.9375rem] font-semibold leading-snug transition active:scale-[0.98]",
        "whitespace-normal break-words",
        wide ? "col-span-full" : "",
        active
          ? "border-stone-300/40 bg-stone-500/18 text-stone-50 shadow-[inset_0_1px_0_rgba(255,248,240,0.08)]"
          : "border-white/12 bg-white/[0.04] text-zinc-100 hover:border-stone-400/30 hover:bg-stone-600/10",
      ].join(" ")}
    >
      {label}
    </button>
  );
}
