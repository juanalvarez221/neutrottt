"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { CalendarDays, Check, Loader2, MapPin, Monitor } from "lucide-react";
import { QuoteShell } from "@/widgets/quote/QuoteShell";
import { useSiteLanguage } from "@/shared/i18n/LanguageProvider";
import { getQuoteConnection, mapConnectionToSmartQuote } from "@/shared/lib/quoteConnection";
import {
  getQuoteDraft,
  isLargeQuoteSize,
  setQuoteCompletionType,
} from "@/shared/lib/quoteDraft";
import { getQuoteProfile } from "@/shared/lib/quoteProfile";
import { addSmartQuoteRequest } from "@/shared/lib/smartQuotes";
import type { AdvisoryMode, AdvisorySlot } from "@/shared/lib/advisoryTypes";
import { formatDayLabel } from "@/shared/lib/advisorySlots";
import { buildAdvisoryWhatsAppMessage, whatsappUrl } from "@/shared/config/brand";
import { getStudioFullAddress } from "@/shared/config/studio";

type DaySlots = {
  date: string;
  slots: AdvisorySlot[];
};

export function QuoteAdvisoryBookingStep({
  mode,
  size,
}: {
  mode: AdvisoryMode;
  size: string;
}) {
  const router = useRouter();
  const { language, t } = useSiteLanguage();
  const draft = getQuoteDraft();
  const profile = getQuoteProfile();
  const [days, setDays] = useState<DaySlots[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedDate, setSelectedDate] = useState("");
  const [selectedSlot, setSelectedSlot] = useState<AdvisorySlot | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!profile || !getQuoteConnection()) {
      router.replace("/cotizacion");
      return;
    }
    if (!isLargeQuoteSize(size)) {
      router.replace(`/cotizacion/ubicacion?size=${encodeURIComponent(size)}`);
      return;
    }
    const draft = getQuoteDraft();
    if (!draft?.zone) {
      router.replace(`/cotizacion/ubicacion?size=${encodeURIComponent(size)}`);
    }
  }, [profile, router, size]);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      setError("");
      try {
        const response = await fetch(`/api/advisory/slots?mode=${mode}`, {
          cache: "no-store",
        });
        const payload = (await response.json()) as {
          days?: DaySlots[];
          error?: string;
        };
        if (!response.ok) {
          throw new Error(payload.error ?? t("quoteAdvisoryBookingLoadError"));
        }
        const nextDays = (payload.days ?? []).filter((day) => day.slots.length > 0);
        if (!cancelled) {
          setDays(nextDays);
          setSelectedDate(nextDays[0]?.date ?? "");
          setSelectedSlot(null);
        }
      } catch (loadError) {
        if (!cancelled) {
          setError(
            loadError instanceof Error
              ? loadError.message
              : t("quoteAdvisoryBookingLoadError"),
          );
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, [mode, t]);

  const slotsForSelectedDay = useMemo(
    () => days.find((day) => day.date === selectedDate)?.slots ?? [],
    [days, selectedDate],
  );

  const confirmBooking = async () => {
    if (!profile || !selectedSlot) return;
    setSubmitting(true);
    setError("");

    try {
      const response = await fetch("/api/advisory/book", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode,
          startsAt: selectedSlot.startsAt,
          clientName: profile.name,
          phone: profile.phone,
          email: profile.email,
          projectNotes: draft?.notes ?? "",
          size,
        }),
      });
      const payload = (await response.json()) as {
        ok?: boolean;
        booking?: { id: string; label: string; startsAt: string };
        error?: string;
      };

      if (!response.ok || !payload.booking) {
        throw new Error(payload.error ?? t("quoteAdvisoryBookingSubmitError"));
      }

      const connection = getQuoteConnection();
      const connectionFields = connection ? mapConnectionToSmartQuote(connection, t) : {};
      addSmartQuoteRequest({
        id: `SQ-${Date.now()}`,
        createdAt: new Date().toISOString(),
        clientName: profile.name,
        phone: profile.phone,
        email: profile.email,
        size,
        zone: draft?.zone ?? "Por definir en asesoría",
        style: "Por definir en asesoría",
        notes: "",
        ...connectionFields,
        requiresAdvisory: true,
        advisoryMode: mode,
        advisoryScheduledAt: payload.booking.startsAt,
        advisoryBookingId: payload.booking.id,
        estimateSessions: "Por definir",
        estimatePerSession: "Por definir",
        estimateTotal: "Por definir en asesoría",
        status: "Asesoría Agendada",
      });

      sessionStorage.setItem(
        "quote_advisory_confirmation",
        JSON.stringify({
          label: payload.booking.label,
          mode,
          whatsappUrl: whatsappUrl(
            buildAdvisoryWhatsAppMessage({
              mode,
              slotLabel: payload.booking.label,
              clientName: profile.name,
            }),
          ),
        }),
      );

      setQuoteCompletionType("asesoria");
      router.push("/cotizacion/gracias");
    } catch (submitError) {
      setError(
        submitError instanceof Error
          ? submitError.message
          : t("quoteAdvisoryBookingSubmitError"),
      );
    } finally {
      setSubmitting(false);
    }
  };

  const modeTitle =
    mode === "presencial" ? t("quoteAdvisoryPresencialTitle") : t("quoteAdvisoryVirtualTitle");

  return (
    <QuoteShell>
      <section className="relative mb-8">
        <div className="pointer-events-none absolute -left-10 -top-10 h-40 w-40 rounded-full bg-amber-600/15 blur-[60px]" />
        <p className="typo-tech mb-2 uppercase tracking-[0.16em] text-amber-200/85">
          {t("quoteAdvisoryBookingStep")}
        </p>
        <h2 className="typo-section text-[2rem] leading-[1.05] md:text-[2.8rem]">
          {t("quoteAdvisoryBookingTitle")}
        </h2>
        <p className="typo-body mt-4 max-w-2xl leading-relaxed">{t("quoteAdvisoryBookingBody")}</p>

        <div className="mt-4 inline-flex items-center gap-2 rounded-full border border-amber-500/30 bg-amber-600/10 px-4 py-2 text-sm text-amber-100">
          {mode === "presencial" ? (
            <MapPin className="h-4 w-4" />
          ) : (
            <Monitor className="h-4 w-4" />
          )}
          {modeTitle}
        </div>
        {mode === "presencial" ? (
          <p className="typo-tech mt-2 text-xs text-zinc-500">{getStudioFullAddress()}</p>
        ) : null}
      </section>

      {loading ? (
        <div className="glass-card flex min-h-48 items-center justify-center rounded-2xl p-6">
          <Loader2 className="h-6 w-6 animate-spin text-amber-300" />
        </div>
      ) : null}

      {!loading && error ? (
        <p className="rounded-2xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-100">
          {error}
        </p>
      ) : null}

      {!loading && !error && days.length === 0 ? (
        <p className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-zinc-300">
          {t("quoteAdvisoryBookingEmpty")}
        </p>
      ) : null}

      {!loading && !error && days.length > 0 ? (
        <>
          <section className="mb-6">
            <div className="mb-3 flex items-center gap-2">
              <CalendarDays className="h-4 w-4 text-amber-300" />
              <h3 className="typo-subtitle text-sm uppercase tracking-[0.14em] text-zinc-200">
                {t("quoteAdvisoryBookingDayLabel")}
              </h3>
            </div>
            <div className="flex gap-2 overflow-x-auto pb-1">
              {days.map((day) => {
                const selected = selectedDate === day.date;
                return (
                  <button
                    key={day.date}
                    type="button"
                    onClick={() => {
                      setSelectedDate(day.date);
                      setSelectedSlot(null);
                    }}
                    className={[
                      "shrink-0 rounded-xl border px-4 py-3 text-left transition",
                      selected
                        ? "border-amber-500/35 bg-amber-600/15 text-amber-50"
                        : "border-white/10 bg-white/5 text-zinc-200 hover:bg-white/8",
                    ].join(" ")}
                  >
                    <span className="block text-sm font-semibold">
                      {formatDayLabel(day.date, language)}
                    </span>
                  </button>
                );
              })}
            </div>
          </section>

          <section className="mb-8">
            <h3 className="typo-subtitle mb-3 text-sm uppercase tracking-[0.14em] text-zinc-200">
              {t("quoteAdvisoryBookingTimeLabel")}
            </h3>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {slotsForSelectedDay.map((slot) => {
                const selected = selectedSlot?.startsAt === slot.startsAt;
                return (
                  <button
                    key={slot.startsAt}
                    type="button"
                    onClick={() => setSelectedSlot(slot)}
                    className={[
                      "rounded-xl border px-3 py-3 text-sm font-semibold transition",
                      selected
                        ? "border-amber-500/35 bg-amber-600/15 text-amber-50"
                        : "border-white/10 bg-white/5 text-zinc-100 hover:bg-white/8",
                    ].join(" ")}
                  >
                    {slot.time}
                  </button>
                );
              })}
            </div>
          </section>

          {selectedSlot ? (
            <section className="glass-card mb-6 rounded-2xl p-5">
              <p className="typo-tech text-xs uppercase tracking-[0.14em] text-zinc-400">
                {t("quoteAdvisoryBookingSummary")}
              </p>
              <p className="typo-subtitle mt-2 text-lg text-zinc-50">{selectedSlot.label}</p>
              <p className="typo-body mt-2 text-sm text-zinc-300">
                {profile?.name} · {modeTitle}
              </p>
            </section>
          ) : null}
        </>
      ) : null}

      <div className="mt-6 flex items-center justify-between gap-3">
        <button
          type="button"
          onClick={() =>
            router.push(`/cotizacion/asesoria?size=${encodeURIComponent(size)}`)
          }
          className="rounded-xl border border-white/10 bg-white/5 px-5 py-3 text-sm font-semibold text-zinc-100 transition hover:bg-white/8"
        >
          {t("commonBack")}
        </button>
        <button
          type="button"
          disabled={!selectedSlot || submitting}
          onClick={() => void confirmBooking()}
          className="inline-flex items-center gap-2 rounded-xl border border-amber-500/35 bg-gradient-to-r from-amber-700 to-orange-600 px-6 py-3 text-sm font-bold uppercase tracking-[0.2em] text-white transition hover:-translate-y-0.5 hover:shadow-[0_0_20px_rgba(245,158,11,0.35)] disabled:cursor-not-allowed disabled:opacity-50"
        >
          {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
          {t("quoteAdvisoryBookingConfirm")}
        </button>
      </div>
    </QuoteShell>
  );
}
