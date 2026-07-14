"use client";

import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { Check, ChevronDown } from "lucide-react";
import {
  PHONE_COUNTRY_OPTIONS,
  flagUrl,
  findPhoneCountryByDial,
  type PhoneCountryOption,
} from "@/shared/config/phoneCountries";

type PhoneCountryFieldProps = {
  dial: string;
  localNumber: string;
  onDialChange: (dial: string) => void;
  onLocalNumberChange: (value: string) => void;
  language: "es" | "en";
  label: ReactNode;
  numberLabel: string;
  numberPlaceholder: string;
  helperText: string;
};

function CountryFlag({ iso, label }: { iso: string; label: string }) {
  return (
    <span className="phone-country-flag" aria-hidden>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={flagUrl(iso, 40)}
        srcSet={`${flagUrl(iso, 40)} 1x, ${flagUrl(iso, 80)} 2x`}
        alt=""
        width={22}
        height={16}
        loading="lazy"
        decoding="async"
        className="phone-country-flag__img"
      />
      <span className="sr-only">{label}</span>
    </span>
  );
}

export function PhoneCountryField({
  dial,
  localNumber,
  onDialChange,
  onLocalNumberChange,
  language,
  label,
  numberLabel,
  numberPlaceholder,
  helperText,
}: PhoneCountryFieldProps) {
  const reduceMotion = useReducedMotion();
  const listId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const selected = findPhoneCountryByDial(dial) ?? PHONE_COUNTRY_OPTIONS[0];

  useEffect(() => {
    if (!open) return;

    const onPointerDown = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
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

  const countryName = (option: PhoneCountryOption) =>
    language === "en" ? option.en : option.es;

  return (
    <div className="phone-country-field space-y-2">
      <span className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.14em] text-zinc-300">
        {label}
      </span>

      <div ref={rootRef} className="phone-country-field__row">
        <div className="phone-country-field__dial">
          <button
            type="button"
            className={[
              "phone-country-field__trigger focus-ring",
              open ? "phone-country-field__trigger--open" : "",
            ].join(" ")}
            aria-haspopup="listbox"
            aria-expanded={open}
            aria-controls={listId}
            aria-label={language === "en" ? "Country code" : "Indicativo del país"}
            onClick={() => setOpen((current) => !current)}
          >
            <AnimatePresence mode="wait" initial={false}>
              <motion.span
                key={selected.iso}
                initial={reduceMotion ? false : { opacity: 0, y: 4, scale: 0.92 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={reduceMotion ? undefined : { opacity: 0, y: -4, scale: 0.92 }}
                transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
                className="inline-flex"
              >
                <CountryFlag iso={selected.iso} label={countryName(selected)} />
              </motion.span>
            </AnimatePresence>
            <span className="phone-country-field__dial-code typo-tech">{selected.dial}</span>
            <ChevronDown
              className={[
                "phone-country-field__caret h-3.5 w-3.5",
                open ? "phone-country-field__caret--open" : "",
              ].join(" ")}
              strokeWidth={2}
            />
          </button>

          <AnimatePresence>
            {open ? (
              <motion.ul
                id={listId}
                role="listbox"
                aria-label={language === "en" ? "Country code" : "Indicativo del país"}
                className="phone-country-field__menu"
                initial={reduceMotion ? false : { opacity: 0, y: -6, scale: 0.98 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={reduceMotion ? undefined : { opacity: 0, y: -4, scale: 0.98 }}
                transition={
                  reduceMotion
                    ? { duration: 0.12 }
                    : { type: "spring", stiffness: 380, damping: 28 }
                }
              >
                {PHONE_COUNTRY_OPTIONS.map((option) => {
                  const active = option.dial === selected.dial;
                  return (
                    <li key={option.dial} role="none">
                      <button
                        type="button"
                        role="option"
                        aria-selected={active}
                        className={[
                          "phone-country-field__option focus-ring",
                          active ? "phone-country-field__option--active" : "",
                        ].join(" ")}
                        onClick={() => {
                          onDialChange(option.dial);
                          setOpen(false);
                        }}
                      >
                        <CountryFlag iso={option.iso} label={countryName(option)} />
                        <span className="phone-country-field__option-name">
                          {countryName(option)}
                        </span>
                        <span className="phone-country-field__option-dial typo-tech">
                          {option.dial}
                        </span>
                        {active ? (
                          <Check className="phone-country-field__check h-3.5 w-3.5" strokeWidth={2} />
                        ) : (
                          <span className="phone-country-field__check-spacer" aria-hidden />
                        )}
                      </button>
                    </li>
                  );
                })}
              </motion.ul>
            ) : null}
          </AnimatePresence>
        </div>

        <label className="sr-only" htmlFor="quote-phone-local">
          {numberLabel}
        </label>
        <input
          id="quote-phone-local"
          inputMode="tel"
          autoComplete="tel-national"
          value={localNumber}
          onChange={(event) => onLocalNumberChange(event.target.value)}
          placeholder={numberPlaceholder}
          className="phone-country-field__input"
        />
      </div>

      <p className="phone-country-field__helper">{helperText}</p>
    </div>
  );
}
