"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import type { RecorridoVisitante } from "@/shared/lib/analitica/navegacion";
import { formatDuracion, formatPorcentaje } from "@/shared/lib/analitica/fechaEstudio";
import { CAPA_ORO_VACIA, type CapaOro } from "@/shared/lib/analitica/tipos";
import { getSmartQuoteRequests, type SmartQuoteRequest } from "@/shared/lib/smartQuotes";
import {
  AdminEmptyState,
  AdminError,
  AdminPageHeader,
  AdminSkeleton,
  StatusPill,
} from "@/widgets/admin/AdminPrimitives";
import { formatAdminDay, formatRelative, visitorLabel } from "@/widgets/admin/adminFormat";
import {
  backendToSmartQuote,
  isQuoteActionable,
  isQuoteConfirmed,
  mergeQuotes,
  QUOTE_STATUS_SHORT,
  type QuoteRequestRecordLite,
} from "@/widgets/admin/adminQuotes";
import { recorridosIncompletos } from "@/widgets/admin/quoteJourney";

type AdvisoryBookingRow = {
  id: string;
  mode: "presencial" | "virtual";
  startsAt: string;
  clientName: string;
  phone: string;
  email: string;
  status: "reserved" | "confirmed" | "released" | "cancelled";
  label: string;
};

type PendingItem = {
  id: string;
  kind: "cotizacion" | "asesoria" | "recorrido";
  title: string;
  detail: string;
  href: string;
  stamp: string;
};

function isUpcoming(iso: string, now = Date.now()) {
  const at = Date.parse(iso);
  return Number.isFinite(at) && at >= now - 30 * 60_000;
}

