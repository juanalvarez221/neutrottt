export type PhoneCountryOption = {
  dial: string;
  iso: string;
  es: string;
  en: string;
};

/** Orden de UI (Colombia primero, luego alfabético ES). */
export const PHONE_COUNTRY_OPTIONS: readonly PhoneCountryOption[] = [
  { dial: "+57", iso: "co", es: "Colombia", en: "Colombia" },
  { dial: "+54", iso: "ar", es: "Argentina", en: "Argentina" },
  { dial: "+56", iso: "cl", es: "Chile", en: "Chile" },
  { dial: "+593", iso: "ec", es: "Ecuador", en: "Ecuador" },
  { dial: "+1", iso: "us", es: "EE. UU. / Canadá", en: "United States / Canada" },
  { dial: "+34", iso: "es", es: "España", en: "Spain" },
  { dial: "+52", iso: "mx", es: "México", en: "Mexico" },
  { dial: "+51", iso: "pe", es: "Perú", en: "Peru" },
] as const;

/** Match por longitud de dial (desc) para evitar falsos positivos. */
const PHONE_COUNTRY_MATCH_ORDER = [...PHONE_COUNTRY_OPTIONS].sort(
  (a, b) => b.dial.length - a.dial.length,
);

export function flagUrl(iso: string, width = 40) {
  return `https://flagcdn.com/w${width}/${iso.toLowerCase()}.png`;
}

export function findPhoneCountryByDial(dial: string) {
  return PHONE_COUNTRY_OPTIONS.find((option) => option.dial === dial) ?? null;
}

export function matchPhoneCountryFromRaw(rawPhone: string) {
  const normalized = rawPhone.trim();
  return (
    PHONE_COUNTRY_MATCH_ORDER.find((option) => normalized.startsWith(option.dial)) ?? null
  );
}
