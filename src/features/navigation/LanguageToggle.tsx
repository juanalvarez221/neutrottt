"use client";

import { Globe2 } from "lucide-react";
import { useSiteLanguage } from "@/shared/i18n/LanguageProvider";
import type { SiteLanguage } from "@/shared/i18n/siteLanguage";
import { cn } from "@/shared/lib/cn";

export function LanguageToggle({ className }: { className?: string }) {
  const { language, setLanguage } = useSiteLanguage();

  const toggle = (lang: SiteLanguage) => {
    if (lang !== language) setLanguage(lang);
  };

  return (
    <div
      className={cn(
        "inline-flex items-center gap-0.5 rounded-full border border-white/10 bg-black/40 p-0.5",
        className,
      )}
      role="group"
      aria-label="Idioma"
    >
      <Globe2 className="ml-1.5 h-3.5 w-3.5 text-zinc-400" aria-hidden />
      {(["es", "en"] as const).map((lang) => (
        <button
          key={lang}
          type="button"
          onClick={() => toggle(lang)}
          aria-pressed={language === lang}
          className={cn(
            "min-h-[28px] min-w-[2rem] rounded-full px-2 text-[0.6875rem] font-semibold uppercase tracking-wide transition active:scale-[0.98]",
            language === lang
              ? "bg-stone-600/25 text-stone-100"
              : "text-zinc-400 hover:text-zinc-200",
          )}
        >
          {lang}
        </button>
      ))}
    </div>
  );
}
