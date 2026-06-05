"use client";

import { useRouter } from "next/navigation";
import { QuoteShell } from "@/widgets/quote/QuoteShell";
import { BadgeDollarSign, CheckCircle2, Sparkles } from "lucide-react";
import { useSiteLanguage } from "@/shared/i18n/LanguageProvider";
import { getQuoteProfile } from "@/shared/lib/quoteProfile";
import { addSmartQuoteRequest } from "@/shared/lib/smartQuotes";

export function QuoteConfirmationStep({
  size,
  zone,
  style,
  notes,
  estimate,
}: {
  size: string;
  zone: string;
  style: string;
  notes?: string;
  estimate: {
    sessions: string;
    perSession: string;
    total: string;
  };
}) {
  const router = useRouter();
  const { language, t } = useSiteLanguage();

  const registerQuoteAndContinue = () => {
    const profile = getQuoteProfile();
    if (profile) {
      addSmartQuoteRequest({
        id: `SQ-${Date.now()}`,
        createdAt: new Date().toISOString(),
        clientName: profile.name,
        phone: profile.phone,
        email: profile.email,
        size,
        zone,
        style,
        notes: notes ?? "",
        estimateSessions: estimate.sessions,
        estimatePerSession: estimate.perSession,
        estimateTotal: estimate.total,
        status: "Pendiente de Ajuste",
      });
    }
    router.push("/cotizacion/gracias");
  };

  return (
    <QuoteShell>
      <section className="relative overflow-hidden rounded-3xl border border-white/10 bg-[radial-gradient(560px_260px_at_15%_0%,rgba(251,191,36,0.26),transparent_60%),linear-gradient(180deg,rgba(255,255,255,0.05),transparent_35%),#0d0d0e] p-5 md:p-8">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(560px_280px_at_90%_100%,rgba(217,119,6,0.14),transparent_62%)]" />

        <div className="relative z-10">
          <p className="typo-tech uppercase tracking-[0.16em] text-amber-200/85">
            {t("quoteSummaryTag")}
          </p>
          <h1 className="typo-section mt-2 text-[2rem] md:text-[2.6rem]">
            {t("quoteSummaryTitle")}
          </h1>
          <p className="typo-body mt-3 max-w-2xl leading-relaxed">{t("quoteSummaryBody")}</p>
        </div>
      </section>

      <section className="mt-5 grid gap-4 md:grid-cols-[1.15fr_.85fr]">
        <article className="glass-card rounded-2xl p-5">
          <div className="flex items-center justify-between gap-3">
            <p className="typo-subtitle inline-flex items-center gap-2 text-sm uppercase tracking-[0.14em] text-zinc-300">
              <BadgeDollarSign className="h-4 w-4 text-amber-300" />
              {language === "en" ? "Summary" : "Resumen"}
            </p>
            <span className="typo-tech rounded-full border border-amber-500/35 bg-amber-600/20 px-3 py-1 text-amber-100">
              {estimate.total}
            </span>
          </div>

          <div className="typo-tech mt-4 grid gap-2 rounded-2xl border border-white/10 bg-black/35 p-4 text-zinc-200">
            <p className="inline-flex items-center gap-2 text-zinc-200">
              <Sparkles className="h-4 w-4 text-amber-300" />
              {language === "en" ? "Size" : "Tamano"}: {size}
            </p>
            <p className="inline-flex items-center gap-2 text-zinc-200">
              <CheckCircle2 className="h-4 w-4 text-amber-300" />
              {language === "en" ? "Area" : "Zona"}: {zone}
            </p>
            <p className="inline-flex items-center gap-2 text-zinc-200">
              <CheckCircle2 className="h-4 w-4 text-amber-300" />
              {language === "en" ? "Style" : "Estilo"}: {style}
            </p>
            {notes ? (
              <p className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-zinc-200">
                {t("quoteNotesLabel")}: {notes}
              </p>
            ) : null}
          </div>

          <div className="mt-4 grid gap-3 sm:grid-cols-3">
            <div className="rounded-xl border border-white/10 bg-white/5 p-3">
              <p className="typo-tech text-zinc-400">{language === "en" ? "Sessions" : "Sesiones"}</p>
              <p className="typo-subtitle mt-1 text-sm text-zinc-100">{estimate.sessions}</p>
            </div>
            <div className="rounded-xl border border-white/10 bg-white/5 p-3">
              <p className="typo-tech text-zinc-400">
                {language === "en" ? "Per session" : "Valor por sesion"}
              </p>
              <p className="typo-subtitle mt-1 text-sm text-zinc-100">{estimate.perSession}</p>
            </div>
            <div className="rounded-xl border border-amber-500/25 bg-amber-500/10 p-3">
              <p className="typo-tech text-amber-200/80">
                {language === "en" ? "Estimated total" : "Total estimado"}
              </p>
              <p className="typo-subtitle mt-1 text-sm text-amber-100">{estimate.total}</p>
            </div>
          </div>
        </article>

        <article className="glass-card flex items-center rounded-2xl p-5 md:sticky md:top-24 md:h-fit">
          <button
            type="button"
            onClick={registerQuoteAndContinue}
            className="typo-cta inline-flex w-full items-center justify-center gap-2 rounded-xl border border-amber-500/35 bg-gradient-to-r from-amber-700 to-orange-600 px-5 py-4 text-white transition hover:-translate-y-0.5 hover:shadow-[0_0_24px_rgba(245,158,11,0.35)] active:translate-y-0"
          >
            {t("quoteActionCta")}
          </button>
        </article>
      </section>
    </QuoteShell>
  );
}
