"use client";

import { useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import { QuoteShell } from "@/widgets/quote/QuoteShell";
import {
  QuotePanel,
  QuotePrimaryCta,
  QuoteStepHeader,
} from "@/widgets/quote/QuoteStepChrome";
import { CalendarDays } from "lucide-react";
import { useSiteLanguage } from "@/shared/i18n/LanguageProvider";
import { getQuoteProfile } from "@/shared/lib/quoteProfile";
import { getQuoteConnection, mapConnectionToSmartQuote } from "@/shared/lib/quoteConnection";
import {
  addSmartQuoteRequest,
  persistQuoteRequestToBackend,
  type SmartQuoteRequest,
} from "@/shared/lib/smartQuotes";
import { receivesOnlinePricing, getQuoteDraft, setQuoteCompletionType } from "@/shared/lib/quoteDraft";
import { formatQuoteLocationLabel } from "@/widgets/quote/quoteBodyLocation";
import { buildQuoteSessionEstimate } from "@/shared/lib/quoteSessionPricing";

const DEFAULT_QUOTE_STYLE = "Por definir";

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
        "relative overflow-hidden rounded-2xl border p-4 sm:p-5",
        accent
          ? "border-[rgba(var(--rgb-honey),0.28)] bg-[rgba(var(--rgb-cafe),0.55)]"
          : "border-[rgba(var(--rgb-sand),0.12)] bg-[rgba(12,10,8,0.45)]",
      ].join(" ")}
    >
      <div className="flex items-start gap-3">
        <span
          className={[
            "inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border",
            accent
              ? "border-[rgba(var(--rgb-honey),0.3)] bg-[rgba(var(--rgb-honey),0.1)] text-[rgba(var(--rgb-honey),0.9)]"
              : "border-[rgba(var(--rgb-sand),0.14)] bg-white/5 text-[rgba(var(--rgb-sand),0.8)]",
          ].join(" ")}
        >
          <CalendarDays className="h-4 w-4" strokeWidth={1.5} />
        </span>
        <div className="min-w-0">
          <h3 className="text-sm font-semibold tracking-tight text-[rgba(var(--rgb-sand),0.95)]">
            {title}
          </h3>
          <p className="mt-0.5 text-xs leading-relaxed text-[rgba(var(--rgb-ivory),0.5)]">{hint}</p>
        </div>
      </div>

      <div className="mt-4 border-t border-[rgba(var(--rgb-sand),0.1)] pt-4">
        <p className="font-mono text-[1.65rem] font-semibold leading-none tracking-tight text-[rgba(var(--rgb-sand),0.96)] sm:text-[1.85rem]">
          {price}
        </p>
        <p className="mt-1 text-xs font-medium uppercase tracking-[0.12em] text-[rgba(var(--rgb-sand),0.4)]">
          {perSessionLabel}
        </p>
      </div>

      <div className="mt-4 rounded-xl border border-[rgba(var(--rgb-sand),0.1)] bg-black/25 px-3 py-2.5">
        <p className="font-mono text-[0.58rem] uppercase tracking-[0.14em] text-[rgba(var(--rgb-sand),0.4)]">
          {totalLabel}
        </p>
        <p className="mt-0.5 font-mono text-sm font-semibold text-[rgba(var(--rgb-ivory),0.9)]">
          {total}
        </p>
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

  const zoneLabel = formatQuoteLocationLabel(getQuoteDraft(), t, {
    zone,
    zoneOther,
  });

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
      <QuoteStepHeader
        eyebrow={t("quoteSummaryTag")}
        title={t("quoteSummaryTitle")}
        body={t("quoteSummaryBody")}
      />

      <section className="mt-2 grid gap-4 md:grid-cols-[1.15fr_.85fr]">
        <QuotePanel label={t("quotePricingSectionTitle")}>
          <div className="mb-4 flex items-center justify-between gap-3">
            <p className="font-mono text-[0.68rem] uppercase tracking-[0.14em] text-[rgba(var(--rgb-sand),0.7)]">
              {t("quotePricingSizeLabel")}: {size}
            </p>
            <span className="rounded-lg border border-[rgba(var(--rgb-sand),0.14)] bg-black/30 px-3 py-1 font-mono text-[0.65rem] text-[rgba(var(--rgb-sand),0.75)]">
              {estimate.sessions}
            </span>
          </div>

          <p className="mb-4 text-sm text-[rgba(var(--rgb-ivory),0.55)]">
            {t("quotePricingZoneLabel")}: {zoneLabel}
          </p>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
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

          <p className="mt-4 text-sm leading-relaxed text-[rgba(var(--rgb-ivory),0.45)]">
            {t("quotePricingFootnote")}
          </p>
        </QuotePanel>

        <aside className="flex flex-col justify-between gap-5 rounded-2xl border border-[rgba(var(--rgb-sand),0.14)] bg-[rgba(12,10,8,0.72)] p-5 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] backdrop-blur-md md:sticky md:top-24 md:h-fit">
          <div>
            <p className="font-mono text-[0.62rem] uppercase tracking-[0.16em] text-[rgba(var(--rgb-sand),0.5)]">
              {t("quoteActionTitle")}
            </p>
            <p className="mt-2 text-sm leading-relaxed text-[rgba(var(--rgb-ivory),0.62)]">
              {t("quoteActionBody")}
            </p>
            <p className="mt-3 font-mono text-[0.65rem] leading-relaxed text-[rgba(var(--rgb-sand),0.4)]">
              {t("quoteActionReply")}
            </p>
          </div>
          <QuotePrimaryCta onClick={registerQuoteAndContinue}>
            {t("quoteActionCta")}
          </QuotePrimaryCta>
        </aside>
      </section>
    </QuoteShell>
  );
}
