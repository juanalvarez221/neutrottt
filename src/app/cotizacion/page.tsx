"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { QuoteShell } from "@/widgets/quote/QuoteShell";
import { ArrowRight, UserRound, Mail, Phone } from "lucide-react";
import { getQuoteProfile, saveQuoteProfile } from "@/shared/lib/quoteProfile";
import {
  QUOTE_FLOW_PATHS,
  resolveQuoteEntryPath,
  startNewQuoteSession,
} from "@/shared/lib/quoteFlow";
import { useSiteLanguage } from "@/shared/i18n/LanguageProvider";
import { PhoneCountryField } from "@/widgets/quote/PhoneCountryField";
import { matchPhoneCountryFromRaw } from "@/shared/config/phoneCountries";

export default function CotizacionPage() {
  const router = useRouter();
  const { language, t } = useSiteLanguage();
  const [name, setName] = useState("");
  const [countryCode, setCountryCode] = useState("+57");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [error, setError] = useState("");
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const entry = resolveQuoteEntryPath();
    if (entry !== QUOTE_FLOW_PATHS.profile) {
      if (entry === QUOTE_FLOW_PATHS.quoteStart) {
        startNewQuoteSession();
      }
      router.replace(entry);
      return;
    }

    const frame = window.requestAnimationFrame(() => {
      const profile = getQuoteProfile();
      if (!profile) {
        setReady(true);
        return;
      }
      setName(profile.name);
      const rawPhone = profile.phone.trim();
      const matchedCountry = matchPhoneCountryFromRaw(rawPhone);
      if (matchedCountry) {
        setCountryCode(matchedCountry.dial);
        setPhone(rawPhone.replace(matchedCountry.dial, "").replace(/^[\s-]+/, "").trim());
      } else {
        setPhone(rawPhone);
      }
      setEmail(profile.email);
      setReady(true);
    });
    return () => window.cancelAnimationFrame(frame);
  }, [router]);

  const onNext = () => {
    const cleanName = name.trim();
    const cleanPhone = phone.trim();
    const cleanEmail = email.trim();
    if (!cleanName || !cleanPhone || !cleanEmail) {
      setError(
        language === "en"
          ? "Complete name, phone, and email."
          : "Completa nombre, celular y correo.",
      );
      return;
    }
    const fullPhone = `${countryCode} ${cleanPhone}`.replace(/\s+/g, " ").trim();
    saveQuoteProfile({ name: cleanName, phone: fullPhone, email: cleanEmail });
    router.push(QUOTE_FLOW_PATHS.connection);
  };

  if (!ready) {
    return (
      <QuoteShell showGreeting={false}>
        <div className="flex min-h-[40dvh] items-center justify-center">
          <p className="typo-tech text-sm uppercase tracking-[0.18em] text-stone-400">
            {language === "en" ? "Loading…" : "Cargando…"}
          </p>
        </div>
      </QuoteShell>
    );
  }

  return (
    <QuoteShell>
      <section className="relative mb-8">
        <div className="pointer-events-none absolute -left-10 -top-10 h-40 w-40 rounded-full bg-amber-600/15 blur-[60px]" />
        <p className="typo-tech mb-2 uppercase tracking-[0.16em] text-amber-200/85">
          {t("quoteContactStep")}
        </p>
        <h2 className="typo-section quote-step-title">
          {t("quoteContactTitle")}
          <br />
          <span className="bg-gradient-to-r from-white to-zinc-400 bg-clip-text text-transparent">
            {t("quoteContactTitle2")}
          </span>
        </h2>
        <p className="typo-body mt-4 max-w-2xl leading-relaxed">
          {t("quoteContactBody")}
        </p>
      </section>

      <section className="mb-8">
        <div className="glass-card rounded-2xl p-5">
          <div className="mb-4 flex items-center gap-3">
            <div className="flex h-6 w-6 items-center justify-center rounded-full border border-amber-500/30 bg-amber-600/10">
              <span className="text-[10px] font-bold text-white">1</span>
            </div>
            <h3 className="typo-subtitle text-sm uppercase tracking-[0.14em] text-zinc-200">
              {t("quoteContactCard")}
            </h3>
          </div>

          <div className="grid gap-4">
            <label className="space-y-2">
              <span className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.14em] text-zinc-300">
                <UserRound className="h-4 w-4 text-amber-300" />
                {language === "en" ? "Full name" : "Nombre completo"}
              </span>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder={language === "en" ? "Ex: Mateo Rivas" : "Ej: Mateo Pérez"}
                className="w-full rounded-xl border border-white/10 bg-black/35 px-4 py-3 text-sm text-zinc-100 outline-none transition placeholder:text-zinc-500 focus:border-amber-500/50"
              />
            </label>

            <div>
              <PhoneCountryField
                dial={countryCode}
                localNumber={phone}
                onDialChange={setCountryCode}
                onLocalNumberChange={setPhone}
                language={language}
                label={
                  <>
                    <Phone className="h-4 w-4 text-amber-300" />
                    {language === "en" ? "Phone" : "Celular"}
                  </>
                }
                numberLabel={language === "en" ? "Phone number" : "Número"}
                numberPlaceholder={
                  language === "en" ? "Ex: 555 000 1234" : "Ej: 300 123 4567"
                }
                helperText={
                  language === "en"
                    ? "Choose your country flag and enter your WhatsApp number."
                    : "Elige la bandera de tu país e ingresa tu número de WhatsApp."
                }
              />
            </div>

            <label className="space-y-2">
              <span className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.14em] text-zinc-300">
                <Mail className="h-4 w-4 text-amber-300" />
                {language === "en" ? "Email" : "Correo"}
              </span>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder={language === "en" ? "Ex: mail@example.com" : "Ej: correo@ejemplo.com"}
                className="w-full rounded-xl border border-white/10 bg-black/35 px-4 py-3 text-sm text-zinc-100 outline-none transition placeholder:text-zinc-500 focus:border-amber-500/50"
              />
            </label>
          </div>

          {error ? (
            <p className="mt-3 text-sm font-semibold text-amber-200">{error}</p>
          ) : null}
        </div>
      </section>

      <div className="mt-auto pt-6">
        <div className="pointer-events-none absolute left-1/2 -translate-x-1/2 translate-y-10 h-32 w-3/4 bg-amber-600/20 blur-[80px]" />
        <button
          type="button"
          onClick={onNext}
          className="btn-accent focus-ring typo-cta group inline-flex w-full items-center justify-center gap-2 rounded-lg py-5 active:scale-[0.98]"
        >
          {t("quoteContinue")}
          <ArrowRight className="h-5 w-5 transition-transform group-hover:translate-x-1" />
        </button>
      </div>
    </QuoteShell>
  );
}
