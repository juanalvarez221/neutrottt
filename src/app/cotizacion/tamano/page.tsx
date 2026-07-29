"use client";

import Image from "next/image";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { QuoteShell } from "@/widgets/quote/QuoteShell";
import { QuoteStepHeader } from "@/widgets/quote/QuoteStepChrome";
import { Check, ArrowRight } from "lucide-react";
import { saveQuoteDraft, getQuoteDraft } from "@/shared/lib/quoteDraft";
import {
  QUOTE_FLOW_PATHS,
  shouldSkipToQuote,
} from "@/shared/lib/quoteFlow";
import { useQuoteOnboardingGate } from "@/widgets/quote/useQuoteOnboardingGate";
import { useSiteLanguage } from "@/shared/i18n/LanguageProvider";

type SizeOption = "mediano" | "grande";

export default function CotizacionTamanoPage() {
  const router = useRouter();
  const { t } = useSiteLanguage();
  const [size, setSize] = useState<SizeOption | null>(null);
  const gateReady = useQuoteOnboardingGate();

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

  if (!gateReady) {
    return (
      <QuoteShell showGreeting={false}>
        <div className="flex min-h-[40dvh] items-center justify-center">
          <p className="typo-tech text-sm uppercase tracking-[0.18em] text-stone-400">
            Cargando…
          </p>
        </div>
      </QuoteShell>
    );
  }

  return (
    <QuoteShell greetingKey={shouldSkipToQuote() ? "quoteGreetResume" : "quoteGreetSize"}>
      <QuoteStepHeader
        eyebrow={t("quoteSizeStep")}
        title={t("quoteSizeTitle")}
        titleAccent={t("quoteSizeTitle2")}
        body={t("quoteSizeBody")}
      />

      <section className="mb-10">
        <div className="mx-auto grid max-w-2xl grid-cols-1 gap-4 sm:grid-cols-2">
          {options.map((o) => {
            const selected = size === o.id;
            return (
              <button
                key={o.id}
                type="button"
                onClick={() => setSize(o.id)}
                className={[
                  "relative overflow-hidden rounded-2xl border p-4 text-left transition-all duration-300 active:scale-[0.98]",
                  selected
                    ? "border-[rgba(var(--rgb-honey),0.4)] bg-[rgba(12,10,8,0.85)] shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]"
                    : "border-[rgba(var(--rgb-sand),0.12)] bg-[rgba(12,10,8,0.55)] hover:border-[rgba(var(--rgb-sand),0.22)]",
                ].join(" ")}
              >
                <div className="relative">
                  <div
                    className={[
                      "relative mb-4 aspect-square max-h-44 w-full overflow-hidden rounded-xl border md:max-h-48",
                      selected
                        ? "border-[rgba(var(--rgb-honey),0.25)] bg-black/60"
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
                      <span className="absolute right-2 top-2 z-20 inline-flex h-6 w-6 items-center justify-center rounded-full border border-[rgba(var(--rgb-honey),0.4)] bg-[rgba(var(--rgb-cafe),0.9)] text-[rgba(var(--rgb-sand),0.95)]">
                        <Check className="h-3.5 w-3.5" strokeWidth={2} />
                      </span>
                    ) : null}
                  </div>

                  <div>
                    <span className="block font-mono text-[0.68rem] uppercase tracking-[0.16em] text-[rgba(var(--rgb-sand),0.9)]">
                      {o.label}
                    </span>
                    <span
                      className={[
                        "mt-1 block font-mono text-sm tabular-nums tracking-wide",
                        selected
                          ? "text-[rgba(var(--rgb-honey),0.85)]"
                          : "text-[rgba(var(--rgb-ivory),0.55)]",
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
        {!shouldSkipToQuote() ? (
          <button
            type="button"
            onClick={() => router.push(QUOTE_FLOW_PATHS.connection)}
            className="quote-step-footer-back rounded-xl border border-[rgba(var(--rgb-sand),0.14)] bg-white/5 px-5 py-3 text-sm font-semibold text-[rgba(var(--rgb-sand),0.9)] transition hover:bg-white/8"
          >
            {t("commonBack")}
          </button>
        ) : null}
        <button
          type="button"
          onClick={() => {
            if (!size) return;
            saveQuoteDraft({
              size,
              zone: getQuoteDraft()?.zone,
              zoneOther: getQuoteDraft()?.zoneOther,
              notes: getQuoteDraft()?.notes ?? "",
            });
            router.push(`/cotizacion/ubicacion?size=${size}`);
          }}
          disabled={!size}
          aria-disabled={!size}
          className={[
            "quote-step-footer-next btn-accent focus-ring typo-cta group inline-flex items-center justify-center gap-2 rounded-xl px-6 py-3 active:scale-[0.98]",
            !size ? "cursor-not-allowed opacity-45" : "",
          ].join(" ")}
        >
          {t("quoteContinue")}
          <ArrowRight className="h-5 w-5 transition-transform group-hover:translate-x-1" />
        </button>
      </div>
    </QuoteShell>
  );
}
