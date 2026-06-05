"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { QuoteShell } from "@/widgets/quote/QuoteShell";
import { ArrowRight, UserRound, Mail, Phone } from "lucide-react";
import { getQuoteProfile, saveQuoteProfile } from "@/shared/lib/quoteProfile";
import { useSiteLanguage } from "@/shared/i18n/LanguageProvider";

const COUNTRY_OPTIONS = [
  { code: "+57", es: "Colombia", en: "Colombia" },
  { code: "+1", es: "Estados Unidos / Canada", en: "United States / Canada" },
  { code: "+52", es: "Mexico", en: "Mexico" },
  { code: "+34", es: "Espana", en: "Spain" },
  { code: "+54", es: "Argentina", en: "Argentina" },
  { code: "+56", es: "Chile", en: "Chile" },
  { code: "+51", es: "Peru", en: "Peru" },
  { code: "+593", es: "Ecuador", en: "Ecuador" },
] as const;

export default function CotizacionPage() {
  const router = useRouter();
  const { language, t } = useSiteLanguage();
  const [name, setName] = useState("");
  const [countryCode, setCountryCode] = useState<(typeof COUNTRY_OPTIONS)[number]["code"]>("+57");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      const profile = getQuoteProfile();
      if (!profile) return;
      setName(profile.name);
      const rawPhone = profile.phone.trim();
      const matchedCountry = COUNTRY_OPTIONS.find((option) => rawPhone.startsWith(option.code));
      if (matchedCountry) {
        setCountryCode(matchedCountry.code);
        setPhone(rawPhone.replace(matchedCountry.code, "").replace(/^[\s-]+/, "").trim());
      } else {
        setPhone(rawPhone);
      }
      setEmail(profile.email);
    });
    return () => window.cancelAnimationFrame(frame);
  }, []);

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
    router.push("/cotizacion/conexion");
  };

  return (
    <QuoteShell>
      <section className="relative mb-8">
        <div className="pointer-events-none absolute -left-10 -top-10 h-40 w-40 rounded-full bg-amber-600/15 blur-[60px]" />
        <p className="typo-tech mb-2 uppercase tracking-[0.16em] text-amber-200/85">
          {t("quoteContactStep")}
        </p>
        <h2 className="typo-section text-[2.2rem] leading-[1.05] md:text-[3.2rem]">
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
                placeholder={language === "en" ? "Ex: John Doe" : "Ej: Mateo Pérez"}
                className="w-full rounded-xl border border-white/10 bg-black/35 px-4 py-3 text-sm text-zinc-100 outline-none transition placeholder:text-zinc-500 focus:border-amber-500/50"
              />
            </label>

            <label className="space-y-2">
              <span className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.14em] text-zinc-300">
                <Phone className="h-4 w-4 text-amber-300" />
                {language === "en" ? "Phone" : "Celular"}
              </span>
              <div className="grid grid-cols-[142px_1fr] gap-2">
                <label className="sr-only" htmlFor="quote-country-code">
                  {language === "en" ? "Country code" : "Indicativo"}
                </label>
                <select
                  id="quote-country-code"
                  value={countryCode}
                  onChange={(e) =>
                    setCountryCode(e.target.value as (typeof COUNTRY_OPTIONS)[number]["code"])
                  }
                  className="w-full rounded-xl border border-white/10 bg-black/35 px-3 py-3 text-sm text-zinc-100 outline-none transition focus:border-amber-500/50"
                >
                  {COUNTRY_OPTIONS.map((option) => (
                    <option key={option.code} value={option.code}>
                      {option.code} · {language === "en" ? option.en : option.es}
                    </option>
                  ))}
                </select>

                <label className="sr-only" htmlFor="quote-phone-local">
                  {language === "en" ? "Phone number" : "Numero"}
                </label>
                <input
                  id="quote-phone-local"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder={language === "en" ? "Ex: 555 000 1234" : "Ej: 300 123 4567"}
                  className="w-full rounded-xl border border-white/10 bg-black/35 px-4 py-3 text-sm text-zinc-100 outline-none transition placeholder:text-zinc-500 focus:border-amber-500/50"
                />
              </div>
              <p className="text-xs text-zinc-400">
                {language === "en"
                  ? "Select your country code and enter your WhatsApp number."
                  : "Selecciona tu indicativo e ingresa tu numero de WhatsApp."}
              </p>
            </label>

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
          className="typo-cta group inline-flex w-full items-center justify-center gap-2 rounded-lg border border-amber-500/35 bg-gradient-to-r from-amber-700 to-orange-600 py-5 text-white transition hover:-translate-y-0.5 hover:shadow-[0_0_20px_rgba(245,158,11,0.35)] active:translate-y-0"
        >
          {t("quoteContinue")}
          <ArrowRight className="h-5 w-5 transition-transform group-hover:translate-x-1" />
        </button>
      </div>
    </QuoteShell>
  );
}

