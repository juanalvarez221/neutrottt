"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { QuoteShell } from "@/widgets/quote/QuoteShell";
import {
  QuotePanel,
  QuotePrimaryCta,
  QuoteStepHeader,
} from "@/widgets/quote/QuoteStepChrome";
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
      <QuoteStepHeader
        eyebrow={t("quoteContactStep")}
        title={t("quoteContactTitle")}
        titleAccent={t("quoteContactTitle2")}
        body={t("quoteContactBody")}
      />

      <QuotePanel label={t("quoteContactCard")} className="mb-8">
        <div className="grid gap-4">
          <label className="space-y-2">
            <span className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.14em] text-[rgba(var(--rgb-sand),0.72)]">
              <UserRound className="h-4 w-4 text-[rgba(var(--rgb-honey),0.75)]" strokeWidth={1.5} />
              {language === "en" ? "Full name" : "Nombre completo"}
            </span>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={language === "en" ? "Ex: Mateo Rivas" : "Ej: Mateo Pérez"}
              className="w-full rounded-xl border border-[rgba(var(--rgb-sand),0.14)] bg-black/40 px-4 py-3 text-sm text-[rgba(var(--rgb-ivory),0.95)] outline-none transition placeholder:text-zinc-500 focus:border-[rgba(var(--rgb-honey),0.45)]"
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
                  <Phone className="h-4 w-4 text-[rgba(var(--rgb-honey),0.75)]" strokeWidth={1.5} />
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
            <span className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.14em] text-[rgba(var(--rgb-sand),0.72)]">
              <Mail className="h-4 w-4 text-[rgba(var(--rgb-honey),0.75)]" strokeWidth={1.5} />
              {language === "en" ? "Email" : "Correo"}
            </span>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder={language === "en" ? "Ex: mail@example.com" : "Ej: correo@ejemplo.com"}
              className="w-full rounded-xl border border-[rgba(var(--rgb-sand),0.14)] bg-black/40 px-4 py-3 text-sm text-[rgba(var(--rgb-ivory),0.95)] outline-none transition placeholder:text-zinc-500 focus:border-[rgba(var(--rgb-honey),0.45)]"
            />
          </label>
        </div>

        {error ? (
          <p className="mt-3 text-sm font-semibold text-[rgba(var(--rgb-honey),0.9)]">{error}</p>
        ) : null}
      </QuotePanel>

      <div className="mt-auto pt-2">
        <QuotePrimaryCta onClick={onNext}>
          {t("quoteContinue")}
          <ArrowRight className="h-5 w-5 transition-transform group-hover:translate-x-1" />
        </QuotePrimaryCta>
      </div>
    </QuoteShell>
  );
}
