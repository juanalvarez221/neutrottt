"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { formatDuracion } from "@/shared/lib/analitica/fechaEstudio";
import type { RecorridoVisitante } from "@/shared/lib/analitica/navegacion";
import { cn } from "@/shared/lib/cn";
import {
  AdminEmptyState,
  AdminError,
  AdminPageHeader,
  AdminSkeleton,
} from "@/widgets/admin/AdminPrimitives";
import { AdminDangerPurge } from "@/widgets/admin/AdminDangerPurge";
import { formatRelative, visitorLabel } from "@/widgets/admin/adminFormat";
import {
  abandonoPorPaso,
  clasificarRecorrido,
  PASOS_COTIZACION,
  recorridosIncompletos,
  type RecorridoCotizacion,
} from "@/widgets/admin/quoteJourney";

export function QuoteJourneysPanel() {
  const [rows, setRows] = useState<RecorridoCotizacion[]>([]);
  const [incompletos, setIncompletos] = useState<RecorridoCotizacion[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/analitica/navegacion", { cache: "no-store" });
      const payload = (await res.json()) as { visitantes?: RecorridoVisitante[]; error?: string };
      if (!res.ok) {
        setError(payload.error ?? "No se pudieron leer los recorridos.");
        return;
      }
      const visitantes = payload.visitantes ?? [];
      setRows(visitantes.map(clasificarRecorrido).filter((row) => row.en_cotizacion));
      setIncompletos(recorridosIncompletos(visitantes));
    } catch {
      setError("Error de conexión al leer los recorridos.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const abandono = useMemo(() => abandonoPorPaso(incompletos), [incompletos]);
  const maxAbandono = abandono[0] ? Math.max(...abandono.map((row) => row.total)) : 0;
  const selectedRow = rows.find((row) => row.id_visitante === selected) ?? incompletos[0] ?? null;

  return (
    <div className="space-y-8">
      <AdminPageHeader
        kicker="Embudo vivo"
        title="Recorridos"
        description="Quién entró a cotizar, hasta qué paso llegó y en qué pantalla se quedó. Los nombres aparecen cuando esa persona dejó datos."
        actions={<AdminDangerPurge categoria="recorridos" onPurged={() => void load()} />}
      />

      {error ? <AdminError message={error} /> : null}
      {loading ? <AdminSkeleton rows={6} /> : null}

      {!loading && rows.length === 0 ? (
        <AdminEmptyState
          title="Aún no hay recorridos de cotización"
          body="En cuanto alguien abra el cotizador, aquí verás el paso exacto donde se detuvo."
        />
      ) : null}

      {!loading && rows.length > 0 ? (
        <>
          <section>
            <h2 className="text-sm font-semibold uppercase tracking-[0.14em] text-zinc-300">
              Dónde se quedan
            </h2>
            <p className="mt-1 text-xs text-zinc-500">
              {incompletos.length} flujos abiertos de {rows.length} personas que empezaron a cotizar.
            </p>
            <div className="mt-4 divide-y divide-white/8 border-t border-white/10">
              {PASOS_COTIZACION.map((paso) => {
                const found = abandono.find((row) => row.etiqueta === paso.etiqueta);
                const total = found?.total ?? 0;
                const pct = maxAbandono > 0 ? Math.max(total > 0 ? 6 : 0, Math.round((total / maxAbandono) * 100)) : 0;
                return (
                  <div key={paso.clave} className="grid grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)] items-center gap-3 py-2.5">
                    <div>
                      <p className="text-sm text-zinc-100">{paso.etiqueta}</p>
                      <p className="font-mono text-[11px] text-zinc-500">Paso {paso.orden}</p>
                    </div>
                    <div>
                      <div className="h-1.5 overflow-hidden rounded-full bg-white/8">
                        <div
                          className="h-full rounded-full bg-[rgba(var(--rgb-honey),0.75)]"
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                      <p className="mt-1 text-right font-mono text-[11px] tabular-nums text-zinc-400">
                        {total} {total === 1 ? "persona" : "personas"}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>

          <div className="grid gap-8 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)]">
            <section>
              <h2 className="text-sm font-semibold uppercase tracking-[0.14em] text-zinc-300">
                Personas
              </h2>
              <ul className="mt-4 divide-y divide-white/8 border-t border-white/10">
                {incompletos.map((row) => {
                  const active = selectedRow?.id_visitante === row.id_visitante;
                  return (
                    <li key={row.id_visitante}>
                      <button
                        type="button"
                        onClick={() => setSelected(row.id_visitante)}
                        className={cn(
                          "flex w-full items-start justify-between gap-3 py-3.5 text-left transition hover:bg-white/[0.03] active:scale-[0.99]",
                          active && "bg-white/[0.04]",
                        )}
                      >
                        <div className="min-w-0">
                          <p className="truncate text-sm font-semibold text-zinc-50">
                            {visitorLabel(row.persona_nombre, row.id_visitante)}
                          </p>
                          <p className="mt-0.5 truncate text-xs text-zinc-500">
                            Último paso: {row.ultimo_paso_etiqueta}
                          </p>
                        </div>
                        <p className="shrink-0 font-mono text-[11px] text-zinc-500">
                          {formatRelative(row.ultimo_en)}
                        </p>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </section>

            <section>
              <h2 className="text-sm font-semibold uppercase tracking-[0.14em] text-zinc-300">
                Detalle del recorrido
              </h2>
              {selectedRow ? (
                <div className="mt-4 border-t border-white/10 pt-4">
                  <p className="text-lg font-semibold text-zinc-50">
                    {visitorLabel(selectedRow.persona_nombre, selectedRow.id_visitante)}
                  </p>
                  <p className="mt-1 text-sm text-zinc-400">
                    {selectedRow.ciudad}, {selectedRow.pais} · {selectedRow.dispositivo} ·{" "}
                    {formatDuracion(selectedRow.duracion_ms)}
                  </p>
                  <ol className="mt-5 space-y-3">
                    {selectedRow.pasos
                      .filter(
                        (paso) =>
                          paso.tipo_evento === "vista_pagina" ||
                          paso.tipo_evento === "paso_cotizacion" ||
                          paso.tipo_evento === "zona_corporal",
                      )
                      .map((paso, index) => (
                        <li key={`${paso.ocurrido_en}-${index}`} className="grid grid-cols-[auto_minmax(0,1fr)] gap-3">
                          <span className="mt-1 h-1.5 w-1.5 rounded-full bg-amber-300/80" />
                          <div className="min-w-0">
                            <p className="text-sm text-zinc-100">
                              {paso.tipo_evento === "zona_corporal"
                                ? paso.etiqueta ?? paso.valor ?? "Zona corporal"
                                : paso.etiqueta_ruta}
                            </p>
                            <p className="font-mono text-[11px] text-zinc-500">
                              {formatRelative(paso.ocurrido_en)}
                            </p>
                          </div>
                        </li>
                      ))}
                  </ol>
                </div>
              ) : (
                <AdminEmptyState
                  title="Elige una persona"
                  body="El hilo de páginas y zonas queda a la derecha para no mezclar listados."
                />
              )}
            </section>
          </div>
        </>
      ) : null}
    </div>
  );
}
