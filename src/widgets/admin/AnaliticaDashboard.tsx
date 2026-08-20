"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  Activity,
  ArrowLeft,
  Clock3,
  GitBranch,
  MapPin,
  MousePointer2,
  RefreshCw,
} from "lucide-react";
import { Card } from "@/shared/ui/Card";
import { cn } from "@/shared/lib/cn";
import { ETIQUETAS_CANAL } from "@/shared/lib/analitica/catalogo";
import { formatDuracion, formatPorcentaje } from "@/shared/lib/analitica/fechaEstudio";
import { CAPA_ORO_VACIA, type CapaOro } from "@/shared/lib/analitica/tipos";

function Kpi({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <div className="min-w-0 border-t border-white/10 pt-3 first:border-t-0 first:pt-0 sm:border-t-0 sm:border-l sm:pt-0 sm:pl-5 first:sm:border-l-0 first:sm:pl-0">
      <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-zinc-500">
        {label}
      </p>
      <p className="mt-1 font-mono text-xl font-semibold tabular-nums text-zinc-50 sm:text-2xl">
        {value}
      </p>
      {hint ? <p className="mt-1 text-xs text-zinc-500">{hint}</p> : null}
    </div>
  );
}

function BarRow({
  label,
  sub,
  value,
  max,
  format,
}: {
  label: string;
  sub?: string;
  value: number;
  max: number;
  format: (n: number) => string;
}) {
  const pct = max > 0 ? Math.max(4, Math.round((value / max) * 100)) : 0;
  return (
    <div className="grid grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)] items-center gap-3 py-2.5">
      <div className="min-w-0">
        <p className="truncate text-sm text-zinc-100">{label}</p>
        {sub ? <p className="truncate font-mono text-[11px] text-zinc-500">{sub}</p> : null}
      </div>
      <div className="min-w-0">
        <div className="h-1.5 overflow-hidden rounded-full bg-white/8">
          <div
            className="h-full rounded-full bg-[rgba(var(--rgb-honey),0.75)]"
            style={{ width: `${pct}%` }}
          />
        </div>
        <p className="mt-1 text-right font-mono text-[11px] tabular-nums text-zinc-400">
          {format(value)}
        </p>
      </div>
    </div>
  );
}

