"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight } from "lucide-react";
import { QuoteShell } from "@/widgets/quote/QuoteShell";
import {
  QuotePanel,
  QuoteStepHeader,
} from "@/widgets/quote/QuoteStepChrome";
import { useSiteLanguage } from "@/shared/i18n/LanguageProvider";
import {
  getQuoteConnection,
  REFERRAL_LABEL_KEYS,
  REFERRAL_SOURCES,
  saveQuoteConnection,
  type QuoteConnection,
  type ReferralSource,
} from "@/shared/lib/quoteConnection";
import {
  hasCompleteQuoteProfile,
  hasCompletedQuoteOnboarding,
  QUOTE_FLOW_PATHS,
  startNewQuoteSession,
} from "@/shared/lib/quoteFlow";
import { cn } from "@/shared/lib/cn";

export function QuoteReferralStep() {
  const router = useRouter();
  const { t } = useSiteLanguage();
  const [ready, setReady] = useState(false);
  const [source, setSource] = useState<ReferralSource | "">("");
  const [sourceOther, setSourceOther] = useState("");
  const [marketingOptIn, setMarketingOptIn] = useState(false);
  const [openNote, setOpenNote] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    if (!hasCompleteQuoteProfile()) {
      router.replace(QUOTE_FLOW_PATHS.profile);
      return;
    }
    if (hasCompletedQuoteOnboarding()) {
      startNewQuoteSession();
      router.replace(QUOTE_FLOW_PATHS.quoteStart);
      return;
    }

    const saved = getQuoteConnection();
    if (saved) {
      setSource(saved.source);
      setSourceOther(saved.sourceOther ?? "");
      setMarketingOptIn(saved.marketingOptIn);
      setOpenNote(saved.openNote);
    }
    setReady(true);
  }, [router]);

  const onContinue = () => {
    if (!source) {
      setError(t("quoteConnectionErrorSource"));
      return;
    }
    if (source === "other" && !sourceOther.trim()) {
      setError(t("quoteConnectionErrorOther"));
      return;
    }

    const connection: QuoteConnection = {
      source,
      sourceOther: source === "other" ? sourceOther.trim() : undefined,
      marketingOptIn,
      openNote: openNote.trim(),
    };
    saveQuoteConnection(connection);
    startNewQuoteSession();
    router.push(QUOTE_FLOW_PATHS.quoteStart);
  };

  if (!ready) {
    return (
      <QuoteShell showGreeting={false}>
        <div className="flex min-h-[40dvh] items-center justify-center">
          <p className="typo-tech text-sm uppercase tracking-[0.18em] text-stone-400">
            {t("quoteConnectionLoading")}
          </p>
        </div>
      </QuoteShell>
    );
  }

  return (
    <QuoteShell greetingKey="quoteGreetStart">
      <QuoteStepHeader
        eyebrow={t("quoteConnectionStep")}
        title={t("quoteConnectionTitle")}
        body={t("quoteConnectionBody")}
      />

      <section className="mb-8 space-y-5">
        <QuotePanel>
          <label className="flex flex-col gap-2" htmlFor="quote-referral-source">
            <span className="text-xs font-semibold uppercase tracking-[0.14em] text-[rgba(var(--rgb-sand),0.72)]">
              {t("quoteConnectionReferralLabel")}
            </span>
            <select
              id="quote-referral-source"
              value={source}
              onChange={(e) => {
                setSource(e.target.value as ReferralSource | "");
                setError("");
              }}
              className="w-full rounded-xl border border-[rgba(var(--rgb-sand),0.14)] bg-black/40 px-4 py-3 text-sm text-[rgba(var(--rgb-ivory),0.95)] outline-none transition focus:border-[rgba(var(--rgb-honey),0.45)]"
            >
              <option value="" disabled>
                {t("quoteConnectionReferralPlaceholder")}
              </option>
              {REFERRAL_SOURCES.map((option) => (
                <option key={option} value={option}>
                  {t(REFERRAL_LABEL_KEYS[option])}
                </option>
              ))}
            </select>
          </label>

          {source === "other" ? (
            <label className="mt-4 flex flex-col gap-2" htmlFor="quote-referral-other">
              <span className="text-xs font-semibold uppercase tracking-[0.14em] text-[rgba(var(--rgb-sand),0.72)]">
                {t("quoteConnectionReferralOtherLabel")}
              </span>
              <input
                id="quote-referral-other"
                value={sourceOther}
                onChange={(e) => {
                  setSourceOther(e.target.value);
                  setError("");
                }}
                placeholder={t("quoteConnectionReferralOtherPlaceholder")}
                className="w-full rounded-xl border border-[rgba(var(--rgb-sand),0.14)] bg-black/40 px-4 py-3 text-sm text-[rgba(var(--rgb-ivory),0.95)] outline-none transition placeholder:text-zinc-500 focus:border-[rgba(var(--rgb-honey),0.45)]"
              />
            </label>
          ) : null}
        </QuotePanel>

        <label
          className={cn(
            "flex cursor-pointer items-start gap-3 rounded-2xl border border-[rgba(var(--rgb-sand),0.12)] bg-[rgba(12,10,8,0.55)] p-5 transition",
            "hover:border-[rgba(var(--rgb-sand),0.2)] active:scale-[0.99]",
          )}
        >
          <input
            type="checkbox"
            checked={marketingOptIn}
            onChange={(e) => setMarketingOptIn(e.target.checked)}
            className="mt-1 h-4 w-4 shrink-0 rounded border-white/20 bg-black/40 text-[rgba(var(--rgb-honey),0.9)] focus:ring-[rgba(var(--rgb-honey),0.35)]"
          />
          <span className="text-sm leading-relaxed text-[rgba(var(--rgb-ivory),0.78)]">
            {t("quoteConnectionMarketingOptIn")}
          </span>
        </label>

        <QuotePanel>
          <label className="flex flex-col gap-2" htmlFor="quote-referral-note">
            <span className="text-xs font-semibold uppercase tracking-[0.14em] text-[rgba(var(--rgb-sand),0.72)]">
              {t("quoteConnectionOpenLabel")}
            </span>
            <span className="font-mono text-[0.58rem] uppercase tracking-[0.14em] text-[rgba(var(--rgb-sand),0.4)]">
              {t("quoteConnectionOpenHint")}
            </span>
            <input
              id="quote-referral-note"
              value={openNote}
              onChange={(e) => setOpenNote(e.target.value)}
              placeholder={t("quoteConnectionOpenPlaceholder")}
              className="w-full rounded-xl border border-[rgba(var(--rgb-sand),0.14)] bg-black/40 px-4 py-3 text-sm text-[rgba(var(--rgb-ivory),0.95)] outline-none transition placeholder:text-zinc-500 focus:border-[rgba(var(--rgb-honey),0.45)]"
            />
          </label>
        </QuotePanel>

        {error ? (
          <p className="text-sm font-semibold text-[rgba(var(--rgb-honey),0.9)]" role="alert">
            {error}
          </p>
        ) : null}
      </section>

      <div className="quote-step-footer mt-auto pt-6">
        <button
          type="button"
          onClick={() => router.push(QUOTE_FLOW_PATHS.profile)}
          className="quote-step-footer-back rounded-xl border border-[rgba(var(--rgb-sand),0.14)] bg-white/5 px-5 py-3 text-sm font-semibold text-[rgba(var(--rgb-sand),0.9)] transition hover:bg-white/8 active:scale-[0.98]"
        >
          {t("commonBack")}
        </button>
        <button
          type="button"
          onClick={onContinue}
          className="quote-step-footer-next btn-accent focus-ring typo-cta group inline-flex items-center justify-center gap-2 rounded-xl px-6 py-3 active:scale-[0.98]"
        >
          {t("quoteConnectionContinue")}
          <ArrowRight className="h-5 w-5 transition-transform group-hover:translate-x-1" />
        </button>
      </div>
    </QuoteShell>
  );
}
