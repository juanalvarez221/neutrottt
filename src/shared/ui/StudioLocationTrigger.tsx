"use client";

import { useState } from "react";
import Image from "next/image";
import { ChevronRight, MapPin } from "lucide-react";
import { STUDIO } from "@/shared/config/studio";
import { useSiteLanguage } from "@/shared/i18n/LanguageProvider";
import { StudioInfoSheet } from "@/shared/ui/StudioInfoSheet";
import { cn } from "@/shared/lib/cn";

type StudioLocationTriggerProps = {
  variant?: "card" | "compact" | "inline";
  className?: string;
};

export function StudioLocationTrigger({
  variant = "card",
  className,
}: StudioLocationTriggerProps) {
  const { t } = useSiteLanguage();
  const [open, setOpen] = useState(false);

  const openSheet = () => setOpen(true);

  if (variant === "compact") {
    return (
      <>
        <button
          type="button"
          onClick={openSheet}
          className={cn(
            "group inline-flex items-center gap-1.5 border-b border-transparent pb-0.5 text-left transition hover:border-amber-400/35",
            className,
          )}
          aria-label={`${STUDIO.displayName}, ${STUDIO.locationShort}`}
        >
          <MapPin
            className="h-3 w-3 shrink-0 text-amber-300/60 transition group-hover:text-amber-200/80"
            strokeWidth={1.75}
          />
          <span className="text-[0.5rem] font-semibold uppercase tracking-[0.28em] text-amber-100/65 sm:text-[0.52rem]">
            {STUDIO.locationShort}
          </span>
        </button>
        <StudioInfoSheet open={open} onClose={() => setOpen(false)} />
      </>
    );
  }

  if (variant === "inline") {
    return (
      <>
        <button
          type="button"
          onClick={openSheet}
          className={cn(
            "typo-lead group inline-flex items-center gap-1.5 border-b border-transparent text-amber-100/85 transition hover:border-amber-400/35",
            className,
          )}
        >
          {STUDIO.displayName}
        </button>
        <StudioInfoSheet open={open} onClose={() => setOpen(false)} />
      </>
    );
  }

  return (
    <>
      <div
        className={cn(
          "about-location-card flex items-center gap-2.5 rounded-2xl p-3 sm:gap-3 sm:p-3.5",
          className,
        )}
      >
        <div className="relative h-11 w-11 shrink-0 overflow-hidden rounded-xl border border-emerald-500/30 shadow-[0_6px_16px_rgba(0,0,0,0.35)] sm:h-12 sm:w-12">
          <Image
            src={STUDIO.logoSrc}
            alt={STUDIO.displayName}
            fill
            sizes="48px"
            className="object-cover object-center"
          />
        </div>

        <div className="min-w-0 flex-1">
          <p className="typo-eyebrow tracking-[0.18em]">{t("aboutLocationNote")}</p>
          <p className="mt-0.5 flex items-center gap-1 text-[0.76rem] font-semibold leading-tight tracking-[0.02em] text-zinc-50 sm:text-[0.82rem]">
            <span className="truncate">{STUDIO.displayName}</span>
            <Image
              src={STUDIO.verifiedBadgeSrc}
              alt={t("famousVerifiedAlt")}
              width={14}
              height={14}
              className="studio-verified-badge h-3.5 w-3.5 shrink-0 object-contain sm:h-[0.9rem] sm:w-[0.9rem]"
            />
          </p>
          <p className="typo-micro typo-eyebrow-muted mt-0.5 tracking-[0.1em]">
            {STUDIO.locationShort}
          </p>
        </div>

        <button
          type="button"
          onClick={openSheet}
          className="studio-card-cta inline-flex shrink-0 items-center gap-0.5 rounded-md px-2 py-1 text-[0.56rem] font-bold uppercase tracking-[0.12em] sm:gap-1 sm:px-2.5 sm:py-1.5 sm:text-[0.6rem]"
        >
          <span>{t("studioCardCta")}</span>
          <ChevronRight className="h-2.5 w-2.5 opacity-85 sm:h-3 sm:w-3" strokeWidth={2.5} />
        </button>
      </div>
      <StudioInfoSheet open={open} onClose={() => setOpen(false)} />
    </>
  );
}