export function AnaliticaDashboard() {
  const [oro, setOro] = useState<CapaOro | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [etlBusy, setEtlBusy] = useState(false);

  const cargar = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/analitica/resumen", { cache: "no-store" });
      const payload = (await res.json()) as CapaOro & { error?: string };
      if (!res.ok) {
        setError(payload.error ?? "No se pudieron leer las métricas.");
        setOro(null);
        return;
      }
      setOro(payload);
    } catch {
      setError("Error de conexión con el almacén analítico.");
      setOro(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  async function correrEtl() {
    setEtlBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/analitica/etl", { method: "POST" });
      const payload = (await res.json()) as { error?: string };
      if (!res.ok) {
        setError(payload.error ?? "El ETL no pudo materializar oro.");
        return;
      }
      await cargar();
    } catch {
      setError("No se pudo disparar el ETL.");
    } finally {
      setEtlBusy(false);
    }
  }

  const data = oro ?? CAPA_ORO_VACIA;
  const vacio = !loading && data.kpis.sesiones === 0 && data.corrida.filas_bronce === 0;
  const maxPermanencia = data.permanencia_rutas[0]?.duracion_total_ms ?? 0;
  const maxOrigen = data.origenes_conexion[0]?.sesiones ?? 0;
  const maxInter = data.interacciones[0]?.recuento ?? 0;
  const maxEmbudo = data.embudo[0]?.sesiones ?? 0;

  return (
    <main className="min-h-[100dvh] bg-background px-4 py-6 text-zinc-100 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-[1400px]">
        <div className="flex flex-col gap-6 lg:grid lg:grid-cols-[1.35fr_0.65fr] lg:items-end">
          <div>
            <Link
              href="/admin"
              className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-semibold text-zinc-300 transition hover:bg-white/8 active:scale-[0.98]"
            >
              <ArrowLeft className="h-3.5 w-3.5" strokeWidth={1.5} />
              Panel
            </Link>
            <p className="mt-5 font-mono text-[11px] uppercase tracking-[0.18em] text-amber-200/80">
              Almacén analítico
            </p>
            <h1 className="mt-1 text-3xl font-semibold tracking-tight text-zinc-50 sm:text-4xl">
              Métricas de estudio
            </h1>
            <p className="mt-2 max-w-[65ch] text-sm leading-relaxed text-zinc-400">
              Hechos objetivos de la web: permanencia, interacciones y origen de
              conexión. Sin nombres ni datos personales. Ventana de 30 días,
              zona horaria America/Bogota.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2 lg:justify-end">
            <button
              type="button"
              onClick={() => void correrEtl()}
              disabled={etlBusy}
              className="inline-flex items-center gap-2 rounded-xl border border-amber-500/30 bg-amber-600/15 px-4 py-2.5 text-sm font-semibold text-amber-100 transition hover:bg-amber-600/25 active:scale-[0.98] disabled:opacity-50"
            >
              <RefreshCw
                className={cn("h-4 w-4", etlBusy && "animate-spin")}
                strokeWidth={1.6}
              />
              {etlBusy ? "Materializando" : "Correr ETL"}
            </button>
            <p className="font-mono text-[11px] text-zinc-500">
              {data.generado_en
                ? `Oro ${new Date(data.generado_en).toLocaleString("es-CO")}`
                : "Sin capa oro todavía"}
            </p>
          </div>
        </div>

        {error ? (
          <p className="mt-5 rounded-xl border border-red-500/30 bg-red-950/40 px-4 py-3 text-sm text-red-100">
            {error}
          </p>
        ) : null}

        {loading ? (
          <div className="mt-8 grid gap-3 sm:grid-cols-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <div
                key={i}
                className="h-24 animate-pulse rounded-2xl border border-white/8 bg-white/5"
              />
            ))}
          </div>
        ) : null}

        {vacio ? (
          <Card className="mt-8">
            <div className="px-6 py-14 text-left">
              <Activity className="h-5 w-5 text-amber-300" strokeWidth={1.5} />
              <h2 className="mt-4 text-lg font-semibold text-zinc-50">
                Aún no hay hechos en bronce
              </h2>
              <p className="mt-2 max-w-[60ch] text-sm leading-relaxed text-zinc-400">
                Navega el sitio público (inicio, cotización, selector de zona). El
                colector escribe eventos; el ETL los convierte en métricas. Vuelve
                aquí y pulsa Correr ETL.
              </p>
            </div>
          </Card>
        ) : null}

        {!loading && !vacio ? (
          <>
            <section className="mt-8 rounded-2xl border border-white/10 bg-white/[0.03] px-5 py-5 sm:px-7">
              <div className="grid grid-cols-2 gap-y-5 sm:grid-cols-4">
                <Kpi label="Sesiones" value={String(data.kpis.sesiones)} />
                <Kpi
                  label="Visitantes"
                  value={String(data.kpis.visitas_unicas)}
                />
                <Kpi
                  label="Permanencia media"
                  value={formatDuracion(data.kpis.duracion_media_sesion_ms)}
                />
                <Kpi
                  label="Rebote"
                  value={formatPorcentaje(data.kpis.tasa_rebote)}
                  hint={`${data.kpis.cotizaciones_iniciadas} cotizaciones iniciadas`}
                />
              </div>
            </section>

            <div className="mt-6 grid gap-4 lg:grid-cols-[1.15fr_0.85fr]">
              <Card>
                <div className="p-5 sm:p-6">
                  <div className="flex items-center gap-2">
                    <Clock3 className="h-4 w-4 text-amber-300" strokeWidth={1.6} />
                    <h2 className="text-sm font-semibold uppercase tracking-[0.14em] text-zinc-300">
                      Dónde se quedan
                    </h2>
                  </div>
                  <p className="mt-1 text-xs text-zinc-500">
                    Tiempo acumulado por ruta en los últimos {data.ventana_dias} días.
                  </p>
                  <div className="mt-3 divide-y divide-white/8">
                    {data.permanencia_rutas.slice(0, 8).map((row) => (
                      <BarRow
                        key={row.ruta}
                        label={row.etiqueta}
                        sub={row.ruta}
                        value={row.duracion_total_ms}
                        max={maxPermanencia}
                        format={formatDuracion}
                      />
                    ))}
                  </div>
                </div>
              </Card>

              <Card>
                <div className="p-5 sm:p-6">
                  <div className="flex items-center gap-2">
                    <MapPin className="h-4 w-4 text-amber-300" strokeWidth={1.6} />
                    <h2 className="text-sm font-semibold uppercase tracking-[0.14em] text-zinc-300">
                      Origen de conexión
                    </h2>
                  </div>
                  <p className="mt-1 text-xs text-zinc-500">
                    Ciudad y país según cabeceras de red. Sin dirección IP.
                  </p>
                  <div className="mt-3 divide-y divide-white/8">
                    {data.origenes_conexion.slice(0, 8).map((row) => (
                      <BarRow
                        key={`${row.pais}-${row.ciudad}-${row.region}`}
                        label={`${row.ciudad}, ${row.pais}`}
                        sub={row.region}
                        value={row.sesiones}
                        max={maxOrigen}
                        format={(n) => `${n} sesiones`}
                      />
                    ))}
                  </div>
                </div>
              </Card>
            </div>

            <div className="mt-4 grid gap-4 md:grid-cols-2">
              <Card>
                <div className="p-5 sm:p-6">
                  <div className="flex items-center gap-2">
                    <GitBranch className="h-4 w-4 text-amber-300" strokeWidth={1.6} />
                    <h2 className="text-sm font-semibold uppercase tracking-[0.14em] text-zinc-300">
                      Embudo
                    </h2>
                  </div>
                  <div className="mt-3 divide-y divide-white/8">
                    {data.embudo.map((paso) => (
                      <BarRow
                        key={paso.clave}
                        label={paso.etiqueta}
                        sub={formatPorcentaje(paso.conversion_desde_inicio)}
                        value={paso.sesiones}
                        max={maxEmbudo || 1}
                        format={(n) => `${n} sesiones`}
                      />
                    ))}
                  </div>
                </div>
              </Card>

              <Card>
                <div className="p-5 sm:p-6">
                  <div className="flex items-center gap-2">
                    <MousePointer2 className="h-4 w-4 text-amber-300" strokeWidth={1.6} />
                    <h2 className="text-sm font-semibold uppercase tracking-[0.14em] text-zinc-300">
                      Interacciones
                    </h2>
                  </div>
                  <div className="mt-3 divide-y divide-white/8">
                    {data.interacciones.slice(0, 8).length === 0 ? (
                      <p className="py-6 text-sm text-zinc-500">
                        Todavía no hay clics ni zonas marcadas.
                      </p>
                    ) : (
                      data.interacciones.slice(0, 8).map((row) => (
                        <BarRow
                          key={`${row.etiqueta}-${row.ruta}`}
                          label={row.etiqueta}
                          sub={row.ruta}
                          value={row.recuento}
                          max={maxInter}
                          format={(n) => `${n}`}
                        />
                      ))
                    )}
                  </div>
                </div>
              </Card>
            </div>

            <p className="mt-6 font-mono text-[11px] leading-relaxed text-zinc-600">
              Bronce {data.corrida.filas_bronce} hechos · Plata{" "}
              {data.corrida.sesiones_plata} sesiones · ETL{" "}
              {data.corrida.duracion_ms} ms · canales:{" "}
              {Object.values(ETIQUETAS_CANAL).join(" · ")}
            </p>
          </>
        ) : null}
      </div>
    </main>
  );
}
