"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import { QuoteShell } from "@/widgets/quote/QuoteShell";
import {
  QuoteConnectionIntro,
  QuoteConnectionIntroGate,
} from "@/widgets/quote/QuoteConnectionIntro";
import { QuoteConnectionDecline } from "@/widgets/quote/QuoteConnectionDecline";
import { QuoteConnectionReward } from "@/widgets/quote/QuoteConnectionReward";
import { ArrowRight, Check } from "lucide-react";
import { useSiteLanguage } from "@/shared/i18n/LanguageProvider";
import { buildConnectionPraise } from "@/shared/lib/connectionPraise";
import {
  ADJUSTMENT_LABEL_KEYS,
  ADJUSTMENT_OPTIONS,
  CONNECTION_SELECTION_MODES,
  getQuoteConnection,
  isRejectedCollaboration,
  PERSONAL_VALUES,
  REFERRAL_LABEL_KEYS,
  REFERRAL_SOURCES,
  saveQuoteConnection,
  VALUE_LABEL_KEYS,
  type AdjustmentOption,
  type ConnectionSelectionMode,
  type PersonalValue,
  type QuoteConnection,
  type ReferralSource,
} from "@/shared/lib/quoteConnection";
import { getFirstName, getQuoteProfile } from "@/shared/lib/quoteProfile";
import {
  hasCompletedQuoteOnboarding,
  QUOTE_FLOW_PATHS,
  startNewQuoteSession,
} from "@/shared/lib/quoteFlow";

const TOTAL_QUESTIONS = 4;

function scrollStepToTop() {
  window.scrollTo({ top: 0, left: 0, behavior: "smooth" });
}
function ChoiceOption({
  selected,
  label,
  mode,
  onClick,
}: {
  selected: boolean;
  label: string;
  mode: ConnectionSelectionMode;
  onClick: () => void;
}) {
  const isSingle = mode === "single";

  return (
    <button
      type="button"
      role={isSingle ? "radio" : "checkbox"}
      aria-checked={selected}
      onClick={onClick}
      className={[
        "flex items-center justify-between gap-3 rounded-xl border px-4 py-3.5 text-left text-sm transition",
        selected
          ? "border-stone-500/30 bg-stone-600/10 text-stone-100"
          : "border-white/10 bg-black/30 text-zinc-200 hover:border-stone-500/22 hover:bg-stone-600/8",
      ].join(" ")}
    >
      <span>{label}</span>
      <span
        className={[
          "inline-flex h-5 w-5 shrink-0 items-center justify-center border transition",
          isSingle ? "rounded-full" : "rounded-md",
          selected
            ? isSingle
              ? "border-stone-400/45 bg-stone-500/15"
              : "border-stone-400/40 bg-stone-500/20"
            : "border-white/15 bg-black/40",
        ].join(" ")}
      >
        {selected ? (
          isSingle ? (
            <span className="h-2.5 w-2.5 rounded-full bg-stone-300 shadow-[0_0_6px_rgba(168,156,144,0.35)]" />
          ) : (
            <Check className="h-3 w-3 text-stone-200" strokeWidth={3} />
          )
        ) : null}
      </span>
    </button>
  );
}

function pickOption<T extends string>(
  current: T[],
  item: T,
  mode: ConnectionSelectionMode,
): T[] {
  if (mode === "single") return [item];
  return current.includes(item) ? current.filter((value) => value !== item) : [...current, item];
}

