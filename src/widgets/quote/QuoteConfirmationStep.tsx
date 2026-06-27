"use client";

import { useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import { QuoteShell } from "@/widgets/quote/QuoteShell";
import { BadgeDollarSign, CalendarDays, CheckCircle2, Sparkles } from "lucide-react";
import { useSiteLanguage } from "@/shared/i18n/LanguageProvider";
import { getQuoteProfile } from "@/shared/lib/quoteProfile";
import { getQuoteConnection, mapConnectionToSmartQuote } from "@/shared/lib/quoteConnection";
import {
  addSmartQuoteRequest,
  persistQuoteRequestToBackend,
  type SmartQuoteRequest,
} from "@/shared/lib/smartQuotes";
import { receivesOnlinePricing, getQuoteDraft, setQuoteCompletionType } from "@/shared/lib/quoteDraft";
import { formatZoneDisplay, getZoneRefinementFromDraft } from "@/shared/lib/quoteZones";
import { buildQuoteSessionEstimate } from "@/shared/lib/quoteSessionPricing";

const DEFAULT_QUOTE_STYLE = "Neutrottt Style";

function PricingTierCard({
  title,
  hint,
  perSessionLabel,
  price,
  totalLabel,
  total,
  accent = false,
}: {
  title: string;
  hint: string;
  perSessionLabel: string;
  price: string;
  totalLabel: string;
  total: string;
  accent?: boolean;
}) {
  return (
    <article
      className={[
        "relative overflow-hidden rounded-2xl border p-4 transition-colors sm:p-5",
        accent
          ? "border-amber-400/30 bg-gradient-to-b from-amber-500/10 to-amber-950/10"
          : "border-white/10 bg-white/[0.03]",
      ].join(" ")}
    >
      {accent ? (
        <div
          className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-amber-300/45 to-transparent"
          aria-hidden
        />
      ) : null}

      <div className="flex items-start gap-3">
        <span
          className={[
            "inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full border",
            accent
              ? "border-amber-400/35 bg-amber-500/15 text-amber-100"
              : "border-white/12 bg-white/5 text-zinc-200",
          ].join(" ")}
        >
          <CalendarDays className="h-4 w-4" strokeWidth={1.75} />
        </span>
        <div className="min-w-0">
          <h3 className="text-sm font-bold tracking-tight text-zinc-50">{title}</h3>
          <p className="mt-0.5 text-xs leading-relaxed text-zinc-400">{hint}</p>
        </div>
      </div>

      <div className="mt-4 border-t border-white/8 pt-4">
        <p className="font-mono text-[1.65rem] font-semibold leading-none tracking-tight text-zinc-50 sm:text-[1.85rem]">
          {price}
        </p>
        <p className="mt-1 text-xs font-medium uppercase tracking-[0.12em] text-zinc-500">
          {perSessionLabel}
        </p>
      </div>

      <div className="mt-4 rounded-xl border border-white/8 bg-black/20 px-3 py-2.5">
        <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-zinc-500">
          {totalLabel}
        </p>
        <p className="mt-0.5 font-mono text-sm font-semibold text-zinc-100">{total}</p>
      </div>
    </article>
  );
}

export function QuoteConfirmationStep({
  size,
  sizeRaw,
  zone,
  zoneOther,
}: {
  size: string;
  sizeRaw: string;
  zone: string;
  zoneOther?: string;
}) {
  const router = useRouter();
  const { language, t } = useSiteLanguage();

  const estimate = useMemo(
    () => buildQuoteSessionEstimate(sizeRaw, language),
    [sizeRaw, language],
  );

  const zoneLabel = formatZoneDisplay(
    zone,
    zoneOther,
    t,
    getZoneRefinementFromDraft(getQuoteDraft()),
  );

  const pricingSummary = `${t("quotePricingConsecutiveTitle")}: ${estimate.consecutivePerSession} · ${t("quotePricingSeparateTitle")}: ${estimate.separatePerSession}`;

  useEffect(() => {
    if (!receivesOnlinePricing(sizeRaw)) {
      router.replace(`/cotizacion/asesoria?size=${encodeURIComponent(sizeRaw.toLowerCase())}`);
    }
  }, [router, sizeRaw]);

  const registerQuoteAndContinue = () => {
    const profile = getQuoteProfile();
    const connection = getQuoteConnection();
    if (profile) {
      const connectionFields = connection ? mapConnectionToSmartQuote(connection, t) : {};
      const request: SmartQuoteRequest = {
        id: `SQ-${Date.now()}`,
        createdAt: new Date().toISOString(),
        clientName: profile.name,
        phone: profile.phone,
        email: profile.email,
        size,
        zone: zoneLabel,
        style: DEFAULT_QUOTE_STYLE,
        notes: getQuoteDraft()?.notes?.trim() ?? "",
        ...connectionFields,
        estimateSessions: estimate.sessions,
        estimatePerSession: pricingSummary,
        estimateTotal: `${t("quotePricingConsecutiveTitle")}: ${estimate.consecutiveTotal} · ${t("quotePricingSeparateTitle")}: ${estimate.separateTotal}`,
        status: "Pendiente de Ajuste",
      };
      addSmartQuoteRequest(request);
      void persistQuoteRequestToBackend(request);
    }
    setQuoteCompletionType("cotizacion");
    router.push("/cotizacion/gracias");
  };

  return (
    <QuoteShell greetingKey="quoteGreetConfirm">
      <section className="relative overflow-hidden rounded-3xl border border-white/10 bg-[radial-gradient(560px_260px_at_15%_0%,rgba(251,191,36,0.26),transparent_60%),linear-gradient(180deg,rgba(255,255,255,0.05),transparent_35%),#0d0d0e] p-5 md:p-8">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(560px_280px_at_90%_100%,rgba(217,119,6,0.14),transparent_62%)]" />

        <div className="relative z-10">
          <p className="typo-tech uppercase tracking-[0.16em] text-amber-200/85">
            {t("quoteSummaryTag")}
          </p>
          <h1 className="typo-section quote-step-title mt-2">{t("quoteSummaryTitle")}</h1>
          <p className="typo-body mt-3 max-w-2xl leading-relaxed">{t("quoteSummaryBody")}</p>
        </div>
      </section>

      <section className="mt-5 grid gap-4 md:grid-cols-[1.15fr_.85fr]">
        <article className="glass-card rounded-2xl p-5">
          <div className="flex items-center justify-between gap-3">
            <p className="typo-subtitle inline-flex items-center gap-2 text-sm uppercase tracking-[0.14em] text-zinc-300">
              <BadgeDollarSign className="h-4 w-4 text-amber-300" />
              {t("quotePricingSectionTitle")}
            </p>
            <span className="typo-tech rounded-full border border-white/12 bg-white/5 px-3 py-1 text-zinc-200">
              {estimate.sessions}
            </span>
          </div>

          <div className="typo-tech mt-4 grid gap-2 rounded-2xl border border-white/10 bg-black/35 p-4 text-zinc-200">
            <p className="inline-flex items-center gap-2 text-zinc-200">
              <Sparkles className="h-4 w-4 text-amber-300" />
              {t("quotePricingSizeLabel")}: {size}
            </p>
            <p className="inline-flex items-center gap-2 text-zinc-200">
              <CheckCircle2 className="h-4 w-4 text-amber-300" />
              {t("quotePricingZoneLabel")}: {zoneLabel}
            </p>
          </div>

          <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-2">
            <PricingTierCard
              title={t("quotePricingConsecutiveTitle")}
              hint={t("quotePricingConsecutiveHint")}
              perSessionLabel={t("quotePricingPerSession")}
              price={estimate.consecutivePerSession}
              totalLabel={t("quotePricingEstimatedTotal")}
              total={estimate.consecutiveTotal}
              accent
            />
            <PricingTierCard
              title={t("quotePricingSeparateTitle")}
              hint={t("quotePricingSeparateHint")}
              perSessionLabel={t("quotePricingPerSession")}
              price={estimate.separatePerSession}
              totalLabel={t("quotePricingEstimatedTotal")}
              total={estimate.separateTotal}
            />
          </div>

          <p className="mt-4 text-sm leading-relaxed text-zinc-400">{t("quotePricingFootnote")}</p>
        </article>

        <article className="glass-card flex flex-col justify-between gap-5 rounded-2xl p-5 md:sticky md:top-24 md:h-fit">
          <div>
            <p className="typo-subtitle text-sm uppercase tracking-[0.14em] text-zinc-300">
              {t("quoteActionTitle")}
            </p>
            <p className="typo-body mt-2 text-sm leading-relaxed text-zinc-400">{t("quoteActionBody")}</p>
            <p className="typo-tech mt-3 text-xs leading-relaxed text-zinc-500">{t("quoteActionReply")}</p>
          </div>
          <button
            type="button"
            onClick={registerQuoteAndContinue}
            className="btn-accent focus-ring typo-cta inline-flex w-full items-center justify-center gap-2 rounded-xl px-5 py-4 active:scale-[0.98]"
          >
            {t("quoteActionCta")}
          </button>
        </article>
      </section>
    </QuoteShell>
  );
}
