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
          className="zone-step-popup"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
          role="dialog"
          aria-modal="true"
          aria-labelledby="zone-step-popup-title"
        >
          <motion.div
            initial={{ opacity: 0, y: 18 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 12 }}
            transition={{ type: "spring", stiffness: 380, damping: 34 }}
            className="zone-step-popup__panel"
            onClick={(event) => event.stopPropagation()}
          >
            <header className="zone-step-popup__header">
              {canBack && onBack ? (
                <button
                  type="button"
                  onClick={onBack}
                  className="zone-step-popup__icon-btn focus-ring"
                  aria-label={t("quotePopupBack")}
                >
                  <ArrowLeft className="h-4 w-4" strokeWidth={2} />
                </button>
              ) : (
                <span className="zone-step-popup__icon-spacer" aria-hidden />
              )}

              <div className="zone-step-popup__progress" aria-hidden>
                {Array.from({ length: total }, (_, index) => (
                  <span
                    key={index}
                    className={[
                      "zone-step-popup__dot",
                      index + 1 === step
                        ? "zone-step-popup__dot--active"
                        : index + 1 < step
                          ? "zone-step-popup__dot--done"
                          : "",
                    ].join(" ")}
                  />
                ))}
              </div>

              <button
                type="button"
                onClick={onClose}
                className="zone-step-popup__icon-btn focus-ring"
                aria-label={t("quotePopupClose")}
              >
                <X className="h-4 w-4" strokeWidth={2} />
              </button>
            </header>

            <div className="zone-step-popup__title-block">
              <h3 id="zone-step-popup-title" className="zone-step-popup__title">
                {title}
              </h3>
              {subtitle ? <p className="zone-step-popup__subtitle">{subtitle}</p> : null}
            </div>

            <div className="zone-step-popup__stage">
              {visual ? (
                <div
                  className={[
                    "zone-step-popup__visual-slot",
                    visualCompact ? "zone-step-popup__visual-slot--compact" : "",
                  ].join(" ")}
                >
                  {visual}
                </div>
              ) : (
                <div className="zone-step-popup__visual-empty" aria-hidden />
              )}
            </div>

            <div className="zone-step-popup__choices">
              <AnimatePresence mode="wait">
                <motion.div
                  key={stepKey}
                  className="zone-step-popup__choices-inner"
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -6 }}
                  transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
                >
                  {children}
                </motion.div>
              </AnimatePresence>
            </div>

            {onConfirm && confirmLabel ? (
              <footer className="zone-step-popup__footer">
                {!canConfirm ? (
                  <p className="zone-step-popup__hint">{t("quoteRefinementIncomplete")}</p>
                ) : null}
                <button
                  type="button"
                  onClick={onConfirm}
                  disabled={!canConfirm}
                  aria-disabled={!canConfirm}
                  className={[
                    "zone-step-popup__cta focus-ring btn-accent typo-cta group",
                    !canConfirm ? "zone-step-popup__cta--disabled" : "",
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
        "zone-step-popup__chip focus-ring",
        wide ? "zone-step-popup__chip--wide" : "",
        active ? "zone-step-popup__chip--active" : "",
      ].join(" ")}
    >
      {label}
    </button>
  );
}
