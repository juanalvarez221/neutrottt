"use client";

import { useState } from "react";
import { Trash2 } from "lucide-react";
import {
  PURGE_CATEGORIES,
  confirmationMatches,
  type PurgeCategory,
} from "@/shared/lib/admin/purgeCategories";
import { cn } from "@/shared/lib/cn";

export function AdminDangerPurge({
  categoria,
  onPurged,
}: {
  categoria: PurgeCategory;
  onPurged?: () => void;
}) {
  const meta = PURGE_CATEGORIES[categoria];
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState("");
  const [ack, setAck] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const ready = confirmationMatches(categoria, typed) && ack && !busy;

  async function submit() {
    if (!ready) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/datos/vaciar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ categoria, confirmacion: typed.trim() }),
      });
      const payload = (await res.json()) as { error?: string };
      if (!res.ok) {
        setError(payload.error ?? "No se pudo vaciar.");
        return;
      }
      setTyped("");
      setAck(false);
      setOpen(false);
      onPurged?.();
    } catch {
      setError("Error de conexión al vaciar.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="w-full max-w-sm">
      {!open ? (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="inline-flex items-center gap-2 rounded-xl border border-rose-500/25 bg-rose-950/30 px-4 py-2.5 text-sm font-semibold text-rose-100 transition hover:bg-rose-950/50 active:scale-[0.98]"
        >
          <Trash2 className="h-4 w-4" strokeWidth={1.6} />
          {meta.title}
        </button>
      ) : (
        <div className="rounded-2xl border border-rose-500/25 bg-rose-950/25 p-4">
          <p className="text-sm font-semibold text-rose-50">{meta.title}</p>
          <p className="mt-1 text-xs leading-relaxed text-rose-100/70">{meta.hint}</p>
          <p className="mt-3 text-xs text-rose-100/80">
            Escribe exactamente{" "}
            <span className="font-mono text-[11px] text-rose-50">{meta.phrase}</span>
          </p>
          <label className="mt-2 block">
            <span className="sr-only">Frase de confirmación</span>
            <input
              value={typed}
              onChange={(event) => setTyped(event.target.value)}
              autoComplete="off"
              spellCheck={false}
              className="w-full rounded-xl border border-white/15 bg-black/40 px-3 py-2 font-mono text-xs text-zinc-100 outline-none placeholder:text-zinc-600 focus:border-rose-400/40"
              placeholder={meta.phrase}
            />
          </label>
          <label className="mt-3 flex items-start gap-2 text-xs leading-relaxed text-rose-100/80">
            <input
              type="checkbox"
              checked={ack}
              onChange={(event) => setAck(event.target.checked)}
              className="mt-0.5"
            />
            Entiendo que esta acción no se puede deshacer.
          </label>
          {error ? <p className="mt-2 text-xs text-rose-200">{error}</p> : null}
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              disabled={!ready}
              onClick={() => void submit()}
              className={cn(
                "rounded-xl border px-3 py-2 text-xs font-semibold transition active:scale-[0.98]",
                ready
                  ? "border-rose-400/40 bg-rose-600/30 text-rose-50 hover:bg-rose-600/45"
                  : "border-white/10 bg-white/5 text-zinc-500",
              )}
            >
              {busy ? "Vaciando" : "Confirmar vaciado"}
            </button>
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                setTyped("");
                setAck(false);
                setError(null);
              }}
              className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs font-semibold text-zinc-300 transition hover:bg-white/10"
            >
              Cancelar
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
