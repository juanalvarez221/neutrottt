"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { QuoteShell } from "@/widgets/quote/QuoteShell";
import {
  QuoteConnectionIntro,
  QuoteConnectionIntroGate,
} from "@/widgets/quote/QuoteConnectionIntro";
import { QuoteConnectionReward } from "@/widgets/quote/QuoteConnectionReward";
import { ArrowRight, Check } from "lucide-react";
import { useSiteLanguage } from "@/shared/i18n/LanguageProvider";
import { buildConnectionPraise } from "@/shared/lib/connectionPraise";
import {
  ADJUSTMENT_LABEL_KEYS,
  ADJUSTMENT_OPTIONS,
  CONNECTION_SELECTION_MODES,
  getQuoteConnection,
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

const TOTAL_QUESTIONS = 4;
const HOOK_PAUSE_MS = 4600;

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
          ? "border-amber-500/40 bg-amber-500/10 text-amber-50"
          : "border-white/10 bg-black/30 text-zinc-200 hover:border-amber-500/25 hover:bg-amber-500/5",
      ].join(" ")}
    >
      <span>{label}</span>
      <span
        className={[
          "inline-flex h-5 w-5 shrink-0 items-center justify-center border transition",
          isSingle ? "rounded-full" : "rounded-md",
          selected
            ? isSingle
              ? "border-amber-400/60 bg-amber-500/20"
              : "border-amber-400/50 bg-amber-500/30"
            : "border-white/15 bg-black/40",
        ].join(" ")}
      >
        {selected ? (
          isSingle ? (
            <span className="h-2.5 w-2.5 rounded-full bg-amber-300 shadow-[0_0_8px_rgba(251,191,36,0.55)]" />
          ) : (
            <Check className="h-3 w-3 text-amber-100" strokeWidth={3} />
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
  const reduceMotion = useReducedMotion();
  const hookTimerRef = useRef<number | null>(null);
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
  const [rewardConnection, setRewardConnection] = useState<QuoteConnection | null>(null);

  const firstName = useMemo(() => getFirstName(), []);

  const rewardPraise = useMemo(() => {
    if (!rewardConnection) return null;
    return buildConnectionPraise(rewardConnection, t, firstName);
  }, [rewardConnection, t, firstName]);

  const revealQuestions = useCallback(() => {
    setShowForm(true);
  }, []);

  const handleIntroComplete = useCallback(() => {
    setShowIntro(false);
    if (reduceMotion) {
      revealQuestions();
      return;
    }
    hookTimerRef.current = window.setTimeout(revealQuestions, HOOK_PAUSE_MS);
  }, [reduceMotion, revealQuestions]);

  useEffect(() => {
    return () => {
      if (hookTimerRef.current !== null) {
        window.clearTimeout(hookTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (!getQuoteProfile()) {
      router.replace("/cotizacion");
      return;
    }
    const saved = getQuoteConnection();
    if (!saved) return;
    setShowIntro(false);
    setShowForm(true);
    setReferralSources(saved.referralSources);
    setReferralOther(saved.referralOther ?? "");
    setPersonalValues(saved.personalValues);
    setAdjustments(saved.adjustments);
    setOpenNote(saved.openNote);
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
    saveQuoteConnection(connection);
    setRewardConnection(connection);
    setShowReward(true);
    scrollStepToTop();
  };

  const handleRewardComplete = useCallback(() => {
    setShowReward(false);
    router.push("/cotizacion/tamano");
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

  return (
    <QuoteShell showGreeting={false}>
      <AnimatePresence>
        {showReward && rewardPraise ? (
          <QuoteConnectionReward
            key="connection-reward"
            title1={t("quoteConnectionRewardTitle1")}
            title2={t("quoteConnectionRewardTitle2")}
            tag={t("quoteConnectionRewardTag")}
            eyebrow={t("quoteConnectionRewardEyebrow")}
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
            eyebrow={t("quoteConnectionIntroEyebrow")}
            onComplete={handleIntroComplete}
          />
        }
      >
        <div className="relative flex min-h-[min(68dvh,560px)] flex-col">
          <motion.section
            className={[
              "relative mb-6",
              !showForm ? "flex flex-1 items-center justify-center pb-16" : "",
            ].join(" ")}
          >
            <div className="pointer-events-none absolute -left-10 -top-10 h-40 w-40 rounded-full bg-amber-600/15 blur-[60px]" />

            {!showForm || step === 0 ? (
              <motion.div
                className={[
                  "mx-auto max-w-xl",
                  showForm ? "" : "px-2 text-center",
                ].join(" ")}
                initial={{ opacity: 0, y: 20, filter: "blur(10px)" }}
                animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
                transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
              >
                {!showForm ? (
                  <motion.p
                    className="typo-tech mb-4 text-[0.62rem] uppercase tracking-[0.3em] text-amber-200/65"
                    initial={{ opacity: 0, letterSpacing: "0.45em" }}
                    animate={{ opacity: 1, letterSpacing: "0.3em" }}
                    transition={{ duration: 0.75, delay: 0.1, ease: [0.22, 1, 0.36, 1] }}
                  >
                    {t("quoteConnectionIntroEyebrow")}
                  </motion.p>
                ) : null}
                <motion.p
                  className={[
                    "leading-relaxed text-amber-50/95",
                    showForm
                      ? "typo-body max-w-lg text-sm"
                      : "font-[family-name:var(--font-stack-sans)] text-[clamp(1rem,3.8vw,1.22rem)] font-medium tracking-[0.01em]",
                  ].join(" ")}
                >
                  {t("quoteConnectionHook")}
                </motion.p>
              </motion.div>
            ) : null}

            <AnimatePresence>
              {showForm ? (
                <motion.div
                  key="connection-form-header"
                  initial={{ opacity: 0, y: 14, filter: "blur(6px)" }}
                  animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
                  transition={{ duration: 0.55, ease: [0.22, 1, 0.36, 1] }}
                >
                  {step === 0 ? (
                    <p className="typo-body mt-3 max-w-lg text-sm leading-relaxed text-zinc-400">
                      {t("quoteConnectionPace")}
                    </p>
                  ) : null}
                  <p
                    className={[
                      "typo-tech mb-2 uppercase tracking-[0.16em] text-amber-200/85",
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
                          index <= step ? "bg-amber-500/70" : "bg-white/10",
                        ].join(" ")}
                      />
                    ))}
                  </div>
                </motion.div>
              ) : null}
            </AnimatePresence>
          </motion.section>

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
                        <p className="text-xs text-zinc-400">{t("quoteConnectionMultiHint")}</p>
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
                        <p className="text-xs text-zinc-400">{t("quoteConnectionSingleHint")}</p>
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

                <div className="mt-auto flex items-center justify-between gap-3 pt-2">
                  <button
                    type="button"
                    onClick={goBack}
                    className="rounded-xl border border-white/10 bg-white/5 px-5 py-3 text-sm font-semibold text-zinc-100 transition hover:bg-white/8"
                  >
                    {t("commonBack")}
                  </button>
                  <button
                    type="button"
                    onClick={goNext}
                    className="group inline-flex items-center justify-center gap-2 rounded-lg border border-amber-500/35 bg-gradient-to-r from-amber-700 to-orange-600 px-6 py-3 text-sm font-bold uppercase tracking-[0.16em] text-white transition hover:-translate-y-0.5 hover:shadow-[0_0_20px_rgba(245,158,11,0.35)]"
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
