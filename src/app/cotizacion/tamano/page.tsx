"use client";

import Image from "next/image";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { QuoteShell } from "@/widgets/quote/QuoteShell";
import { Check, ArrowRight } from "lucide-react";
import { getQuoteConnection } from "@/shared/lib/quoteConnection";
import { saveQuoteDraft, getQuoteDraft } from "@/shared/lib/quoteDraft";
import {
  hasCompleteQuoteProfile,
  QUOTE_FLOW_PATHS,
  shouldSkipToQuote,
} from "@/shared/lib/quoteFlow";
import { useSiteLanguage } from "@/shared/i18n/LanguageProvider";

type SizeOption = "mediano" | "grande";

export default function CotizacionTamanoPage() {
  const router = useRouter();
  const { t } = useSiteLanguage();
  const [size, setSize] = useState<SizeOption>("mediano");

  useEffect(() => {
    if (!hasCompleteQuoteProfile()) {
      router.replace(QUOTE_FLOW_PATHS.profile);
      return;
    }
    if (!getQuoteConnection()) {
      router.replace(QUOTE_FLOW_PATHS.connection);
    }
  }, [router]);

  const options = useMemo(
    () =>
      [
        {
          id: "mediano" as const,
          label: t("quoteSizeMediumLabel"),
          detail: t("quoteSizeMediumDetail"),
          img: "/quote-sizes/medium-reference.png",
        },
        {
          id: "grande" as const,
          label: t("quoteSizeLargeLabel"),
          detail: t("quoteSizeLargeDetail"),
          img: "/quote-sizes/large-reference.png",
        },
      ] satisfies Array<{
        id: SizeOption;
        label: string;
        detail: string;
        img: string;
      }>,
    [t],
  );

  return (
    <QuoteShell greetingKey={shouldSkipToQuote() ? "quoteGreetResume" : "quoteGreetSize"}>
      <section className="relative mb-8">
        <div className="pointer-events-none absolute -left-10 -top-10 h-40 w-40 rounded-full bg-stone-600/12 blur-[60px]" />
        <p className="typo-tech mb-2 uppercase tracking-[0.16em] text-stone-400">
          {t("quoteSizeStep")}
        </p>
        <h2 className="typo-section quote-step-title">
          {t("quoteSizeTitle")}
          <br />
          <span className="bg-gradient-to-r from-white to-zinc-400 bg-clip-text text-transparent">
            {t("quoteSizeTitle2")}
          </span>
        </h2>
        <p className="typo-body mt-4 max-w-2xl leading-relaxed">{t("quoteSizeBody")}</p>
      </section>

      <section className="mb-10">
        <div className="mb-4 flex items-center gap-3">
          <div className="flex h-6 w-6 items-center justify-center rounded-full border border-stone-500/30 bg-stone-600/10">
            <span className="text-[10px] font-bold text-white">3</span>
          </div>
          <h3 className="typo-subtitle text-sm uppercase tracking-[0.14em] text-zinc-200">
            {t("quoteSizeSectionLabel")}
          </h3>
        </div>

        <div className="mx-auto grid max-w-2xl grid-cols-1 gap-4 sm:grid-cols-2">
          {options.map((o) => {
            const selected = size === o.id;
            return (
              <button
                key={o.id}
                type="button"
                onClick={() => setSize(o.id)}
                className={[
                  "relative overflow-hidden rounded-xl p-4 transition-all duration-300",
                  selected ? "glass-card-selected scale-[1.02]" : "glass-card",
                  !selected ? "hover:-translate-y-1" : "",
                ].join(" ")}
              >
                <div className="relative">
                  <div
                    className={[
                      "relative mb-4 aspect-square max-h-44 w-full overflow-hidden rounded-lg border md:max-h-48",
                      selected
                        ? "border-stone-500/30 bg-black/60"
                        : "border-white/5 bg-black/40",
                    ].join(" ")}
                  >
                    <div className="absolute inset-0 z-10 bg-gradient-to-t from-black/80 via-transparent to-transparent" />
                    <Image
                      src={o.img}
                      alt={o.label}
                      fill
                      className={[
                        "object-cover transition duration-500",
                        selected ? "scale-105 brightness-110" : "opacity-70",
                      ].join(" ")}
                    />
                    {selected ? (
                      <span className="absolute right-2 top-2 z-20 inline-flex h-6 w-6 items-center justify-center rounded-full bg-stone-600 text-white shadow-lg">
                        <Check className="h-4 w-4" />
                      </span>
                    ) : null}
                  </div>

                  <div className="text-center">
                    <span className="block text-xs font-bold uppercase tracking-wider text-white">
                      {o.label}
                    </span>
                    <span
                      className={[
                        "mt-1 block font-mono text-sm font-semibold tabular-nums tracking-wide",
                        selected ? "text-stone-200/85" : "text-zinc-300/80",
                      ].join(" ")}
                    >
                      {o.detail}
                    </span>
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      </section>

      <div className="quote-step-footer mt-auto pt-6">
        <button
          type="button"
          onClick={() => router.push(QUOTE_FLOW_PATHS.connection)}
          className="quote-step-footer-back rounded-xl border border-white/10 bg-white/5 px-5 py-3 text-sm font-semibold text-zinc-100 transition hover:bg-white/8"
        >
          {t("commonBack")}
        </button>
        <button
          type="button"
          onClick={() => {
            saveQuoteDraft({
              size,
              zone: getQuoteDraft()?.zone,
              zoneOther: getQuoteDraft()?.zoneOther,
              notes: getQuoteDraft()?.notes ?? "",
            });
            router.push(`/cotizacion/ubicacion?size=${size}`);
          }}
          className="quote-step-footer-next btn-accent focus-ring typo-cta group inline-flex items-center justify-center gap-2 rounded-lg px-6 py-3 active:scale-[0.98]"
        >
          {t("quoteContinue")}
          <ArrowRight className="h-5 w-5 transition-transform group-hover:translate-x-1" />
        </button>
      </div>
    </QuoteShell>
  );
}
