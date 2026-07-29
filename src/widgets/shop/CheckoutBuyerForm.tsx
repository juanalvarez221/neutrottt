"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { Check, ChevronDown, Search } from "lucide-react";
import {
  CHECKOUT_COUNTRIES,
  COLOMBIA_DEPARTMENTS,
  flagUrl,
  getCitiesForDepartment,
} from "@/shared/config/checkoutGeo";
import {
  PHONE_COUNTRY_OPTIONS,
  findPhoneCountryByDial,
  type PhoneCountryOption,
} from "@/shared/config/phoneCountries";
import { useSiteLanguage } from "@/shared/i18n/LanguageProvider";

export type CheckoutBuyerValues = {
  email: string;
  name: string;
  docType: string;
  docNumber: string;
  phoneDial: string;
  phoneLocal: string;
  countryIso: string;
  department: string;
  city: string;
  address: string;
  deliveryNotes: string;
};

type CheckoutBuyerFormProps = {
  values: CheckoutBuyerValues;
  onChange: (patch: Partial<CheckoutBuyerValues>) => void;
  /** digital = solo correo; physical/mixed = entrega (y correo si hay digital). */
  profile: "digital" | "physical" | "mixed";
};

const inputClass =
  "min-h-11 w-full rounded-xl border border-[rgba(var(--rgb-sand),0.16)] bg-[#0c0a08] px-3.5 text-[0.95rem] text-[rgba(var(--rgb-ivory),0.94)] outline-none transition placeholder:text-[rgba(var(--rgb-ivory),0.28)] focus:border-[rgba(var(--rgb-sand),0.45)]";

function FieldShell({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="grid gap-2">
      <span className="text-sm font-medium text-[rgba(var(--rgb-ivory),0.88)]">{label}</span>
      {children}
      {hint ? (
        <span className="text-xs leading-relaxed text-[rgba(var(--rgb-ivory),0.38)]">{hint}</span>
      ) : null}
    </div>
  );
}

function FlagImg({ iso, label }: { iso: string; label: string }) {
  return (
    <span className="inline-flex h-4 w-[22px] shrink-0 overflow-hidden rounded-[2px] shadow-[0_0_0_1px_rgba(255,255,255,0.12)]">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={flagUrl(iso, 40)}
        srcSet={`${flagUrl(iso, 40)} 1x, ${flagUrl(iso, 80)} 2x`}
        alt=""
        width={22}
        height={16}
        loading="lazy"
        decoding="async"
        className="h-full w-full object-cover"
      />
      <span className="sr-only">{label}</span>
    </span>
  );
}

