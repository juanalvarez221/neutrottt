"use client";

import { useCallback, useEffect, useRef } from "react";
import Image from "next/image";
import { motion, AnimatePresence } from "framer-motion";
import { ExternalLink, MapPin, X } from "lucide-react";
import { STUDIO, getStudioFullAddress } from "@/shared/config/studio";
import { useSiteLanguage } from "@/shared/i18n/LanguageProvider";

type StudioInfoSheetProps = {
  open: boolean;
  onClose: () => void;
};

export function StudioInfoSheet({ open, onClose }: StudioInfoSheetProps) {
  const { t } = useSiteLanguage();
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  const handleDialogClose = useCallback(() => {
    onClose();
  }, [onClose]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  return (
    <AnimatePresence>
      {open ? (
        <dialog
          ref={dialogRef}
          onClose={handleDialogClose}
          className="studio-info-dialog fixed inset-0 z-[100] m-0 flex h-dvh max-h-dvh w-full max-w-none items-end justify-center border-0 bg-transparent p-0 sm:items-center sm:p-4 backdrop:bg-black/70 backdrop:backdrop-blur-sm"
          aria-labelledby="studio-info-title"
        >
          <motion.button
            type="button"
            aria-label={t("studioClose")}
            className="absolute inset-0 z-0 cursor-default"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
          />

          <motion.div
            role="document"
            initial={{ opacity: 0, y: 28, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20, scale: 0.98 }}
            transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
            className="studio-info-panel relative z-10 mx-auto mt-auto flex max-h-[min(92dvh,640px)] w-full max-w-md flex-col overflow-hidden rounded-t-3xl border border-emerald-500/25 bg-[linear-gradient(165deg,rgba(6,24,16,0.98),rgba(8,6,4,0.99))] shadow-[0_-24px_80px_rgba(0,0,0,0.55)] sm:my-auto sm:rounded-3xl"
          >
            <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(420px_220px_at_50%_0%,rgba(16,185,129,0.18),transparent_62%)]" />

            <div className="relative flex items-center justify-between border-b border-white/[0.06] px-5 py-3.5">
              <p className="typo-eyebrow tracking-[0.22em] text-emerald-200/85">
                {t("studioInfoEyebrow")}
              </p>
              <button
                type="button"
                onClick={onClose}
                className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-white/10 bg-white/5 text-zinc-200 transition hover:bg-white/10"
                aria-label={t("studioClose")}
              >
                <X className="h-3.5 w-3.5" strokeWidth={2} />
              </button>
            </div>

            <div className="relative flex flex-1 flex-col items-center px-5 pb-5 pt-4 text-center sm:px-7 sm:pb-6">
              <div className="relative h-28 w-28 overflow-hidden rounded-2xl border border-emerald-500/35 shadow-[0_16px_48px_rgba(0,0,0,0.45)] sm:h-32 sm:w-32">
                <Image
                  src={STUDIO.logoSrc}
                  alt={STUDIO.displayName}
                  fill
                  priority
                  sizes="128px"
                  className="object-cover object-center"
                />
              </div>

              <h2
                id="studio-info-title"
                className="typo-section-sm mt-4 flex items-center justify-center gap-1.5 text-[1.05rem] sm:text-[1.2rem]"
              >
                <span>{STUDIO.displayName}</span>
                <Image
                  src={STUDIO.verifiedBadgeSrc}
                  alt={t("famousVerifiedAlt")}
                  width={18}
                  height={18}
                  className="studio-verified-badge h-[1.05rem] w-[1.05rem] object-contain sm:h-[1.15rem] sm:w-[1.15rem]"
                />
              </h2>

              <p className="typo-lead mt-2 text-[0.75rem] tracking-[0.16em] text-emerald-100/90">
                {STUDIO.locationShort}
              </p>

              <p className="typo-body mt-2 text-[0.88rem] text-zinc-300">{t("studioTagline")}</p>

              <p className="typo-micro mt-2 tracking-[0.1em] text-zinc-400">{t("studioLanguages")}</p>

              <p className="typo-body typo-body-soft mt-3 max-w-xs text-[0.9rem]">
                {t("studioInfoIntro")}
              </p>

              <p className="typo-micro mt-2 text-emerald-200/75">{t("studioNeutrotttNote")}</p>

              <div className="relative mt-4 h-24 w-full max-w-[240px] overflow-hidden rounded-xl border border-white/10 opacity-90">
                <Image
                  src={STUDIO.photoSrc}
                  alt={t("aboutImgStudioAlt")}
                  fill
                  sizes="240px"
                  className="object-cover object-center"
                />
              </div>

              <address className="mt-3 not-italic">
                <p className="text-[0.78rem] text-zinc-400">{STUDIO.addressLine1}</p>
              </address>

              <a
                href={STUDIO.mapsUrl}
                target="_blank"
                rel="noreferrer"
                className="studio-card-cta mt-4 inline-flex items-center justify-center gap-1 rounded-md px-2.5 py-1.5 text-[0.6rem] font-bold uppercase tracking-[0.1em] sm:text-[0.62rem]"
              >
                <MapPin className="h-3 w-3 shrink-0" strokeWidth={2} />
                {t("studioMapsCta")}
                <ExternalLink className="h-2.5 w-2.5 shrink-0 opacity-80" strokeWidth={2} />
              </a>

              <p className="typo-micro typo-eyebrow-muted mt-3">{getStudioFullAddress()}</p>
            </div>
          </motion.div>
        </dialog>
      ) : null}
    </AnimatePresence>
  );
}
