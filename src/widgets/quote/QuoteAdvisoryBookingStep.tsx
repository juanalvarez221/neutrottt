"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { CalendarDays, Check, Loader2, MapPin, Monitor } from "lucide-react";
import { QuoteShell } from "@/widgets/quote/QuoteShell";
import { QuoteStepHeader } from "@/widgets/quote/QuoteStepChrome";
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
import { formatQuoteLocationLabel } from "@/widgets/quote/quoteBodyLocation";
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
      const zoneDisplay = formatQuoteLocationLabel(draft, t, {
        zone: draft?.zone,
        zoneOther: draft?.zoneOther,
      });

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
        notes: draft?.notes?.trim() ?? "",
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
      <QuoteStepHeader
        eyebrow={t("quoteAdvisoryBookingStep")}
        title={t("quoteAdvisoryBookingTitle")}
        body={t("quoteAdvisoryBookingBody")}
      />

      <div className="mb-8 flex flex-wrap items-center gap-2">
        <span className="inline-flex items-center gap-2 rounded-xl border border-[rgba(var(--rgb-sand),0.14)] bg-[rgba(12,10,8,0.55)] px-4 py-2 text-sm text-[rgba(var(--rgb-sand),0.88)]">
          {mode === "presencial" ? (
            <MapPin className="h-4 w-4" strokeWidth={1.5} />
          ) : (
            <Monitor className="h-4 w-4" strokeWidth={1.5} />
          )}
          {modeTitle}
        </span>
        <span className="rounded-xl border border-[rgba(var(--rgb-sand),0.12)] bg-white/5 px-3 py-1.5 font-mono text-[0.62rem] uppercase tracking-[0.14em] text-[rgba(var(--rgb-sand),0.55)]">
          {t("quoteAdvisoryBookingDuration").replace("{minutes}", String(durationMin))}
        </span>
      </div>
      {mode === "presencial" ? (
        <p className="-mt-5 mb-8 font-mono text-[0.65rem] text-[rgba(var(--rgb-sand),0.4)]">
          {getStudioFullAddress()}
        </p>
      ) : null}

      {loading ? (
        <div className="flex min-h-48 items-center justify-center rounded-2xl border border-[rgba(var(--rgb-sand),0.12)] bg-[rgba(12,10,8,0.55)] p-6">
          <Loader2 className="h-6 w-6 animate-spin text-[rgba(var(--rgb-honey),0.75)]" />
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
              <CalendarDays className="h-4 w-4 text-[rgba(var(--rgb-honey),0.75)]" strokeWidth={1.5} />
              <h3 className="font-mono text-[0.62rem] uppercase tracking-[0.16em] text-[rgba(var(--rgb-sand),0.55)]">
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
                        ? "border-[rgba(var(--rgb-honey),0.4)] bg-[rgba(var(--rgb-cafe),0.65)] text-[rgba(var(--rgb-sand),0.95)]"
                        : "border-[rgba(var(--rgb-sand),0.12)] bg-white/5 text-[rgba(var(--rgb-ivory),0.8)] hover:bg-white/8",
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
            <h3 className="mb-3 font-mono text-[0.62rem] uppercase tracking-[0.16em] text-[rgba(var(--rgb-sand),0.55)]">
              {t("quoteAdvisoryBookingTimeLabel")}
            </h3>
            <p className="mb-3 text-sm text-[rgba(var(--rgb-ivory),0.55)]">
              Primero elige un día. Después aparecerán las horas disponibles para esa fecha.
            </p>
            {!hasSelectedDate ? (
              <div className="rounded-2xl border border-dashed border-[rgba(var(--rgb-sand),0.14)] bg-white/5 p-4 text-sm text-[rgba(var(--rgb-ivory),0.65)]">
                Selecciona un día arriba para ver los horarios disponibles.
              </div>
            ) : loadingSlots ? (
              <div className="flex items-center gap-2 rounded-xl border border-[rgba(var(--rgb-sand),0.12)] bg-white/5 px-4 py-3 text-sm text-[rgba(var(--rgb-ivory),0.7)]">
                <Loader2 className="h-4 w-4 animate-spin text-[rgba(var(--rgb-honey),0.75)]" />
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
                          ? "border-[rgba(var(--rgb-honey),0.4)] bg-[rgba(var(--rgb-cafe),0.65)] text-[rgba(var(--rgb-sand),0.95)]"
                          : "border-[rgba(var(--rgb-sand),0.12)] bg-white/5 text-[rgba(var(--rgb-ivory),0.9)] hover:bg-white/8",
                      ].join(" ")}
                    >
                      {slot.time}
                    </button>
                  );
                })}
              </div>
            ) : (
              <div className="rounded-2xl border border-[rgba(var(--rgb-honey),0.22)] bg-[rgba(var(--rgb-cafe),0.45)] p-4 text-sm text-[rgba(var(--rgb-sand),0.88)]">
                No hay horarios disponibles para este día. Elige otro día para seguir con la reserva.
              </div>
            )}
          </section>

          {selectedSlot ? (
            <section className="mb-6 rounded-2xl border border-[rgba(var(--rgb-sand),0.14)] bg-[rgba(12,10,8,0.72)] p-5 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
              <p className="font-mono text-[0.58rem] uppercase tracking-[0.14em] text-[rgba(var(--rgb-sand),0.45)]">
                {t("quoteAdvisoryBookingSummary")}
              </p>
              <p className="mt-2 text-lg font-semibold text-[rgba(var(--rgb-sand),0.95)]">{selectedSlot.label}</p>
              <p className="mt-2 text-sm text-[rgba(var(--rgb-ivory),0.6)]">
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
