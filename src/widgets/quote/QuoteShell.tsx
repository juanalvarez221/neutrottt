"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { MoreVertical, ArrowLeft } from "lucide-react";
import { motion } from "framer-motion";
import { getFirstName } from "@/shared/lib/quoteProfile";
import { useSiteLanguage } from "@/shared/i18n/LanguageProvider";
import { BRAND } from "@/shared/config/brand";
import { QUOTE_BACKGROUND_VIDEO } from "@/shared/config/quote";
import { HeroBrandTitle } from "@/widgets/home/HeroBrandTitle";

export function QuoteShell({
  children,
  brand = BRAND.name,
  showGreeting = true,
}: {
  children: React.ReactNode;
  brand?: string;
  showGreeting?: boolean;
}) {
  const router = useRouter();
  const { t } = useSiteLanguage();
  const [firstName, setFirstName] = useState<string | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      setFirstName(getFirstName());
    });
    return () => window.cancelAnimationFrame(frame);
  }, []);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reducedMotion) {
      video.pause();
      return;
    }

    video.play().catch(() => {
      /* autoplay blocked — gradient fallback remains visible */
    });
  }, []);

  return (
    <div className="relative isolate min-h-dvh overflow-hidden bg-[#050403] text-zinc-50">
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
        <div className="absolute inset-0 bg-[#050403]/72" />
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_120%_80%_at_50%_0%,rgba(245,158,11,0.22),transparent_58%)]" />
        <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(5,4,3,0.35)_0%,rgba(5,4,3,0.62)_55%,rgba(5,4,3,0.88)_100%)]" />
      </div>

      <header className="sticky top-0 z-50 border-b border-white/10 bg-black/35 backdrop-blur-md">
        <div className="flex w-full items-center justify-between px-4 py-4 sm:px-6 md:px-10">
          <button
            type="button"
            onClick={() => router.back()}
            className="opacity-80 transition hover:opacity-100 active:scale-[0.98]"
            aria-label="Volver"
          >
            <ArrowLeft className="h-6 w-6 text-zinc-200" />
          </button>
          <HeroBrandTitle name={brand} variant="header" />
          <button
            type="button"
            className="opacity-80 transition hover:opacity-100 active:scale-[0.98]"
            aria-label="Más"
          >
            <MoreVertical className="h-6 w-6 text-zinc-200" />
          </button>
        </div>
      </header>

      <motion.main
        initial={{ opacity: 0, y: 14 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.45, ease: "easeOut" }}
        className="relative z-10 w-full px-4 pb-28 pt-8 sm:px-6 md:px-10"
      >
        {showGreeting && firstName ? (
          <p className="typo-body mb-6 max-w-2xl leading-relaxed text-amber-100/95">
            {t("quoteGreeting", { name: firstName })}
          </p>
        ) : null}
        {children}
      </motion.main>
    </div>
  );
}
