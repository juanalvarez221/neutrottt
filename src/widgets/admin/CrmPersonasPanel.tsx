"use client";

import { useCallback, useEffect, useState } from "react";
import { UserRound } from "lucide-react";
import { Card } from "@/shared/ui/Card";
import { cn } from "@/shared/lib/cn";
import { ETIQUETAS_ESTADO, type EstadoPersona, type Persona } from "@/shared/lib/crm/tipos";

const ESTADO_STYLE: Record<EstadoPersona, string> = {
  crudo: "border-zinc-500/30 bg-zinc-500/10 text-zinc-300",
  prospecto: "border-sky-500/30 bg-sky-500/10 text-sky-200",
  cliente: "border-emerald-500/30 bg-emerald-500/10 text-emerald-200",
};

export function CrmPersonasPanel() {
  const [personas, setPersonas] = useState<Persona[]>([]);
  const [configurada, setConfigurada] = useState<boolean | null>(null);
  const [mensaje, setMensaje] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const res = await fetch("/api/admin/crm/personas", { cache: "no-store" });
      const data = (await res.json()) as {
        personas?: Persona[];
        configurada?: boolean;
        mensaje?: string;
        error?: string;
      };
      if (!res.ok) throw new Error(data.error ?? "No se pudo cargar el CRM.");
      setPersonas(data.personas ?? []);
      setConfigurada(Boolean(data.configurada));
      setMensaje(data.mensaje ?? null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo cargar el CRM.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const promover = async (id: string, evento: "acuerdo_asesoria" | "cotizacion_aceptada") => {
    setBusyId(id);
    try {
      const res = await fetch(`/api/admin/crm/personas/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ evento }),
      });
      if (!res.ok) throw new Error("No se pudo actualizar.");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo actualizar.");
    } finally {
      setBusyId(null);
    }
  };

  const crudos = personas.filter((p) => p.estado === "crudo").length;
  const prospectos = personas.filter((p) => p.estado === "prospecto").length;
  const clientes = personas.filter((p) => p.estado === "cliente").length;

  return (
    <Card>
      <div className="p-4 sm:p-5">
        <div className="flex items-center gap-2">
          <UserRound className="h-4 w-4 text-amber-300" />
          <h2 className="text-sm font-semibold text-zinc-50">Personas</h2>
        </div>
        <p className="mt-1 text-xs text-zinc-500">
          Crudo al capturar datos. Prospecto al cotizar o agendar. Cliente al aceptar o cerrar acuerdo.
        </p>

        <div className="mt-3 grid grid-cols-3 gap-2 font-mono text-center">
          <div className="rounded-lg border border-white/10 px-2 py-2">
            <p className="text-lg text-zinc-100">{loading ? "—" : crudos}</p>
            <p className="text-[10px] uppercase tracking-wider text-zinc-500">Crudos</p>
          </div>
          <div className="rounded-lg border border-white/10 px-2 py-2">
            <p className="text-lg text-zinc-100">{loading ? "—" : prospectos}</p>
            <p className="text-[10px] uppercase tracking-wider text-zinc-500">Prospectos</p>
          </div>
          <div className="rounded-lg border border-white/10 px-2 py-2">
            <p className="text-lg text-zinc-100">{loading ? "—" : clientes}</p>
            <p className="text-[10px] uppercase tracking-wider text-zinc-500">Clientes</p>
          </div>
        </div>

        {loading ? (
          <div className="mt-3 space-y-2">
            <div className="h-16 animate-pulse rounded-lg bg-white/5" />
            <div className="h-16 animate-pulse rounded-lg bg-white/5" />
          </div>
        ) : null}

        {error ? <p className="mt-3 text-xs text-rose-300">{error}</p> : null}
        {configurada === false && mensaje ? (
          <p className="mt-3 text-xs text-amber-200/90">{mensaje}</p>
        ) : null}

        {!loading && configurada && personas.length === 0 ? (
          <p className="mt-3 text-xs text-zinc-500">
            Aún no hay personas. Entran solas cuando alguien deja nombre y contacto en cotización.
          </p>
        ) : null}

        <div className="mt-3 space-y-2">
          {personas.map((persona) => (
            <div
              key={persona.id}
              className="rounded-lg border border-white/10 bg-white/[0.03] px-3 py-3"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-zinc-100">{persona.nombre}</p>
                  <p className="truncate font-mono text-[11px] text-zinc-500">
                    {persona.whatsapp || "sin WhatsApp"} · {persona.email || "sin correo"}
                  </p>
                </div>
                <span
                  className={cn(
                    "shrink-0 rounded-full border px-2 py-0.5 font-mono text-[10px] uppercase tracking-wider",
                    ESTADO_STYLE[persona.estado],
                  )}
                >
                  {ETIQUETAS_ESTADO[persona.estado]}
                </span>
              </div>
              {persona.estado !== "cliente" ? (
                <div className="mt-2 flex flex-wrap gap-2">
                  {persona.estado === "prospecto" || persona.estado === "crudo" ? (
                    <button
                      type="button"
                      disabled={busyId === persona.id}
                      onClick={() => void promover(persona.id, "acuerdo_asesoria")}
                      className="rounded-lg border border-white/10 px-2 py-1 text-[11px] text-zinc-300 transition hover:bg-white/10 disabled:opacity-50"
                    >
                      Acuerdo en asesoría
                    </button>
                  ) : null}
                  <button
                    type="button"
                    disabled={busyId === persona.id}
                    onClick={() => void promover(persona.id, "cotizacion_aceptada")}
                    className="rounded-lg border border-emerald-500/20 px-2 py-1 text-[11px] text-emerald-100 transition hover:bg-emerald-500/10 disabled:opacity-50"
                  >
                    Aceptó cotización
                  </button>
                </div>
              ) : null}
            </div>
          ))}
        </div>
      </div>
    </Card>
  );
}
