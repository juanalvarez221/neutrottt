"use client";

import { useEffect, useState } from "react";
import { CalendarDays, Loader2, RefreshCw } from "lucide-react";
import { Card } from "@/shared/ui/Card";
import { formatSlotLabel } from "@/shared/lib/advisorySlots";

type AdvisoryBookingRow = {
  id: string;
  mode: "presencial" | "virtual";
  startsAt: string;
  clientName: string;
  phone: string;
  email: string;
  projectNotes?: string;
  label: string;
};

export function AdvisoryAgendaPanel() {
  const [bookings, setBookings] = useState<AdvisoryBookingRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const loadBookings = async () => {
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/advisory/bookings", { cache: "no-store" });
      const payload = (await response.json()) as {
        bookings?: AdvisoryBookingRow[];
        error?: string;
      };
      if (!response.ok) {
        throw new Error(payload.error ?? "No se pudo cargar la agenda.");
      }
      setBookings(payload.bookings ?? []);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Error de agenda.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadBookings();
  }, []);

  return (
    <Card>
      <div className="p-4 sm:p-5">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <CalendarDays className="h-4 w-4 text-amber-300" />
            <h2 className="text-sm font-semibold text-zinc-50">Asesorías agendadas</h2>
          </div>
          <button
            type="button"
            onClick={() => void loadBookings()}
            className="inline-flex items-center gap-1 rounded-lg border border-white/10 bg-white/5 px-2.5 py-1.5 text-xs font-semibold text-zinc-200 transition hover:bg-white/10"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            Actualizar
          </button>
        </div>
        <p className="mt-1 text-xs text-zinc-400">
          Reservas de proyectos grandes desde el cotizador.
        </p>

        {loading ? (
          <div className="mt-4 flex items-center gap-2 text-sm text-zinc-400">
            <Loader2 className="h-4 w-4 animate-spin" />
            Cargando agenda…
          </div>
        ) : null}

        {error ? (
          <p className="mt-4 rounded-xl border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-sm text-rose-100">
            {error}
          </p>
        ) : null}

        {!loading && !error ? (
          <div className="mt-4 space-y-2">
            {bookings.length ? (
              bookings.map((booking) => (
                <div
                  key={booking.id}
                  className="rounded-xl border border-white/10 bg-black/30 px-3 py-3"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-sm font-semibold text-zinc-50">{booking.clientName}</p>
                    <span className="rounded-full border border-sky-500/30 bg-sky-500/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-sky-200">
                      {booking.mode}
                    </span>
                  </div>
                  <p className="mt-1 text-sm text-amber-100">
                    {booking.label || formatSlotLabel(booking.startsAt, "es-CO")}
                  </p>
                  <p className="mt-1 text-xs text-zinc-400">
                    {booking.phone} · {booking.email}
                  </p>
                  {booking.projectNotes ? (
                    <p className="mt-2 text-xs leading-relaxed text-zinc-300">
                      {booking.projectNotes}
                    </p>
                  ) : null}
                </div>
              ))
            ) : (
              <p className="text-sm text-zinc-400">Sin asesorías reservadas todavía.</p>
            )}
          </div>
        ) : null}
      </div>
    </Card>
  );
}