function FlagSelect({
  valueIso,
  onChange,
  options,
  language,
  label,
  ariaLabel,
}: {
  valueIso: string;
  onChange: (iso: string, dial: string) => void;
  options: readonly PhoneCountryOption[];
  language: "es" | "en";
  label: string;
  ariaLabel: string;
}) {
  const reduceMotion = useReducedMotion();
  const listId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const selected =
    options.find((o) => o.iso === valueIso) ?? options[0] ?? CHECKOUT_COUNTRIES[0];

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return options;
    return options.filter((o) => {
      const name = (language === "en" ? o.en : o.es).toLowerCase();
      return name.includes(q) || o.dial.includes(q) || o.iso.includes(q);
    });
  }, [options, query, language]);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    window.addEventListener("mousedown", onPointerDown);
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("mousedown", onPointerDown);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  const countryName = (o: PhoneCountryOption) => (language === "en" ? o.en : o.es);

  return (
    <FieldShell label={label}>
      <div ref={rootRef} className="relative">
        <button
          type="button"
          aria-haspopup="listbox"
          aria-expanded={open}
          aria-controls={listId}
          aria-label={ariaLabel}
          onClick={() => setOpen((v) => !v)}
          className="flex min-h-11 w-full items-center gap-2.5 rounded-xl border border-[rgba(var(--rgb-sand),0.16)] bg-[#0c0a08] px-3.5 text-left transition hover:border-[rgba(var(--rgb-sand),0.32)] focus:border-[rgba(var(--rgb-sand),0.45)] focus:outline-none"
        >
          <FlagImg iso={selected.iso} label={countryName(selected)} />
          <span className="flex-1 truncate text-[0.95rem] text-[rgba(var(--rgb-ivory),0.92)]">
            {countryName(selected)}
          </span>
          <ChevronDown
            className={`h-4 w-4 shrink-0 text-[rgba(var(--rgb-sand),0.7)] transition ${open ? "rotate-180" : ""}`}
            strokeWidth={2}
          />
        </button>

        <AnimatePresence>
          {open ? (
            <motion.div
              initial={reduceMotion ? false : { opacity: 0, y: -6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={reduceMotion ? undefined : { opacity: 0, y: -4 }}
              transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
              className="absolute left-0 right-0 z-30 mt-2 overflow-hidden rounded-xl border border-[rgba(var(--rgb-sand),0.2)] bg-[#161012] shadow-[0_18px_40px_-18px_rgba(0,0,0,0.85)]"
            >
              <div className="flex items-center gap-2 border-b border-[rgba(var(--rgb-sand),0.12)] px-3 py-2.5">
                <Search className="h-3.5 w-3.5 text-[rgba(var(--rgb-sand),0.5)]" strokeWidth={2} />
                <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder={language === "en" ? "Search country…" : "Buscar país…"}
                  className="w-full bg-transparent text-sm text-[rgba(var(--rgb-ivory),0.9)] outline-none placeholder:text-[rgba(var(--rgb-ivory),0.3)]"
                  autoFocus
                />
              </div>
              <ul id={listId} role="listbox" className="max-h-56 overflow-y-auto py-1">
                {filtered.map((option) => {
                  const active = option.iso === selected.iso;
                  return (
                    <li key={`${option.iso}-${option.dial}`} role="none">
                      <button
                        type="button"
                        role="option"
                        aria-selected={active}
                        className={`flex w-full items-center gap-2.5 px-3 py-2.5 text-left transition hover:bg-[rgba(255,255,255,0.04)] ${
                          active ? "bg-[rgba(var(--rgb-terracotta),0.12)]" : ""
                        }`}
                        onClick={() => {
                          onChange(option.iso, option.dial);
                          setOpen(false);
                          setQuery("");
                        }}
                      >
                        <FlagImg iso={option.iso} label={countryName(option)} />
                        <span className="flex-1 truncate text-sm text-[rgba(var(--rgb-ivory),0.9)]">
                          {countryName(option)}
                        </span>
                        {active ? (
                          <Check className="h-3.5 w-3.5 text-[rgba(var(--rgb-sand),0.85)]" strokeWidth={2} />
                        ) : null}
                      </button>
                    </li>
                  );
                })}
                {filtered.length === 0 ? (
                  <li className="px-3 py-3 text-sm text-[rgba(var(--rgb-ivory),0.4)]">
                    {language === "en" ? "No matches" : "Sin resultados"}
                  </li>
                ) : null}
              </ul>
            </motion.div>
          ) : null}
        </AnimatePresence>
      </div>
    </FieldShell>
  );
}

function PhoneDialSelect({
  dial,
  onChange,
  language,
}: {
  dial: string;
  onChange: (dial: string) => void;
  language: "es" | "en";
}) {
  const reduceMotion = useReducedMotion();
  const listId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const selected = findPhoneCountryByDial(dial) ?? PHONE_COUNTRY_OPTIONS[0];

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    window.addEventListener("mousedown", onPointerDown);
    return () => window.removeEventListener("mousedown", onPointerDown);
  }, [open]);

  const name = (o: PhoneCountryOption) => (language === "en" ? o.en : o.es);

  return (
    <div ref={rootRef} className="relative shrink-0">
      <button
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listId}
        aria-label={language === "en" ? "Country code" : "Indicativo"}
        onClick={() => setOpen((v) => !v)}
        className="flex h-11 items-center gap-2 border-r border-[rgba(var(--rgb-sand),0.14)] bg-[rgba(255,255,255,0.03)] px-3 transition hover:bg-[rgba(255,255,255,0.05)]"
      >
        <FlagImg iso={selected.iso} label={name(selected)} />
        <span className="font-mono text-xs text-[rgba(var(--rgb-sand),0.9)]">{selected.dial}</span>
        <ChevronDown className={`h-3.5 w-3.5 text-[rgba(var(--rgb-sand),0.55)] ${open ? "rotate-180" : ""}`} />
      </button>
      <AnimatePresence>
        {open ? (
          <motion.ul
            id={listId}
            role="listbox"
            initial={reduceMotion ? false : { opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={reduceMotion ? undefined : { opacity: 0, y: -3 }}
            className="absolute left-0 z-30 mt-2 max-h-56 w-[16rem] overflow-y-auto rounded-xl border border-[rgba(var(--rgb-sand),0.2)] bg-[#161012] py-1 shadow-[0_18px_40px_-18px_rgba(0,0,0,0.85)]"
          >
            {PHONE_COUNTRY_OPTIONS.map((option) => {
              const active = option.dial === selected.dial;
              return (
                <li key={option.dial}>
                  <button
                    type="button"
                    role="option"
                    aria-selected={active}
                    className={`flex w-full items-center gap-2 px-3 py-2.5 text-left hover:bg-[rgba(255,255,255,0.04)] ${
                      active ? "bg-[rgba(var(--rgb-terracotta),0.12)]" : ""
                    }`}
                    onClick={() => {
                      onChange(option.dial);
                      setOpen(false);
                    }}
                  >
                    <FlagImg iso={option.iso} label={name(option)} />
                    <span className="flex-1 truncate text-sm">{name(option)}</span>
                    <span className="font-mono text-[0.65rem] text-[rgba(var(--rgb-sand),0.65)]">
                      {option.dial}
                    </span>
                  </button>
                </li>
              );
            })}
          </motion.ul>
        ) : null}
      </AnimatePresence>
    </div>
  );
}