export function AdminHomeDashboard() {
  const [quotes, setQuotes] = useState<SmartQuoteRequest[]>(() => getSmartQuoteRequests());
  const [bookings, setBookings] = useState<AdvisoryBookingRow[]>([]);
  const [oro, setOro] = useState<CapaOro | null>(null);
  const [incompletos, setIncompletos] = useState<ReturnType<typeof recorridosIncompletos>>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [quotesRes, bookingsRes, oroRes, navRes] = await Promise.all([
        fetch("/api/admin/quote-requests", { cache: "no-store" }),
        fetch("/api/advisory/bookings", { cache: "no-store" }),
        fetch("/api/admin/analitica/resumen", { cache: "no-store" }),
        fetch("/api/admin/analitica/navegacion", { cache: "no-store" }),
      ]);

      if (quotesRes.ok) {
        const data = (await quotesRes.json()) as { requests?: QuoteRequestRecordLite[] };
        const backend = (data.requests ?? []).map(backendToSmartQuote);
        setQuotes((prev) => mergeQuotes(backend, prev));
      }

      if (bookingsRes.ok) {
        const data = (await bookingsRes.json()) as { bookings?: AdvisoryBookingRow[] };
        setBookings(data.bookings ?? []);
      }

      if (oroRes.ok) {
        setOro((await oroRes.json()) as CapaOro);
      }

      if (navRes.ok) {
        const data = (await navRes.json()) as { visitantes?: RecorridoVisitante[] };
        setIncompletos(recorridosIncompletos(data.visitantes ?? []));
      }
    } catch {
      setError("No se pudo cargar el tablero. Revisa la conexión e inténtalo de nuevo.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const pendingQuotes = useMemo(() => quotes.filter(isQuoteActionable), [quotes]);
  const confirmedQuotes = useMemo(() => quotes.filter(isQuoteConfirmed), [quotes]);
  const liveBookings = useMemo(
    () =>
      bookings
        .filter((row) => row.status === "reserved" || row.status === "confirmed")
        .filter((row) => isUpcoming(row.startsAt))
        .sort((a, b) => a.startsAt.localeCompare(b.startsAt)),
    [bookings],
  );
  const reservedBookings = useMemo(
    () => liveBookings.filter((row) => row.status === "reserved"),
    [liveBookings],
  );

  const pendientes = useMemo<PendingItem[]>(() => {
    const items: PendingItem[] = [];
    for (const quote of pendingQuotes) {
      items.push({
        id: `q-${quote.id}`,
        kind: "cotizacion",
        title: quote.clientName,
        detail: `${QUOTE_STATUS_SHORT[quote.status]} · ${quote.size} · ${quote.zone}`,
        href: `/admin/cotizaciones/${quote.id}`,
        stamp: quote.createdAt,
      });
    }
    for (const booking of reservedBookings) {
      items.push({
        id: `a-${booking.id}`,
        kind: "asesoria",
        title: booking.clientName,
        detail: `Asesoría ${booking.mode} por confirmar · ${booking.label}`,
        href: "/admin/asesorias",
        stamp: booking.startsAt,
      });
    }
    for (const row of incompletos.slice(0, 6)) {
      items.push({
        id: `r-${row.id_visitante}`,
        kind: "recorrido",
        title: visitorLabel(row.persona_nombre, row.id_visitante),
        detail: `Se detuvo en ${row.ultimo_paso_etiqueta}`,
        href: "/admin/recorridos",
        stamp: row.ultimo_en,
      });
    }
    return items.sort((a, b) => Date.parse(b.stamp) - Date.parse(a.stamp)).slice(0, 8);
  }, [pendingQuotes, reservedBookings, incompletos]);

  const novedades = useMemo(() => {
    const items: Array<{ id: string; title: string; detail: string; href: string; stamp: string }> =
      [];
    for (const quote of quotes.slice(0, 4)) {
      items.push({
        id: `nq-${quote.id}`,
        title: `Cotización de ${quote.clientName}`,
        detail: `${QUOTE_STATUS_SHORT[quote.status]} · ${quote.size}`,
        href: `/admin/cotizaciones/${quote.id}`,
        stamp: quote.createdAt,
      });
    }
    for (const booking of [...bookings]
      .sort((a, b) => b.startsAt.localeCompare(a.startsAt))
      .slice(0, 3)) {
      items.push({
        id: `na-${booking.id}`,
        title: `Asesoría con ${booking.clientName}`,
        detail: `${booking.label} · ${booking.mode}`,
        href: "/admin/asesorias",
        stamp: booking.startsAt,
      });
    }
    return items.sort((a, b) => Date.parse(b.stamp) - Date.parse(a.stamp)).slice(0, 6);
  }, [quotes, bookings]);

  const metrics = oro ?? CAPA_ORO_VACIA;
  const nextAdvisory = liveBookings[0] ?? null;

  return (
    <div className="space-y-8">
      <AdminPageHeader
        kicker={formatAdminDay(new Date().toISOString())}
        title="Inicio"
        description="Lo que requiere atención hoy, las solicitudes que acaba de dejar la gente y el pulso del sitio."
      />

      {error ? <AdminError message={error} /> : null}

      {loading ? (
        <AdminSkeleton rows={5} />
      ) : (
        <>
          <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <PulseCard
              href="/admin/cotizaciones"
              label="Por atender"
              value={String(pendingQuotes.length)}
              hint="Cotizaciones sin cifra o sin confirmación"
            />
            <PulseCard
              href="/admin/cotizaciones?vista=confirmadas"
              label="Confirmadas"
              value={String(confirmedQuotes.length)}
              hint="Proyectos ya reservados o pagados"
            />
            <PulseCard
              href="/admin/asesorias"
              label="Asesorías vivas"
              value={String(liveBookings.length)}
              hint={`${reservedBookings.length} por confirmar asistencia`}
            />
            <PulseCard
              href="/admin/recorridos"
              label="Flujos abiertos"
              value={String(incompletos.length)}
              hint="Entraron a cotizar y no cerraron"
            />
          </section>

          <div className="grid gap-8 lg:grid-cols-[minmax(0,1.35fr)_minmax(0,0.85fr)]">
            <section>
              <SectionHead
                title="Asuntos pendientes"
                href="/admin/cotizaciones"
                action="Ver cotizaciones"
              />
              {pendientes.length === 0 ? (
                <AdminEmptyState
                  title="Nada urgente en cola"
                  body="Cuando alguien deje una cotización, reserve asesoría o se detenga a mitad de camino, aparece aquí."
                />
              ) : (
                <ul className="divide-y divide-white/8 border-t border-white/10">
                  {pendientes.map((item) => (
                    <li key={item.id}>
                      <Link
                        href={item.href}
                        className="flex items-start justify-between gap-4 py-4 transition hover:bg-white/[0.03] active:scale-[0.99]"
                      >
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <p className="truncate text-sm font-semibold text-zinc-50">
                              {item.title}
                            </p>
                            <StatusPill className={kindTone(item.kind)}>
                              {kindLabel(item.kind)}
                            </StatusPill>
                          </div>
                          <p className="mt-1 text-sm text-zinc-400">{item.detail}</p>
                        </div>
                        <p className="shrink-0 font-mono text-[11px] text-zinc-500">
                          {formatRelative(item.stamp)}
                        </p>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <aside className="space-y-8">
              <section>
                <SectionHead title="Próxima asesoría" href="/admin/asesorias" action="Agenda" />
                {nextAdvisory ? (
                  <Link
                    href="/admin/asesorias"
                    className="mt-4 block border-t border-white/10 pt-4 transition hover:bg-white/[0.03]"
                  >
                    <p className="text-lg font-semibold text-zinc-50">{nextAdvisory.clientName}</p>
                    <p className="mt-1 text-sm text-amber-100/90">{nextAdvisory.label}</p>
                    <p className="mt-2 text-xs text-zinc-500">
                      {nextAdvisory.mode} · {nextAdvisory.phone} · {nextAdvisory.email}
                    </p>
                  </Link>
                ) : (
                  <AdminEmptyState
                    title="Sin citas próximas"
                    body="Las reservas vivas del cotizador aparecen aquí con nombre, hora y canal."
                  />
                )}
              </section>

              <section>
                <SectionHead title="Uso reciente" href="/admin/analitica" action="Métricas" />
                <div className="mt-4 grid grid-cols-2 gap-x-5 gap-y-4 border-t border-white/10 pt-4">
                  <Metric
                    label="Sesiones"
                    value={String(metrics.kpis.sesiones)}
                  />
                  <Metric
                    label="Permanencia"
                    value={formatDuracion(metrics.kpis.duracion_media_sesion_ms)}
                  />
                  <Metric
                    label="Cotizaciones iniciadas"
                    value={String(metrics.kpis.cotizaciones_iniciadas)}
                  />
                  <Metric
                    label="Rebote"
                    value={formatPorcentaje(metrics.kpis.tasa_rebote)}
                  />
                </div>
              </section>
            </aside>
          </div>

          <section>
            <SectionHead title="Novedades" href="/admin/cotizaciones" action="Bandeja" />
            {novedades.length === 0 ? (
              <AdminEmptyState
                title="Todavía no hay movimiento"
                body="Las solicitudes nuevas, reservas y cierres del cotizador se listan aquí en cuanto existan."
              />
            ) : (
              <ul className="mt-1 divide-y divide-white/8 border-t border-white/10">
                {novedades.map((item) => (
                  <li key={item.id}>
                    <Link
                      href={item.href}
                      className="flex items-center justify-between gap-4 py-3.5 transition hover:bg-white/[0.03]"
                    >
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold text-zinc-100">{item.title}</p>
                        <p className="mt-0.5 truncate text-xs text-zinc-500">{item.detail}</p>
                      </div>
                      <p className="shrink-0 font-mono text-[11px] text-zinc-500">
                        {formatRelative(item.stamp)}
                      </p>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </>
      )}
    </div>
  );
}

function PulseCard({
  href,
  label,
  value,
  hint,
}: {
  href: string;
  label: string;
  value: string;
  hint: string;
}) {
  return (
    <Link
      href={href}
      className="group border-t border-white/10 pt-4 transition hover:bg-white/[0.03] active:scale-[0.99]"
    >
      <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-zinc-500">{label}</p>
      <p className="mt-1 font-mono text-3xl font-semibold tabular-nums text-zinc-50">{value}</p>
      <p className="mt-1 flex items-center gap-1 text-xs text-zinc-500 group-hover:text-zinc-300">
        {hint}
        <ArrowUpRight className="h-3 w-3" strokeWidth={1.6} />
      </p>
    </Link>
  );
}

function SectionHead({
  title,
  href,
  action,
}: {
  title: string;
  href: string;
  action: string;
}) {
  return (
    <div className="flex items-end justify-between gap-3">
      <h2 className="text-sm font-semibold uppercase tracking-[0.14em] text-zinc-300">{title}</h2>
      <Link
        href={href}
        className="text-xs font-semibold text-zinc-500 transition hover:text-zinc-200"
      >
        {action}
      </Link>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-zinc-500">{label}</p>
      <p className="mt-1 font-mono text-xl font-semibold tabular-nums text-zinc-50">{value}</p>
    </div>
  );
}

function kindLabel(kind: PendingItem["kind"]) {
  if (kind === "cotizacion") return "Cotización";
  if (kind === "asesoria") return "Asesoría";
  return "Recorrido";
}

function kindTone(kind: PendingItem["kind"]) {
  if (kind === "cotizacion") return "border-amber-500/30 bg-amber-500/10 text-amber-100";
  if (kind === "asesoria") return "border-sky-500/30 bg-sky-500/10 text-sky-100";
  return "border-zinc-500/30 bg-zinc-500/10 text-zinc-300";
}
