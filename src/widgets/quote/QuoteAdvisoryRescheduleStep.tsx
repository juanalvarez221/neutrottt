"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { CalendarDays, Check, Loader2, MapPin, Monitor } from "lucide-react";
import { QuoteShell } from "@/widgets/quote/QuoteShell";
import { useSiteLanguage } from "@/shared/i18n/LanguageProvider";
import type { AdvisoryMode, AdvisorySlot } from "@/shared/lib/advisoryTypes";
import { formatDayLabel } from "@/shared/lib/advisorySlots";
import { getAdvisoryDurationMin } from "@/shared/lib/advisoryConfig";

type DaySlots = {
  date: string;
  slots: AdvisorySlot[];
};

type ReschedulePreview = {
  clientName: string;
  mode: AdvisoryMode;
  previousLabel: string;
};

export function QuoteAdvisoryRescheduleStep({ token }: { token: string }) {
  const router = useRouter();
  const { language, t } = useSiteLanguage();
  const [preview, setPreview] = useState<ReschedulePreview | null>(null);
  const [days, setDays] = useState<DaySlots[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedDate, setSelectedDate] = useState("");
  const [selectedSlot, setSelectedSlot] = useState<AdvisorySlot | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);
  const [doneLabel, setDoneLabel] = useState("");
  const [durationMin, setDurationMin] = useState(30);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      setError("");
      try {
        const previewRes = await fetch(
          `/api/advisory/reschedule?token=${encodeURIComponent(token)}`,
          { cache: "no-store" },
        );

        const previewPayload = (await previewRes.json()) as {
          booking?: ReschedulePreview & { mode: AdvisoryMode; status: string };
          error?: string;
        };

        if (!previewRes.ok || !previewPayload.booking) {
          throw new Error(previewPayload.error ?? t("quoteAdvisoryRescheduleLoadError"));
        }

        if (previewPayload.booking.status !== "released") {
          throw new Error(t("quoteAdvisoryRescheduleNotAllowed"));
        }

        const mode = previewPayload.booking.mode;
        const slotsResponse = await fetch(`/api/advisory/slots?mode=${mode}`, {
          cache: "no-store",
        });
        const slotsPayload = (await slotsResponse.json()) as {
          days?: DaySlots[];
          durationMin?: number;
          error?: string;
        };

        if (!slotsResponse.ok) {
          throw new Error(slotsPayload.error ?? t("quoteAdvisoryRescheduleLoadError"));
        }

        const nextDays = (slotsPayload.days ?? []).filter((day) => day.slots.length > 0);
        if (!cancelled) {
          setPreview(previewPayload.booking);
          setDurationMin(slotsPayload.durationMin ?? getAdvisoryDurationMin(mode));
          setDays(nextDays);
          setSelectedDate(nextDays[0]?.date ?? "");
        }
      } catch (loadError) {
        if (!cancelled) {
          setError(
            loadError instanceof Error
              ? loadError.message
              : t("quoteAdvisoryRescheduleLoadError"),
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
  }, [token, t]);

  const slotsForSelectedDay = useMemo(
    () => days.find((day) => day.date === selectedDate)?.slots ?? [],
    [days, selectedDate],
  );

  const confirmReschedule = async () => {
    if (!selectedSlot) return;
    setSubmitting(true);
    setError("");
    try {
      const response = await fetch("/api/advisory/reschedule", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, startsAt: selectedSlot.startsAt }),
      });
      const payload = (await response.json()) as {
        ok?: boolean;
        booking?: { label: string };
        error?: string;
      };
      if (!response.ok || !payload.booking) {
        throw new Error(payload.error ?? t("quoteAdvisoryRescheduleSubmitError"));
      }
      setDoneLabel(payload.booking.label);
      setDone(true);
    } catch (submitError) {
      setError(
        submitError instanceof Error
          ? submitError.message
          : t("quoteAdvisoryRescheduleSubmitError"),
      );
    } finally {
      setSubmitting(false);
    }
  };

  const modeTitle =
    preview?.mode === "presencial"
      ? t("quoteAdvisoryPresencialTitle")
      : t("quoteAdvisoryVirtualTitle");

  return (
    <QuoteShell greetingKey="quoteGreetAdvisoryReschedule">
      <section className="relative mb-8 max-w-2xl">
        <p className="typo-tech mb-2 uppercase tracking-[0.16em] text-amber-200/85">
          {t("quoteAdvisoryRescheduleStep")}
        </p>
        <h2 className="typo-section text-[2rem] leading-[1.05] md:text-[2.4rem]">
          {done ? t("quoteAdvisoryRescheduleDoneTitle") : t("quoteAdvisoryRescheduleTitle")}
        </h2>
        <p className="typo-body mt-4 leading-relaxed">
          {done ? t("quoteAdvisoryRescheduleDoneBody") : t("quoteAdvisoryRescheduleBody")}
        </p>
        {preview && !done ? (
          <p className="typo-tech mt-3 text-xs text-zinc-500">
            {t("quoteAdvisoryReschedulePrevious").replace("{slot}", preview.previousLabel)}
          </p>
        ) : null}
      </section>

      {loading ? (
        <div className="glass-card flex min-h-40 items-center justify-center rounded-2xl p-6">
          <Loader2 className="h-6 w-6 animate-spin text-amber-300" />
        </div>
      ) : null}

      {!loading && error ? (
        <p className="rounded-2xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-100">
          {error}
        </p>
      ) : null}

      {done ? (
        <section className="glass-card rounded-2xl p-5">
          <p className="typo-subtitle text-lg text-zinc-50">{doneLabel}</p>
          <button
            type="button"
            onClick={() => router.push("/")}
            className="btn-ghost-warm focus-ring mt-5 rounded-xl px-5 py-3 text-sm font-semibold active:scale-[0.98]"
          >
            {t("quoteAdvisoryRescheduleHomeCta")}
          </button>
        </section>
      ) : null}

      {!loading && !error && !done && preview && days.length > 0 ? (
        <>
          <div className="mb-4 flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-2 rounded-full border border-stone-500/30 bg-stone-600/10 px-3 py-1.5 text-sm text-stone-100">
              {preview.mode === "presencial" ? (
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
                      setSelectedSlot(null);
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
          </section>

          <button
            type="button"
            disabled={!selectedSlot || submitting}
            onClick={() => void confirmReschedule()}
            className="btn-accent focus-ring typo-cta inline-flex w-full items-center justify-center gap-2 rounded-xl px-5 py-3.5 active:scale-[0.98] disabled:opacity-50"
          >
            {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
            {t("quoteAdvisoryRescheduleCta")}
          </button>
        </>
      ) : null}

      {!loading && !error && !done && preview && days.length === 0 ? (
        <p className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-zinc-300">
          {t("quoteAdvisoryBookingEmpty")}
        </p>
      ) : null}
    </QuoteShell>
  );
}
