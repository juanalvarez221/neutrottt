"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Check, Loader2, MapPin, Monitor } from "lucide-react";
import { QuoteShell } from "@/widgets/quote/QuoteShell";
import { useSiteLanguage } from "@/shared/i18n/LanguageProvider";

type BookingPreview = {
  id: string;
  clientName: string;
  mode: "presencial" | "virtual";
  label: string;
  status: string;
  canConfirm: boolean;
  attendanceConfirmedAt: string | null;
};

export function QuoteAdvisoryConfirmStep({ token }: { token: string }) {
  const { t } = useSiteLanguage();
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [booking, setBooking] = useState<BookingPreview | null>(null);
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      setError("");
      try {
        const response = await fetch(
          `/api/advisory/confirm?token=${encodeURIComponent(token)}`,
          { cache: "no-store" },
        );
        const payload = (await response.json()) as {
          booking?: BookingPreview;
          error?: string;
        };
        if (!response.ok || !payload.booking) {
          throw new Error(payload.error ?? t("quoteAdvisoryConfirmLoadError"));
        }
        if (!cancelled) {
          setBooking(payload.booking);
          if (payload.booking.attendanceConfirmedAt || payload.booking.status === "confirmed") {
            setDone(true);
          }
        }
      } catch (loadError) {
        if (!cancelled) {
          setError(
            loadError instanceof Error
              ? loadError.message
              : t("quoteAdvisoryConfirmLoadError"),
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

  const confirmAttendance = async () => {
    setSubmitting(true);
    setError("");
    try {
      const response = await fetch("/api/advisory/confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token }),
      });
      const payload = (await response.json()) as {
        ok?: boolean;
        error?: string;
        canReschedule?: boolean;
      };
      if (!response.ok) {
        if (payload.canReschedule) {
          throw new Error(t("quoteAdvisoryConfirmReleased"));
        }
        throw new Error(payload.error ?? t("quoteAdvisoryConfirmSubmitError"));
      }
      setDone(true);
    } catch (submitError) {
      setError(
        submitError instanceof Error
          ? submitError.message
          : t("quoteAdvisoryConfirmSubmitError"),
      );
    } finally {
      setSubmitting(false);
    }
  };

  const modeTitle =
    booking?.mode === "presencial"
      ? t("quoteAdvisoryPresencialTitle")
      : t("quoteAdvisoryVirtualTitle");

  return (
    <QuoteShell greetingKey="quoteGreetAdvisoryConfirm">
      <section className="relative mb-8 max-w-2xl">
        <p className="typo-tech mb-2 uppercase tracking-[0.16em] text-amber-200/85">
          {t("quoteAdvisoryConfirmStep")}
        </p>
        <h2 className="typo-section text-[2rem] leading-[1.05] md:text-[2.4rem]">
          {done ? t("quoteAdvisoryConfirmDoneTitle") : t("quoteAdvisoryConfirmTitle")}
        </h2>
        <p className="typo-body mt-4 leading-relaxed">
          {done ? t("quoteAdvisoryConfirmDoneBody") : t("quoteAdvisoryConfirmBody")}
        </p>
      </section>

      {loading ? (
        <div className="glass-card flex min-h-40 items-center justify-center rounded-2xl p-6">
          <Loader2 className="h-6 w-6 animate-spin text-amber-300" />
        </div>
      ) : null}

      {!loading && error ? (
        <div className="space-y-3">
          <p className="rounded-2xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-100">
            {error}
          </p>
          {error === t("quoteAdvisoryConfirmReleased") ? (
            <Link
              href={`/cotizacion/asesoria/reagendar?token=${encodeURIComponent(token)}`}
              className="btn-accent focus-ring typo-cta inline-flex rounded-xl px-5 py-3 active:scale-[0.98]"
            >
              {t("quoteAdvisoryRescheduleCta")}
            </Link>
          ) : null}
        </div>
      ) : null}

      {!loading && !error && booking ? (
        <section className="glass-card rounded-2xl p-5">
          <p className="typo-tech text-xs uppercase tracking-[0.14em] text-zinc-400">
            {t("quoteAdvisoryBookingSummary")}
          </p>
          <p className="typo-subtitle mt-2 text-lg text-zinc-50">{booking.label}</p>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-2 rounded-full border border-stone-500/30 bg-stone-600/10 px-3 py-1.5 text-sm text-stone-100">
              {booking.mode === "presencial" ? (
                <MapPin className="h-4 w-4" />
              ) : (
                <Monitor className="h-4 w-4" />
              )}
              {modeTitle}
            </span>
            <span className="typo-tech text-xs uppercase tracking-[0.12em] text-zinc-400">
              {booking.clientName}
            </span>
          </div>

          {!done && booking.canConfirm ? (
            <button
              type="button"
              disabled={submitting}
              onClick={() => void confirmAttendance()}
              className="btn-accent focus-ring typo-cta mt-6 inline-flex w-full items-center justify-center gap-2 rounded-xl px-5 py-3.5 active:scale-[0.98] disabled:opacity-50"
            >
              {submitting ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Check className="h-4 w-4" />
              )}
              {t("quoteAdvisoryConfirmCta")}
            </button>
          ) : null}
        </section>
      ) : null}
    </QuoteShell>
  );
}
