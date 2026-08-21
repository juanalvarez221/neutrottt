"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Search } from "lucide-react";
import type { RecorridoVisitante } from "@/shared/lib/analitica/navegacion";
import { formatDuracion } from "@/shared/lib/analitica/fechaEstudio";
import {
  getSmartQuoteRequests,
  saveSmartQuoteRequests,
  type SmartQuoteRequest,
} from "@/shared/lib/smartQuotes";
import { cn } from "@/shared/lib/cn";
import {
  AdminEmptyState,
  AdminError,
  AdminPageHeader,
  AdminSkeleton,
  StatusPill,
} from "@/widgets/admin/AdminPrimitives";
import { AdminDangerPurge } from "@/widgets/admin/AdminDangerPurge";
import { formatRelative, visitorLabel } from "@/widgets/admin/adminFormat";
import {
  backendToSmartQuote,
  isQuoteConfirmed,
  QUOTE_STATUS_SHORT,
  QUOTE_STATUS_TONE,
  type QuoteRequestRecordLite,
} from "@/widgets/admin/adminQuotes";
import { recorridosIncompletos, type RecorridoCotizacion } from "@/widgets/admin/quoteJourney";

type Vista = "recibidas" | "confirmadas" | "incompletas";

function vistaFromQuery(raw: string | null): Vista {
  if (raw === "confirmadas" || raw === "incompletas") return raw;
  return "recibidas";
}

