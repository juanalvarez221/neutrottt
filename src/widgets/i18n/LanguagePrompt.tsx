"use client";

import { motion } from "framer-motion";
import { Globe2, Sparkles } from "lucide-react";
import { useSiteLanguage } from "@/shared/i18n/LanguageProvider";

export function LanguagePrompt() {
  const { isReady, needsSelection, setLanguage, t } = useSiteLanguage();

  if (!isReady || !needsSelection) return null;

  return (
    <div className="fixed inset-0 z-[110] flex items-end justify-center overflow-y-auto bg-black/72 p-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-[max(1rem,env(safe-area-inset-top))] backdrop-blur-md sm:items-center">
      <motion.div
        initial={{ opacity: 0, y: 18, scale: 0.97 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.4, ease: "easeOut" }}
        className="relative my-auto w-full max-w-lg max-h-[min(92dvh,720px)] overflow-y-auto overscroll-contain rounded-3xl border border-white/15 bg-zinc-950/95 p-5 shadow-[0_28px_70px_-28px_rgba(0,0,0,0.95)] sm:p-6"
      >
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(500px_220px_at_12%_0%,rgba(251,191,36,0.3),transparent_62%),radial-gradient(420px_220px_at_100%_100%,rgba(249,115,22,0.22),transparent_65%)]" />

        <div className="relative z-10">
          <div className="inline-flex items-center gap-2 rounded-full border border-amber-400/30 bg-amber-500/10 px-3 py-1.5">
            <Globe2 className="h-4 w-4 text-amber-200" />
            <p className="typo-tech uppercase tracking-[0.16em] text-amber-200/90">
              Language
            </p>
          </div>

          <h2 className="typo-section mt-4 text-[clamp(1.55rem,7vw,1.95rem)] leading-[1.08] sm:text-[1.95rem] sm:leading-[1.06]">
            {t("languageTitle")}
          </h2>
          <p className="typo-body mt-3 max-w-md text-zinc-300">{t("languageSubtitle")}</p>

          <div className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-2">
            <motion.button
              type="button"
              onClick={() => setLanguage("es")}
              whileHover={{ y: -2 }}
              whileTap={{ scale: 0.99 }}
              className="group rounded-2xl border border-amber-400/35 bg-amber-600/15 p-4 text-left transition hover:border-amber-300/55 hover:bg-amber-600/22"
            >
              <p className="text-sm font-semibold text-amber-50">{t("languageEs")}</p>
              <p className="mt-1 text-xs text-amber-100/75">
                Experiencia completa en espanol.
              </p>
            </motion.button>

            <motion.button
              type="button"
              onClick={() => setLanguage("en")}
              whileHover={{ y: -2 }}
              whileTap={{ scale: 0.99 }}
              className="group rounded-2xl border border-white/15 bg-white/5 p-4 text-left transition hover:border-white/25 hover:bg-white/10"
            >
              <p className="text-sm font-semibold text-zinc-100">{t("languageEn")}</p>
              <p className="mt-1 text-xs text-zinc-300/80">
                Full experience in English.
              </p>
            </motion.button>
          </div>

          <div className="mt-4 inline-flex items-center gap-2 text-xs text-zinc-400">
            <Sparkles className="h-3.5 w-3.5 text-amber-300/90" />
            {t("languageFooterHint")}
          </div>
        </div>
      </motion.div>
    </div>
  );
}