export function QuoteConnectionStep() {
  const router = useRouter();
  const { t } = useSiteLanguage();
  const [showIntro, setShowIntro] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [step, setStep] = useState(0);
  const [referralSources, setReferralSources] = useState<ReferralSource[]>([]);
  const [referralOther, setReferralOther] = useState("");
  const [personalValues, setPersonalValues] = useState<PersonalValue[]>([]);
  const [adjustments, setAdjustments] = useState<AdjustmentOption[]>([]);
  const [openNote, setOpenNote] = useState("");
  const [error, setError] = useState("");
  const [showReward, setShowReward] = useState(false);
  const [showDecline, setShowDecline] = useState(false);
  const [rewardConnection, setRewardConnection] = useState<QuoteConnection | null>(null);
  const [gateReady, setGateReady] = useState(false);

  const firstName = useMemo(() => getFirstName(), []);

  const rewardPraise = useMemo(() => {
    if (!rewardConnection) return null;
    return buildConnectionPraise(rewardConnection, t, firstName);
  }, [rewardConnection, t, firstName]);

  const handleIntroComplete = useCallback(() => {
    setShowIntro(false);
    setShowForm(true);
  }, []);

  useEffect(() => {
    if (!getQuoteProfile()) {
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
      setShowIntro(false);
      setShowForm(true);
      setReferralSources(saved.referralSources);
      setReferralOther(saved.referralOther ?? "");
      setPersonalValues(saved.personalValues);
      setAdjustments(saved.adjustments);
      setOpenNote(saved.openNote);
    }
    setGateReady(true);
  }, [router]);

  const progressLabel = t("quoteConnectionProgress")
    .replace("{current}", String(step + 1))
    .replace("{total}", String(TOTAL_QUESTIONS));

  const buildConnection = (): QuoteConnection => ({
    referralSources,
    referralOther: referralOther.trim() || undefined,
    personalValues,
    adjustments,
    openNote: openNote.trim(),
  });

  const validateStep = () => {
    if (step === 0) {
      if (referralSources.length === 0) return t("quoteConnectionErrorSingle");
      if (referralSources.includes("other") && !referralOther.trim()) {
        return t("quoteConnectionErrorOther");
      }
    }
    if (step === 1 && personalValues.length === 0) return t("quoteConnectionErrorMulti");
    if (step === 2 && adjustments.length === 0) return t("quoteConnectionErrorSingle");
    return "";
  };

  const finish = () => {
    const connection = buildConnection();
    if (isRejectedCollaboration(connection.adjustments)) {
      setShowDecline(true);
      scrollStepToTop();
      return;
    }
    saveQuoteConnection(connection);
    setRewardConnection(connection);
    setShowReward(true);
    scrollStepToTop();
  };

  const handleDeclineComplete = useCallback(() => {
    setShowDecline(false);
    router.push("/cotizacion");
  }, [router]);

  const handleRewardComplete = useCallback(() => {
    setShowReward(false);
    startNewQuoteSession();
    router.push(QUOTE_FLOW_PATHS.quoteStart);
  }, [router]);

  const goNext = () => {
    const message = validateStep();
    if (message) {
      setError(message);
      return;
    }
    setError("");
    if (step === TOTAL_QUESTIONS - 1) {
      finish();
      return;
    }
    setStep((current) => current + 1);
    scrollStepToTop();
  };

  const goBack = () => {
    setError("");
    if (step === 0) {
      router.push("/cotizacion");
      return;
    }
    setStep((current) => current - 1);
    scrollStepToTop();
  };

  const showOtherReferral = referralSources.includes("other");

  if (!gateReady) {
    return (
      <QuoteShell showGreeting={false}>
        <div className="flex min-h-[40dvh] items-center justify-center">
          <p className="typo-tech text-sm uppercase tracking-[0.18em] text-stone-400">
            {t("quoteConnectionStep")}
          </p>
        </div>
      </QuoteShell>
    );
  }

  return (
    <QuoteShell showGreeting={false}>
      <AnimatePresence>
        {showDecline ? (
          <QuoteConnectionDecline
            key="connection-decline"
            tag={t("quoteConnectionDeclineTag")}
            title1={t("quoteConnectionDeclineTitle1")}
            title2={t("quoteConnectionDeclineTitle2")}
            lead={t("quoteConnectionDeclineLead")}
            lines={[
              t("quoteConnectionDeclineLine1"),
              t("quoteConnectionDeclineLine2"),
            ]}
            continueLabel={t("quoteConnectionDeclineContinue")}
            onComplete={handleDeclineComplete}
          />
        ) : null}
        {showReward && rewardPraise ? (
          <QuoteConnectionReward
            key="connection-reward"
            title1={t("quoteConnectionRewardTitle1")}
            title2={t("quoteConnectionRewardTitle2")}
            tag={t("quoteConnectionRewardTag")}
            continueLabel={t("quoteConnectionRewardContinue")}
            tapHint={t("quoteConnectionRewardTapHint")}
            praise={rewardPraise}
            onComplete={handleRewardComplete}
          />
        ) : null}
      </AnimatePresence>

      <QuoteConnectionIntroGate
        show={showIntro}
        intro={
          <QuoteConnectionIntro
            title={t("quoteConnectionTitle")}
            title2={t("quoteConnectionTitle2")}
            manifest={t("quoteConnectionManifest")}
            eyebrow={t("quoteConnectionStep")}
            onComplete={handleIntroComplete}
          />
        }
      >
        <div className="relative flex min-h-0 flex-1 flex-col">
          <AnimatePresence>
            {showForm ? (
              <motion.div
                key="connection-form-header"
                initial={{ opacity: 0, y: 14, filter: "blur(6px)" }}
                animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
                transition={{ duration: 0.55, ease: [0.22, 1, 0.36, 1] }}
                className="relative mb-6"
              >
                {step === 0 ? (
                  <p className="typo-body max-w-lg text-sm leading-relaxed text-zinc-400">
                    {t("quoteConnectionPace")}
                  </p>
                ) : null}
                <p
                  className={[
                    "typo-tech mb-2 uppercase tracking-[0.16em] text-stone-400",
                    step === 0 ? "mt-6" : "mt-0",
                  ].join(" ")}
                >
                  {t("quoteConnectionStep")} · {progressLabel}
                </p>
                <div className="flex gap-1.5">
                  {Array.from({ length: TOTAL_QUESTIONS }).map((_, index) => (
                    <span
                      key={index}
                      className={[
                        "h-1 flex-1 rounded-full transition",
                        index <= step ? "bg-stone-500/55" : "bg-white/10",
                      ].join(" ")}
                    />
                  ))}
                </div>
              </motion.div>
            ) : null}
          </AnimatePresence>

          <AnimatePresence>
            {showForm ? (
              <motion.div
                key="connection-form"
                initial={{ opacity: 0, y: 20, filter: "blur(8px)" }}
                animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
                transition={{ duration: 0.55, delay: 0.08, ease: [0.22, 1, 0.36, 1] }}
                className="flex flex-1 flex-col"
              >
                <section className="mb-8">
                  <div className="glass-card rounded-2xl p-5 md:p-6">
                    {step === 0 ? (
                      <fieldset className="space-y-3">
                        <legend className="typo-subtitle mb-1 block text-lg leading-snug text-zinc-50 md:text-xl">
                          {t("quoteConnectionReferralLabel")}
                        </legend>
                        <p className="text-xs text-zinc-400">{t("quoteConnectionSingleHint")}</p>
                        <div
                          className="grid gap-2 sm:grid-cols-2"
                          role="radiogroup"
                          aria-label={t("quoteConnectionReferralLabel")}
                        >
                          {REFERRAL_SOURCES.map((source) => (
                            <ChoiceOption
                              key={source}
                              mode={CONNECTION_SELECTION_MODES.referral}
                              selected={referralSources.includes(source)}
                              label={t(REFERRAL_LABEL_KEYS[source])}
                              onClick={() =>
                                setReferralSources((current) =>
                                  pickOption(current, source, CONNECTION_SELECTION_MODES.referral),
                                )
                              }
                            />
                          ))}
                        </div>
                        {showOtherReferral ? (
                          <label className="mt-2 block space-y-2">
                            <span className="text-xs font-semibold uppercase tracking-[0.14em] text-zinc-400">
                              {t("quoteConnectionReferralOtherLabel")}
                            </span>
                            <input
                              type="text"
                              value={referralOther}
                              onChange={(event) => setReferralOther(event.target.value)}
                              maxLength={80}
                              autoFocus
                              placeholder={t("quoteConnectionReferralOtherPlaceholder")}
                              className="w-full rounded-xl border border-white/10 bg-black/35 px-4 py-3 text-sm text-zinc-100 outline-none transition placeholder:text-zinc-500 focus:border-amber-500/50"
                            />
                          </label>
                        ) : null}
                      </fieldset>
                    ) : null}

                    {step === 1 ? (
                      <fieldset className="space-y-3">
                        <legend className="typo-subtitle mb-1 block text-lg leading-snug text-zinc-50 md:text-xl">
                          {t("quoteConnectionValuesLabel")}
                        </legend>
                        <p className="text-xs leading-relaxed text-zinc-400">
                          {t("quoteConnectionValuesHint")}
                        </p>
                        <div className="grid gap-2 sm:grid-cols-2">
                          {PERSONAL_VALUES.map((value) => (
                            <ChoiceOption
                              key={value}
                              mode={CONNECTION_SELECTION_MODES.values}
                              selected={personalValues.includes(value)}
                              label={t(VALUE_LABEL_KEYS[value])}
                              onClick={() =>
                                setPersonalValues((current) =>
                                  pickOption(current, value, CONNECTION_SELECTION_MODES.values),
                                )
                              }
                            />
                          ))}
                        </div>
                      </fieldset>
                    ) : null}

                    {step === 2 ? (
                      <fieldset className="space-y-3">
                        <legend className="typo-subtitle mb-1 block text-lg leading-snug text-zinc-50 md:text-xl">
                          {t("quoteConnectionAdjustLabel")}
                        </legend>
                        <p className="text-xs leading-relaxed text-zinc-400">
                          {t("quoteConnectionAdjustHint")}
                        </p>
                        <div
                          className="grid gap-2"
                          role="radiogroup"
                          aria-label={t("quoteConnectionAdjustLabel")}
                        >
                          {ADJUSTMENT_OPTIONS.map((option) => (
                            <ChoiceOption
                              key={option}
                              mode={CONNECTION_SELECTION_MODES.adjustments}
                              selected={adjustments.includes(option)}
                              label={t(ADJUSTMENT_LABEL_KEYS[option])}
                              onClick={() =>
                                setAdjustments((current) =>
                                  pickOption(current, option, CONNECTION_SELECTION_MODES.adjustments),
                                )
                              }
                            />
                          ))}
                        </div>
                      </fieldset>
                    ) : null}

                    {step === 3 ? (
                      <label className="block space-y-3">
                        <span className="typo-subtitle block text-lg leading-snug text-zinc-50 md:text-xl">
                          {t("quoteConnectionOpenLabel")}
                        </span>
                        <p className="text-xs text-zinc-400">{t("quoteConnectionOpenHint")}</p>
                        <textarea
                          value={openNote}
                          onChange={(event) => setOpenNote(event.target.value)}
                          rows={3}
                          maxLength={200}
                          autoFocus
                          placeholder={t("quoteConnectionOpenPlaceholder")}
                          className="w-full resize-none rounded-xl border border-white/10 bg-black/35 px-4 py-3 text-sm text-zinc-100 outline-none transition placeholder:text-zinc-500 focus:border-amber-500/50"
                        />
                      </label>
                    ) : null}

                    {error ? <p className="mt-4 text-sm text-amber-200/90">{error}</p> : null}
                  </div>
                </section>

                <div className="quote-step-footer mt-auto pt-2">
                  <button
                    type="button"
                    onClick={goBack}
                    className="quote-step-footer-back rounded-xl border border-white/10 bg-white/5 px-5 py-3 text-sm font-semibold text-zinc-100 transition hover:bg-white/8"
                  >
                    {t("commonBack")}
                  </button>
                  <button
                    type="button"
                    onClick={goNext}
                    className="quote-step-footer-next btn-accent focus-ring typo-cta group inline-flex items-center justify-center gap-2 rounded-lg px-6 py-3 active:scale-[0.98]"
                  >
                    {step === TOTAL_QUESTIONS - 1 ? t("quoteConnectionContinue") : t("quoteConnectionNext")}
                    <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
                  </button>
                </div>
              </motion.div>
            ) : null}
          </AnimatePresence>
        </div>
      </QuoteConnectionIntroGate>
    </QuoteShell>
  );
}
