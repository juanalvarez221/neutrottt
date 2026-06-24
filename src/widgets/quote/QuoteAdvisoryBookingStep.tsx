"use client";

import { useCallback, useEffect, useState } from "react";
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
import { useQuoteOnboardingGate } from "@/widgets/quote/useQuoteOnboardingGate";
import {
  addSmartQuoteRequest,
  persistQuoteRequestToBackend,
  type SmartQuoteRequest,
} from "@/shared/lib/smartQuotes";
import { getAdvisoryDurationMin } from "@/shared/lib/advisoryConfig";
import type { AdvisoryMode, AdvisorySlot } from "@/shared/lib/advisoryTypes";
import { formatDayLabel } from "@/shared/lib/advisorySlots";
import { formatZoneDisplay, getZoneRefinementFromDraft } from "@/shared/lib/quoteZones";
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
  const [loadingSlots, setLoadingSlots] = useState(false);
  const [selectedDate, setSelectedDate] = useState("");
  const [selectedSlot, setSelectedSlot] = useState<AdvisorySlot | null>(null);
  const [slotsForSelectedDay, setSlotsForSelectedDay] = useState<AdvisorySlot[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [durationMin, setDurationMin] = useState(getAdvisoryDurationMin(mode));
  const gateReady = useQuoteOnboardingGate();

  useEffect(() => {
    if (!gateReady) return;
    if (!isLargeQuoteSize(size)) {
      router.replace(`/cotizacion/ubicacion?size=${encodeURIComponent(size)}`);
      return;
    }
    const draft = getQuoteDraft();
    if (!draft?.zone) {
      router.replace(`/cotizacion/ubicacion?size=${encodeURIComponent(size)}`);
    }
  }, [gateReady, router, size]);

  const loadSlotsForDate = useCallback(
    async (dateKey: string) => {
      if (!dateKey) return;
      setSelectedDate(dateKey);
      setLoadingSlots(true);
      setError("");
      setSelectedSlot(null);
      try {
        const response = await fetch(`/api/advisory/slots?mode=${mode}&date=${encodeURIComponent(dateKey)}`, {
          cache: "no-store",
        });
        const payload = (await response.json()) as {
          slots?: AdvisorySlot[];
          error?: string;
        };
        if (!response.ok) {
          throw new Error(payload.error ?? t("quoteAdvisoryBookingLoadError"));
        }
        const nextSlots = payload.slots ?? [];
        setSlotsForSelectedDay(nextSlots);
        setDays((current) =>
          current.map((day) => (day.date === dateKey ? { ...day, slots: nextSlots } : day)),
        );
      } catch (loadError) {
        setError(
          loadError instanceof Error
            ? loadError.message
            : t("quoteAdvisoryBookingLoadError"),
        );
        setSlotsForSelectedDay([]);
      } finally {
        setLoadingSlots(false);
      }
    },
    [mode, t],
  );

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
          durationMin?: number;
          error?: string;
        };
        if (!response.ok) {
          throw new Error(payload.error ?? t("quoteAdvisoryBookingLoadError"));
        }
        const nextDays = (payload.days ?? []).filter((day) => Boolean(day.date));
        if (!cancelled) {
          setDurationMin(payload.durationMin ?? getAdvisoryDurationMin(mode));
          setDays(nextDays);
          setSelectedDate("");
          setSlotsForSelectedDay([]);
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
  }, [loadSlotsForDate, mode, t]);

  const confirmBooking = async () => {
    if (!profile || !selectedSlot) return;
    setSubmitting(true);
    setError("");

    try {
      const connection = getQuoteConnection();
      const connectionFields = connection
        ? mapConnectionToSmartQuote(connection, t)
        : {
            connectionAftercare: undefined,
            connectionValues: undefined,
            connectionCollaboration: undefined,
            connectionPurpose: undefined,
          };
      const zoneDisplay = formatZoneDisplay(
        draft?.zone ?? "brazo",
        draft?.zoneOther,
        t,
        getZoneRefinementFromDraft(draft),
      );

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
          brief: {
            bodyZone: zoneDisplay,
            referral: connectionFields.connectionAftercare,
            personalValues: connectionFields.connectionValues,
            collaborationMode: connectionFields.connectionCollaboration,
            openNote: connectionFields.connectionPurpose,
          },
        }),
      });
      const payload = (await response.json()) as {
        ok?: boolean;
        booking?: { id: string; label: string; startsAt: string; meetingLink?: string };
        error?: string;
      };

      if (!response.ok || !payload.booking) {
        throw new Error(payload.error ?? t("quoteAdvisoryBookingSubmitError"));
      }

      const request: SmartQuoteRequest = {
        id: `SQ-${Date.now()}`,
        createdAt: new Date().toISOString(),
        clientName: profile.name,
        phone: profile.phone,
        email: profile.email,
        size,
        zone: zoneDisplay,
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
      };
      addSmartQuoteRequest(request);
      void persistQuoteRequestToBackend(request);

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
          meetingLink: payload.booking.meetingLink,
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
  const hasSelectedDate = Boolean(selectedDate);

  return (
    <QuoteShell greetingKey="quoteGreetAdvisoryBook">
      <section className="relative mb-8">
        <div className="pointer-events-none absolute -left-10 -top-10 h-40 w-40 rounded-full bg-amber-600/15 blur-[60px]" />
        <p className="typo-tech mb-2 uppercase tracking-[0.16em] text-amber-200/85">
          {t("quoteAdvisoryBookingStep")}
        </p>
        <h2 className="typo-section text-[2rem] leading-[1.05] md:text-[2.8rem]">
          {t("quoteAdvisoryBookingTitle")}
        </h2>
        <p className="typo-body mt-4 max-w-2xl leading-relaxed">{t("quoteAdvisoryBookingBody")}</p>

        <div className="mt-4 flex flex-wrap items-center gap-2">
          <span className="inline-flex items-center gap-2 rounded-full border border-stone-500/30 bg-stone-600/10 px-4 py-2 text-sm text-stone-100">
            {mode === "presencial" ? (
              <MapPin className="h-4 w-4" />
            ) : (
              <Monitor className="h-4 w-4" />
            )}
            {modeTitle}
          </span>
          <span className="typo-tech rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-xs uppercase tracking-[0.14em] text-zinc-300">
            {t("quoteAdvisoryBookingDuration").replace("{minutes}", String(durationMin))}
          </span>
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
            <div className="flex gap-2 overflow-x-auto overscroll-x-contain pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              {days.map((day) => {
                const selected = selectedDate === day.date;
                return (
                  <button
                    key={day.date}
                    type="button"
                    onClick={() => {
                      setSelectedDate(day.date);
                      void loadSlotsForDate(day.date);
                    }}
                    className={[
                      "shrink-0 rounded-xl border px-4 py-3.5 text-left transition min-h-[44px]",
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
            <p className="mb-3 text-sm text-zinc-400">
              Primero elige un día. Después aparecerán las horas disponibles para esa fecha.
            </p>
            {!hasSelectedDate ? (
              <div className="rounded-2xl border border-dashed border-white/10 bg-white/5 p-4 text-sm text-zinc-300">
                Selecciona un día arriba para ver los horarios disponibles.
              </div>
            ) : loadingSlots ? (
              <div className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-zinc-300">
                <Loader2 className="h-4 w-4 animate-spin text-amber-300" />
                Cargando horarios...
              </div>
            ) : slotsForSelectedDay.length > 0 ? (
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                {slotsForSelectedDay.map((slot) => {
                  const selected = selectedSlot?.startsAt === slot.startsAt;
                  return (
                    <button
                      key={slot.startsAt}
                      type="button"
                      onClick={() => setSelectedSlot(slot)}
                      className={[
                        "rounded-xl border px-3 py-3.5 text-sm font-semibold transition min-h-[44px]",
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
            ) : (
              <div className="rounded-2xl border border-amber-500/20 bg-amber-600/10 p-4 text-sm text-amber-100">
                No hay horarios disponibles para este día. Elige otro día para seguir con la reserva.
              </div>
            )}
          </section>

          {selectedSlot ? (
            <section className="glass-card mb-6 rounded-2xl p-5">
              <p className="typo-tech text-xs uppercase tracking-[0.14em] text-zinc-400">
                {t("quoteAdvisoryBookingSummary")}
              </p>
              <p className="typo-subtitle mt-2 text-lg text-zinc-50">{selectedSlot.label}</p>
              <p className="typo-body mt-2 text-sm text-zinc-300">
                {profile?.name} · {modeTitle} ·{" "}
                {t("quoteAdvisoryBookingDuration").replace("{minutes}", String(durationMin))}
              </p>
            </section>
          ) : null}
        </>
      ) : null}

      <div className="quote-step-footer mt-6">
        <button
          type="button"
          onClick={() =>
            router.push(`/cotizacion/asesoria?size=${encodeURIComponent(size)}`)
          }
          className="quote-step-footer-back rounded-xl border border-white/10 bg-white/5 px-5 py-3 text-sm font-semibold text-zinc-100 transition hover:bg-white/8"
        >
          {t("commonBack")}
        </button>
        <button
          type="button"
          disabled={!selectedSlot || submitting}
          onClick={() => void confirmBooking()}
          className="quote-step-footer-next btn-accent focus-ring typo-cta inline-flex items-center justify-center gap-2 rounded-xl px-6 py-3 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50"
        >
          {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
          {t("quoteAdvisoryBookingConfirm")}
        </button>
      </div>
    </QuoteShell>
  );
}
