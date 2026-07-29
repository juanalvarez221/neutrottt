"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { motion } from "framer-motion";
import { getFirstName } from "@/shared/lib/quoteProfile";
import type { SiteCopyKey } from "@/shared/i18n/siteLanguage";
import { useSiteLanguage } from "@/shared/i18n/LanguageProvider";
import { BRAND } from "@/shared/config/brand";
import { HeroBrandTitle } from "@/widgets/home/HeroBrandTitle";
import { QuoteAmbientBackground } from "@/widgets/quote/QuoteAmbientBackground";

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

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      setFirstName(getFirstName());
    });
    return () => window.cancelAnimationFrame(frame);
  }, []);

  return (
    <div className="relative isolate min-h-dvh overflow-hidden bg-background text-ivory">
      <QuoteAmbientBackground />

      <header className="sticky top-0 z-50 border-b border-[rgba(var(--rgb-sand),0.12)] bg-[rgba(10,8,6,0.55)] backdrop-blur-md">
        <div className="flex w-full items-center justify-between px-4 py-4 sm:px-6 md:px-10">
          <button
            type="button"
            onClick={() => router.back()}
            className="-m-2.5 inline-flex h-11 w-11 items-center justify-center opacity-80 transition hover:opacity-100 active:scale-[0.98]"
            aria-label="Volver"
          >
            <ArrowLeft className="h-6 w-6 text-[rgba(var(--rgb-sand),0.85)]" strokeWidth={1.5} />
          </button>
          <HeroBrandTitle name={brand} variant="header" />
          <span className="w-6" aria-hidden />
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
            className="mb-6 max-w-[36ch] border-l border-[rgba(var(--rgb-honey),0.35)] pl-4 font-mono text-[0.78rem] leading-relaxed tracking-wide text-[rgba(var(--rgb-sand),0.72)] sm:mb-8 sm:text-[0.82rem]"
          >
            {t(greetingKey, { name: firstName })}
          </motion.p>
        ) : null}
        {children}
      </motion.main>
    </div>
  );
}
