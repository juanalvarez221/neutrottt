"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight } from "lucide-react";
import { QuoteShell } from "@/widgets/quote/QuoteShell";
import { useSiteLanguage } from "@/shared/i18n/LanguageProvider";
import { getQuoteDraft, isLargeQuoteSize } from "@/shared/lib/quoteDraft";

const STYLE_OPTIONS = [
  "Realismo oscuro",
  "Surrealismo",
  "Lineas",
  "Neutrottt Style",
] as const;

export function QuoteStyleStep({ size, zone }: { size: string; zone: string }) {
  const router = useRouter();
  const { t } = useSiteLanguage();
  const [style, setStyle] = useState<(typeof STYLE_OPTIONS)[number]>(
    STYLE_OPTIONS[0],
  );

  useEffect(() => {
    const draft = getQuoteDraft();
    if (isLargeQuoteSize(size)) {
      router.replace(`/cotizacion/asesoria?size=${encodeURIComponent(size)}`);
      return;
    }
    if (draft?.zone) {
      router.replace(
        `/cotizacion/confirmacion?size=${encodeURIComponent(size)}&zone=${encodeURIComponent(draft.zone)}`,
      );
      return;
    }
    router.replace(`/cotizacion/ubicacion?size=${encodeURIComponent(size)}`);
  }, [router, size]);

  return (
    <QuoteShell>
      <section className="relative mb-8">
        <div className="pointer-events-none absolute -left-10 -top-10 h-40 w-40 rounded-full bg-amber-600/15 blur-[60px]" />
        <p className="typo-tech mb-2 uppercase tracking-[0.16em] text-amber-200/85">
          {t("quoteStyleStep")}
        </p>
        <h2 className="typo-section quote-step-title">
          {t("quoteStyleTitle")}
          <br />
          <span className="bg-gradient-to-r from-white to-zinc-400 bg-clip-text text-transparent">
            {t("quoteStyleTitle2")}
          </span>
        </h2>
        <p className="typo-body mt-4 max-w-2xl leading-relaxed">
          {t("quoteStyleBody")}
        </p>
      </section>

      <section className="mb-8">
        <div className="glass-card rounded-2xl p-5">
          <div className="mb-4 flex items-center gap-3">
            <div className="flex h-6 w-6 items-center justify-center rounded-full border border-amber-500/30 bg-amber-600/10">
              <span className="text-[10px] font-bold text-white">6</span>
            </div>
            <h3 className="typo-subtitle text-sm uppercase tracking-[0.14em] text-zinc-200">
              Estilo artístico
            </h3>
          </div>

          <div className="grid gap-2">
            {STYLE_OPTIONS.map((option) => {
              const selected = style === option;
              return (
                <button
                  key={option}
                  type="button"
                  onClick={() => setStyle(option)}
                  className={
                    selected
                      ? "flex items-center justify-between rounded-2xl border border-amber-500/30 bg-amber-600/15 p-3"
                      : "flex items-center justify-between rounded-2xl border border-white/10 bg-white/5 p-3 transition hover:bg-white/8"
                  }
                >
                  <span className="text-sm font-semibold text-zinc-50">{option}</span>
                  <span
                    className={
                      selected
                        ? "h-2.5 w-2.5 rounded-full bg-amber-500"
                        : "h-2.5 w-2.5 rounded-full bg-white/20"
                    }
                  />
                </button>
              );
            })}
          </div>
        </div>
      </section>

      <div className="quote-step-footer mt-6">
        <button
          type="button"
          onClick={() =>
            router.push(
              `/cotizacion/ubicacion?size=${encodeURIComponent(size)}`,
            )
          }
          className="quote-step-footer-back rounded-xl border border-white/10 bg-white/5 px-5 py-3 text-sm font-semibold text-zinc-100 transition hover:bg-white/8"
        >
          {t("commonBack")}
        </button>
        <button
          type="button"
          onClick={() => {
            const notes = getQuoteDraft()?.notes ?? "";
            router.push(
              `/cotizacion/confirmacion?size=${encodeURIComponent(size)}&zone=${encodeURIComponent(zone)}&style=${encodeURIComponent(style)}&notes=${encodeURIComponent(notes.trim())}`,
            );
          }}
          className="quote-step-footer-next btn-accent focus-ring typo-cta group inline-flex items-center justify-center gap-2 rounded-xl px-6 py-3 active:scale-[0.98]"
        >
          {t("quoteContinue")}
          <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
        </button>
      </div>
    </QuoteShell>
  );
}