export function QuotesInboxPanel() {
  const searchParams = useSearchParams();
  const vista = vistaFromQuery(searchParams.get("vista"));
  const [quotes, setQuotes] = useState<SmartQuoteRequest[]>(() => getSmartQuoteRequests());
  const [incompletos, setIncompletos] = useState<RecorridoCotizacion[]>([]);
  const [query, setQuery] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [quotesRes, navRes] = await Promise.all([
        fetch("/api/admin/quote-requests", { cache: "no-store" }),
        fetch("/api/admin/analitica/navegacion", { cache: "no-store" }),
      ]);
      if (quotesRes.ok) {
        const data = (await quotesRes.json()) as { requests?: QuoteRequestRecordLite[] };
        const backend = (data.requests ?? []).map(backendToSmartQuote);
        saveSmartQuoteRequests(backend);
        setQuotes(backend);
      } else {
        setError("No se pudieron leer las cotizaciones recibidas.");
      }
      if (navRes.ok) {
        const data = (await navRes.json()) as { visitantes?: RecorridoVisitante[] };
        setIncompletos(recorridosIncompletos(data.visitantes ?? []));
      }
    } catch {
      setError("Error de conexión al cargar la bandeja.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const needle = query.trim().toLowerCase();

  const filteredQuotes = useMemo(() => {
    const scoped =
      vista === "recibidas"
        ? quotes.filter((quote) => !isQuoteConfirmed(quote))
        : vista === "confirmadas"
          ? quotes.filter(isQuoteConfirmed)
          : [];
    if (!needle) return scoped;
    return scoped.filter((quote) =>
      [quote.clientName, quote.email, quote.phone, quote.zone, quote.size, quote.style]
        .join(" ")
        .toLowerCase()
        .includes(needle),
    );
  }, [quotes, vista, needle]);

  const filteredIncompletos = useMemo(() => {
    if (vista !== "incompletas") return [];
    if (!needle) return incompletos;
    return incompletos.filter((row) =>
      [
        visitorLabel(row.persona_nombre, row.id_visitante),
        row.ultimo_paso_etiqueta,
        row.ciudad,
        row.pais,
      ]
        .join(" ")
        .toLowerCase()
        .includes(needle),
    );
  }, [incompletos, vista, needle]);

  const counts = {
    recibidas: quotes.filter((quote) => !isQuoteConfirmed(quote)).length,
    confirmadas: quotes.filter(isQuoteConfirmed).length,
    incompletas: incompletos.length,
  };

  return (
    <div className="space-y-6">
      <AdminPageHeader
        kicker="Bandeja"
        title="Cotizaciones"
        description="Las que ya envió la gente, las que confirmó, y las que empezaron el flujo y se quedaron a mitad."
        actions={
          <AdminDangerPurge
            categoria="cotizaciones"
            onPurged={() => {
              saveSmartQuoteRequests([]);
              setQuotes([]);
              void load();
            }}
          />
        }
      />

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap gap-1 rounded-xl border border-white/10 bg-white/[0.03] p-1">
          <VistaTab href="/admin/cotizaciones" active={vista === "recibidas"} count={counts.recibidas}>
            Recibidas
          </VistaTab>
          <VistaTab
            href="/admin/cotizaciones?vista=confirmadas"
            active={vista === "confirmadas"}
            count={counts.confirmadas}
          >
            Confirmadas
          </VistaTab>
          <VistaTab
            href="/admin/cotizaciones?vista=incompletas"
            active={vista === "incompletas"}
            count={counts.incompletas}
          >
            En curso
          </VistaTab>
        </div>

        <label className="relative block sm:w-72">
          <Search className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-zinc-500" strokeWidth={1.5} />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Buscar por nombre, correo o zona"
            className="w-full rounded-xl border border-white/10 bg-black/30 py-2.5 pr-3 pl-9 text-sm text-zinc-100 outline-none placeholder:text-zinc-600 focus:border-amber-500/40"
          />
        </label>
      </div>

      {error ? <AdminError message={error} /> : null}
      {loading ? <AdminSkeleton rows={5} /> : null}

      {!loading && vista !== "incompletas" ? (
        filteredQuotes.length === 0 ? (
          <AdminEmptyState
            title={vista === "confirmadas" ? "Nadie ha confirmado todavía" : "No hay cotizaciones por atender"}
            body={
              vista === "confirmadas"
                ? "Cuando un proyecto pase a pagado o a asesoría reservada, queda en esta lista con el brief completo."
                : "Las solicitudes que cierran el cotizador aparecen aquí con nombre, contacto y estado."
            }
          />
        ) : (
          <ul className="divide-y divide-white/8 border-t border-white/10">
            {filteredQuotes.map((quote) => (
              <li key={quote.id}>
                <Link
                  href={`/admin/cotizaciones/${quote.id}`}
                  className="grid gap-2 py-4 transition hover:bg-white/[0.03] sm:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)_auto] sm:items-center"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-zinc-50">{quote.clientName}</p>
                    <p className="mt-0.5 truncate text-xs text-zinc-500">
                      {quote.phone} · {quote.email}
                    </p>
                  </div>
                  <div className="min-w-0">
                    <p className="truncate text-sm text-zinc-200">
                      {quote.size} · {quote.zone}
                    </p>
                    <p className="mt-0.5 truncate text-xs text-zinc-500">
                      {quote.style || "Sin estilo"} · {quote.estimateTotal || "Sin estimado"}
                    </p>
                  </div>
                  <div className="flex items-center justify-between gap-3 sm:flex-col sm:items-end">
                    <StatusPill className={QUOTE_STATUS_TONE[quote.status]}>
                      {QUOTE_STATUS_SHORT[quote.status]}
                    </StatusPill>
                    <p className="font-mono text-[11px] text-zinc-500">{formatRelative(quote.createdAt)}</p>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )
      ) : null}

      {!loading && vista === "incompletas" ? (
        filteredIncompletos.length === 0 ? (
          <AdminEmptyState
            title="Nadie quedó a mitad del flujo"
            body="Si alguien entra a cotizar y no llega al cierre, aparece aquí con el último paso que alcanzó."
          />
        ) : (
          <ul className="divide-y divide-white/8 border-t border-white/10">
            {filteredIncompletos.map((row) => (
              <li key={row.id_visitante} className="grid gap-2 py-4 sm:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)_auto] sm:items-center">
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-zinc-50">
                    {visitorLabel(row.persona_nombre, row.id_visitante)}
                  </p>
                  <p className="mt-0.5 truncate text-xs text-zinc-500">
                    {row.ciudad}, {row.pais} · {row.dispositivo}
                  </p>
                </div>
                <div className="min-w-0">
                  <p className="text-sm text-zinc-200">Se detuvo en {row.ultimo_paso_etiqueta}</p>
                  <p className="mt-0.5 font-mono text-[11px] text-zinc-500">
                    {row.vistas} vistas · {formatDuracion(row.duracion_ms)}
                  </p>
                </div>
                <p className="font-mono text-[11px] text-zinc-500 sm:text-right">
                  {formatRelative(row.ultimo_en)}
                </p>
              </li>
            ))}
          </ul>
        )
      ) : null}
    </div>
  );
}

function VistaTab({
  href,
  active,
  count,
  children,
}: {
  href: string;
  active: boolean;
  count: number;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      className={cn(
        "inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-semibold transition active:scale-[0.98]",
        active ? "bg-white/10 text-zinc-50" : "text-zinc-400 hover:text-zinc-200",
      )}
    >
      {children}
      <span className="font-mono text-[11px] tabular-nums text-zinc-500">{count}</span>
    </Link>
  );
}
