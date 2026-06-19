"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { MoreVertical, ArrowLeft } from "lucide-react";
import { motion } from "framer-motion";
import { getFirstName } from "@/shared/lib/quoteProfile";
import type { SiteCopyKey } from "@/shared/i18n/siteLanguage";
import { useSiteLanguage } from "@/shared/i18n/LanguageProvider";
import { BRAND } from "@/shared/config/brand";
import { QUOTE_BACKGROUND_VIDEO } from "@/shared/config/quote";
import { HeroBrandTitle } from "@/widgets/home/HeroBrandTitle";

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
    <div className="relative isolate min-h-dvh overflow-hidden bg-background text-ivory">
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
