"use client";

import { useCallback, useEffect, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  CircleDashed,
  Loader2,
  Play,
  RefreshCw,
  Wifi,
} from "lucide-react";

type IntegrationState = "ok" | "preview" | "disabled" | "error";

type IntegrationCheck = {
  id: string;
  label: string;
  state: IntegrationState;
  detail: string;
  hint?: string;
};

type HealthPayload = {
  ok?: boolean;
  mode?: "live" | "preview" | "error";
  checks?: IntegrationCheck[];
  error?: string;
};

function stateIcon(state: IntegrationState) {
  if (state === "ok") return <CheckCircle2 className="h-4 w-4 text-emerald-300" />;
  if (state === "error") return <AlertTriangle className="h-4 w-4 text-rose-300" />;
  if (state === "disabled") return <CircleDashed className="h-4 w-4 text-zinc-500" />;
  return <CircleDashed className="h-4 w-4 text-amber-300" />;
}

function stateBadgeClass(state: IntegrationState) {
  if (state === "ok") return "border-emerald-500/25 bg-emerald-500/10 text-emerald-200";
  if (state === "error") return "border-rose-500/25 bg-rose-500/10 text-rose-200";
  if (state === "disabled") return "border-zinc-500/25 bg-zinc-500/10 text-zinc-400";
  return "border-amber-500/25 bg-amber-500/10 text-amber-200";
}

function stateLabel(state: IntegrationState) {
  if (state === "ok") return "Activo";
  if (state === "error") return "Error";
  if (state === "disabled") return "Off";
  return "Preview";
}

export function AdvisoryIntegrationsPanel({
  onRemindersRun,
}: {
  onRemindersRun?: (result: { remindersSent: number; slotsReleased: number }) => void;
}) {
  const [health, setHealth] = useState<HealthPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [runningReminders, setRunningReminders] = useState(false);
  const [actionMessage, setActionMessage] = useState("");

  const loadHealth = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch("/api/admin/advisory/health", { cache: "no-store" });
      const payload = (await response.json()) as HealthPayload;
      if (!response.ok) {
        throw new Error(payload.error ?? "No se pudo revisar integraciones.");
      }
      setHealth(payload);
    } catch (error) {
      setHealth({
        ok: false,
        mode: "error",
        checks: [],
        error: error instanceof Error ? error.message : "Error de integraciones.",
      });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadHealth();
  }, [loadHealth]);

  const runReminders = async () => {
    setRunningReminders(true);
    setActionMessage("");
    try {
      const response = await fetch("/api/admin/advisory/run-reminders", { method: "POST" });
      const payload = (await response.json()) as {
        ok?: boolean;
        remindersSent?: number;
        slotsReleased?: number;
        error?: string;
      };
      if (!response.ok) {
        throw new Error(payload.error ?? "No se pudieron ejecutar recordatorios.");
      }
      const remindersSent = payload.remindersSent ?? 0;
      const slotsReleased = payload.slotsReleased ?? 0;
      setActionMessage(
        `Listo: ${remindersSent} recordatorio(s) enviado(s), ${slotsReleased} cupo(s) liberado(s). Revisa la consola del servidor si estás en modo preview.`,
      );
      onRemindersRun?.({ remindersSent, slotsReleased });
    } catch (error) {
      setActionMessage(error instanceof Error ? error.message : "Error al ejecutar recordatorios.");
    } finally {
      setRunningReminders(false);
    }
  };

  return (
    <div className="rounded-2xl border border-white/10 bg-black/25 p-4 sm:p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Wifi className="h-4 w-4 text-amber-300" />
          <h3 className="text-sm font-semibold text-zinc-50">Estado de integraciones</h3>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => void loadHealth()}
            disabled={loading}
            className="inline-flex items-center gap-1 rounded-lg border border-white/10 bg-white/5 px-2.5 py-1.5 text-xs font-semibold text-zinc-200 transition hover:bg-white/10 disabled:opacity-50"
          >
            {loading ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <RefreshCw className="h-3.5 w-3.5" />
            )}
            Revisar
          </button>
          <button
            type="button"
            onClick={() => void runReminders()}
            disabled={runningReminders}
            className="inline-flex items-center gap-1 rounded-lg border border-amber-500/25 bg-amber-500/10 px-2.5 py-1.5 text-xs font-semibold text-amber-100 transition hover:bg-amber-500/15 disabled:opacity-50"
          >
            {runningReminders ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Play className="h-3.5 w-3.5" />
            )}
            Ejecutar recordatorios
          </button>
        </div>
      </div>

      <p className="mt-1 text-xs text-zinc-400">
        Google Calendar, correos, WhatsApp y almacenamiento de la agenda.
      </p>

      {health?.error ? (
        <p className="mt-3 rounded-xl border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-sm text-rose-100">
          {health.error}
        </p>
      ) : null}

      {loading && !health?.checks?.length ? (
        <div className="mt-4 flex items-center gap-2 text-sm text-zinc-400">
          <Loader2 className="h-4 w-4 animate-spin" />
          Revisando conexiones…
        </div>
      ) : null}

      {health?.checks?.length ? (
        <ul className="mt-4 space-y-2">
          {health.checks.map((check) => (
            <li
              key={check.id}
              className="rounded-xl border border-white/8 bg-white/[0.02] px-3 py-3"
            >
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="flex items-center gap-2">
                  {stateIcon(check.state)}
                  <span className="text-sm font-medium text-zinc-100">{check.label}</span>
                </div>
                <span
                  className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.12em] ${stateBadgeClass(check.state)}`}
                >
                  {stateLabel(check.state)}
                </span>
              </div>
              <p className="mt-2 text-xs leading-relaxed text-zinc-400">{check.detail}</p>
              {check.hint ? (
                <p className="mt-1.5 text-xs leading-relaxed text-amber-200/80">{check.hint}</p>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}

      {actionMessage ? (
        <p className="mt-3 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs text-zinc-300">
          {actionMessage}
        </p>
      ) : null}
    </div>
  );
}