export function CheckoutBuyerForm({
  values,
  onChange,
  profile,
}: CheckoutBuyerFormProps) {
  const { t, language } = useSiteLanguage();
  const needsShipping = profile === "physical" || profile === "mixed";
  const digitalOnly = profile === "digital";
  const isColombia = values.countryIso === "co";
  const cities = useMemo(
    () => (values.department ? getCitiesForDepartment(values.department) : []),
    [values.department],
  );

  if (digitalOnly) {
    return (
      <div className="grid gap-6">
        <section className="grid gap-5">
          <p className="font-mono text-[0.58rem] uppercase tracking-[0.16em] text-[rgba(var(--rgb-sand),0.45)]">
            {t("shopDigitalDeliveryTag")}
          </p>
          <FieldShell label={t("shopFieldEmail")} hint={t("shopFieldEmailDigitalHint")}>
            <input
              name="email"
              type="email"
              autoComplete="email"
              required
              value={values.email}
              onChange={(e) => onChange({ email: e.target.value })}
              placeholder="nombre@correo.com"
              className={inputClass}
            />
          </FieldShell>
        </section>
      </div>
    );
  }

  return (
    <div className="grid gap-6">
      <section className="grid gap-5">
        <p className="font-mono text-[0.58rem] uppercase tracking-[0.16em] text-[rgba(var(--rgb-sand),0.45)]">
          {t("shopBuyerTag")}
        </p>

        <FieldShell label={t("shopFieldName")} hint={t("shopFieldNameHint")}>
          <input
            name="name"
            autoComplete="name"
            required
            value={values.name}
            onChange={(e) => onChange({ name: e.target.value })}
            placeholder={t("shopFieldNameHint")}
            className={inputClass}
          />
        </FieldShell>

        <div className="grid grid-cols-1 gap-5 sm:grid-cols-[0.95fr_1.05fr]">
          <FieldShell label={t("shopFieldDocType")}>
            <select
              name="docType"
              required
              value={values.docType}
              onChange={(e) => onChange({ docType: e.target.value })}
              className={inputClass}
            >
              <option value="cc">{t("shopFieldDocTypeCc")}</option>
              <option value="ce">{t("shopFieldDocTypeCe")}</option>
              <option value="passport">{t("shopFieldDocTypePassport")}</option>
            </select>
          </FieldShell>
          <FieldShell label={t("shopFieldDocNumber")} hint={t("shopFieldDocNumberHint")}>
            <input
              name="docNumber"
              inputMode="numeric"
              required
              value={values.docNumber}
              onChange={(e) => onChange({ docNumber: e.target.value })}
              placeholder="1234567890"
              className={inputClass}
            />
          </FieldShell>
        </div>

        <FieldShell
          label={t("shopFieldEmail")}
          hint={
            profile === "mixed" ? t("shopFieldEmailMixedHint") : t("shopFieldEmailHint")
          }
        >
          <input
            name="email"
            type="email"
            autoComplete="email"
            required
            value={values.email}
            onChange={(e) => onChange({ email: e.target.value })}
            placeholder="nombre@correo.com"
            className={inputClass}
          />
        </FieldShell>

        <FieldShell label={t("shopFieldPhone")} hint={t("shopFieldPhoneHint")}>
          <div className="flex min-h-11 overflow-hidden rounded-xl border border-[rgba(var(--rgb-sand),0.16)] bg-[#0c0a08] focus-within:border-[rgba(var(--rgb-sand),0.45)]">
            <PhoneDialSelect
              dial={values.phoneDial}
              onChange={(dial) => onChange({ phoneDial: dial })}
              language={language}
            />
            <input
              name="phone"
              type="tel"
              inputMode="tel"
              autoComplete="tel-national"
              required
              value={values.phoneLocal}
              onChange={(e) => onChange({ phoneLocal: e.target.value })}
              placeholder="300 123 4567"
              className="min-h-11 w-full bg-transparent px-3.5 text-[rgba(var(--rgb-ivory),0.94)] outline-none placeholder:text-[rgba(var(--rgb-ivory),0.28)]"
            />
          </div>
        </FieldShell>
      </section>

      <section className="rounded-2xl border border-[rgba(var(--rgb-sand),0.12)] bg-[rgba(255,255,255,0.02)] p-4 sm:p-5">
        <p className="font-mono text-[0.58rem] uppercase tracking-[0.16em] text-[rgba(var(--rgb-sand),0.45)]">
          {t("shopLocationTag")}
        </p>
        <div className="mt-4 grid gap-5">
          <FlagSelect
            valueIso={values.countryIso}
            options={CHECKOUT_COUNTRIES}
            language={language}
            label={t("shopFieldCountry")}
            ariaLabel={t("shopFieldCountry")}
            onChange={(iso, dial) =>
              onChange({
                countryIso: iso,
                phoneDial: dial,
                department: "",
                city: "",
              })
            }
          />

          <AnimatePresence mode="wait" initial={false}>
            {isColombia ? (
              <motion.div
                key="co-geo"
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -4 }}
                transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
                className="grid grid-cols-1 gap-5 sm:grid-cols-2"
              >
                <FieldShell label={t("shopFieldDepartment")} hint={t("shopFieldDepartmentHint")}>
                  <select
                    name="department"
                    required
                    value={values.department}
                    onChange={(e) => onChange({ department: e.target.value, city: "" })}
                    className={inputClass}
                  >
                    <option value="">{t("shopFieldDepartmentPlaceholder")}</option>
                    {COLOMBIA_DEPARTMENTS.map((dep) => (
                      <option key={dep.id} value={dep.departamento}>
                        {dep.departamento}
                      </option>
                    ))}
                  </select>
                </FieldShell>

                <FieldShell label={t("shopFieldCity")} hint={t("shopFieldCityHint")}>
                  <select
                    name="city"
                    required
                    disabled={!values.department}
                    value={values.city}
                    onChange={(e) => onChange({ city: e.target.value })}
                    className={`${inputClass} disabled:cursor-not-allowed disabled:opacity-45`}
                  >
                    <option value="">
                      {values.department
                        ? t("shopFieldCityPlaceholder")
                        : t("shopFieldCityNeedDepartment")}
                    </option>
                    {cities.map((city) => (
                      <option key={city} value={city}>
                        {city}
                      </option>
                    ))}
                  </select>
                </FieldShell>
              </motion.div>
            ) : (
              <motion.div
                key="intl-geo"
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -4 }}
                transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
              >
                <FieldShell label={t("shopFieldCity")} hint={t("shopFieldCityIntlHint")}>
                  <input
                    name="city"
                    required
                    value={values.city}
                    onChange={(e) => onChange({ city: e.target.value })}
                    placeholder={t("shopFieldCityIntlPlaceholder")}
                    className={inputClass}
                    autoComplete="address-level2"
                  />
                </FieldShell>
                <input type="hidden" name="department" value="" />
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </section>

      <AnimatePresence initial={false}>
        {needsShipping ? (
          <motion.section
            key="shipping"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
            className="grid gap-5 rounded-2xl border border-[rgba(var(--rgb-sand),0.16)] bg-[rgba(18,12,14,0.55)] p-4 sm:p-5"
          >
            <div>
              <p className="font-mono text-[0.58rem] uppercase tracking-[0.16em] text-[rgba(var(--rgb-terracotta),0.85)]">
                {t("shopShippingTag")}
              </p>
              <p className="mt-1 text-xs text-[rgba(var(--rgb-ivory),0.42)]">
                {t("shopShippingLead")}
              </p>
            </div>

            <FieldShell label={t("shopFieldAddress")} hint={t("shopFieldAddressHint")}>
              <input
                name="address"
                autoComplete="street-address"
                required={needsShipping}
                value={values.address}
                onChange={(e) => onChange({ address: e.target.value })}
                placeholder={t("shopFieldAddressPlaceholder")}
                className={inputClass}
              />
            </FieldShell>

            <FieldShell
              label={t("shopFieldDeliveryNotes")}
              hint={t("shopFieldDeliveryNotesHint")}
            >
              <textarea
                name="deliveryNotes"
                rows={3}
                value={values.deliveryNotes}
                onChange={(e) => onChange({ deliveryNotes: e.target.value })}
                placeholder={t("shopFieldDeliveryNotesPlaceholder")}
                className={`${inputClass} resize-y py-3`}
              />
            </FieldShell>
          </motion.section>
        ) : null}
      </AnimatePresence>

      <input type="hidden" name="countryIso" value={values.countryIso} />
      <input type="hidden" name="phoneDial" value={values.phoneDial} />
    </div>
  );
}
