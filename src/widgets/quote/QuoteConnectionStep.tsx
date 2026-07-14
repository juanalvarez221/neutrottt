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
import { ConnectionChoiceOption } from "@/widgets/quote/ConnectionChoiceOption";
import { ArrowRight } from "lucide-react";
import { useSiteLanguage } from "@/shared/i18n/LanguageProvider";
import { buildConnectionPraise } from "@/shared/lib/connectionPraise";
import {
  ADJUSTMENT_DETAIL_KEYS,
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
  const { t, language } = useSiteLanguage();
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
    return buildConnectionPraise(rewardConnection, t, firstName, language);
  }, [rewardConnection, t, firstName, language]);

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
            hook={t("quoteConnectionHook")}
            eyebrow={t("quoteConnectionStep")}
            onComplete={handleIntroComplete}
          />
        }
      >
        <div className="connection-step relative flex min-h-0 flex-1 flex-col">
          <AnimatePresence>
            {showForm ? (
              <motion.header
                key="connection-form-header"
                initial={{ opacity: 0, y: 14, filter: "blur(6px)" }}
                animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
                transition={{ duration: 0.55, ease: [0.22, 1, 0.36, 1] }}
                className="connection-step__header"
              >
                <div className="connection-step__context">
                  <p className="connection-step__meta">
                    <span className="connection-step__meta-step">{t("quoteConnectionStep")}</span>
                    <span className="connection-step__meta-dot" aria-hidden>
                      ·
                    </span>
                    <span className="connection-step__meta-progress">{progressLabel}</span>
                  </p>
                  <h2 className="typo-section quote-step-title">
                    {t("quoteConnectionTitle")}{" "}
                    <span className="text-zinc-300">{t("quoteConnectionTitle2")}</span>
                  </h2>
                </div>

                <div
                  className="connection-step__progress"
                  role="progressbar"
                  aria-valuenow={step + 1}
                  aria-valuemin={1}
                  aria-valuemax={TOTAL_QUESTIONS}
                  aria-label={progressLabel}
                >
                  {Array.from({ length: TOTAL_QUESTIONS }).map((_, index) => (
                    <span
                      key={index}
                      className={[
                        "connection-step__progress-segment",
                        index <= step ? "connection-step__progress-segment--filled" : "",
                        index === step ? "connection-step__progress-segment--current" : "",
                      ].join(" ")}
                    />
                  ))}
                </div>

                {step === 0 ? (
                  <p className="connection-step__pace">{t("quoteConnectionPace")}</p>
                ) : null}
              </motion.header>
            ) : null}
          </AnimatePresence>

          <AnimatePresence>
            {showForm ? (
              <motion.div
                key="connection-form"
                initial={{ opacity: 0, y: 20, filter: "blur(8px)" }}
                animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
                transition={{ duration: 0.55, delay: 0.08, ease: [0.22, 1, 0.36, 1] }}
                className="connection-step__body flex flex-1 flex-col"
              >
                <section className="connection-step__panel">
                  <AnimatePresence mode="wait">
                    <motion.div
                      key={step}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -8 }}
                      transition={{ duration: 0.38, ease: [0.22, 1, 0.36, 1] }}
                    >
                  {step === 0 ? (
                    <fieldset className="connection-step__fieldset">
                      <legend className="connection-step__question">
                        {t("quoteConnectionReferralLabel")}
                      </legend>
                      <p className="connection-step__hint">{t("quoteConnectionSingleHint")}</p>
                      <div
                        className="connection-step__options connection-step__options--grid"
                        role="radiogroup"
                        aria-label={t("quoteConnectionReferralLabel")}
                      >
                        {REFERRAL_SOURCES.map((source) => (
                          <ConnectionChoiceOption
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
                        <label className="connection-step__field">
                          <span className="connection-step__field-label">
                            {t("quoteConnectionReferralOtherLabel")}
                          </span>
                          <input
                            type="text"
                            value={referralOther}
                            onChange={(event) => setReferralOther(event.target.value)}
                            maxLength={80}
                            autoFocus
                            placeholder={t("quoteConnectionReferralOtherPlaceholder")}
                            className="connection-step__input"
                          />
                        </label>
                      ) : null}
                    </fieldset>
                  ) : null}

                  {step === 1 ? (
                    <fieldset className="connection-step__fieldset">
                      <legend className="connection-step__question">
                        {t("quoteConnectionValuesLabel")}
                      </legend>
                      <p className="connection-step__hint">{t("quoteConnectionValuesHint")}</p>
                      <div className="connection-step__options connection-step__options--grid">
                        {PERSONAL_VALUES.map((value) => (
                          <ConnectionChoiceOption
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
                    <fieldset className="connection-step__fieldset">
                      <legend className="connection-step__question">
                        {t("quoteConnectionAdjustLabel")}
                      </legend>
                      <p className="connection-step__hint">{t("quoteConnectionAdjustHint")}</p>

                      <div
                        className="connection-step__options connection-step__options--stack connection-step__options--spectrum"
                        role="radiogroup"
                        aria-label={t("quoteConnectionAdjustLabel")}
                      >
                        {ADJUSTMENT_OPTIONS.map((option) => (
                          <ConnectionChoiceOption
                            key={option}
                            mode={CONNECTION_SELECTION_MODES.adjustments}
                            selected={adjustments.includes(option)}
                            label={t(ADJUSTMENT_LABEL_KEYS[option])}
                            detail={t(ADJUSTMENT_DETAIL_KEYS[option])}
                            onClick={() =>
                              setAdjustments((current) =>
                                pickOption(
                                  current,
                                  option,
                                  CONNECTION_SELECTION_MODES.adjustments,
                                ),
                              )
                            }
                          />
                        ))}
                      </div>
                    </fieldset>
                  ) : null}

                  {step === 3 ? (
                    <label className="connection-step__fieldset connection-step__fieldset--open">
                      <span className="connection-step__question">
                        {t("quoteConnectionOpenLabel")}
                      </span>
                      <p className="connection-step__hint">{t("quoteConnectionOpenHint")}</p>
                      <textarea
                        value={openNote}
                        onChange={(event) => setOpenNote(event.target.value)}
                        rows={4}
                        maxLength={200}
                        autoFocus
                        placeholder={t("quoteConnectionOpenPlaceholder")}
                        className="connection-step__textarea"
                      />
                    </label>
                  ) : null}

                  {error ? <p className="connection-step__error">{error}</p> : null}
                    </motion.div>
                  </AnimatePresence>
                </section>

                <div className="quote-step-footer connection-step__footer mt-auto pt-2">
                  <button
                    type="button"
                    onClick={goBack}
                    className="quote-step-footer-back connection-step__back rounded-xl border border-white/10 bg-white/5 px-5 py-3 text-sm font-semibold text-zinc-100 transition hover:bg-white/8 active:scale-[0.98]"
                  >
                    {t("commonBack")}
                  </button>
                  <button
                    type="button"
                    onClick={goNext}
                    className="quote-step-footer-next btn-accent focus-ring typo-cta group inline-flex items-center justify-center gap-2 rounded-lg px-6 py-3 active:scale-[0.98]"
                  >
                    {step === TOTAL_QUESTIONS - 1
                      ? t("quoteConnectionContinue")
                      : t("quoteConnectionNext")}
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
