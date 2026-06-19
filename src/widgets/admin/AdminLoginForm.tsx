"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { motion } from "framer-motion";
import { KeyRound, Loader2, ShieldCheck } from "lucide-react";

function sanitizeNext(next: string | null): string {
  if (!next || !next.startsWith("/admin")) return "/admin";
  if (next.startsWith("/admin/login")) return "/admin";
  return next;
}

export function AdminLoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const nextPath = sanitizeNext(searchParams.get("next"));

  const [pin, setPin] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!pin.trim() || submitting) return;
    setSubmitting(true);
    setError("");

    try {
      const response = await fetch("/api/admin/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pin: pin.trim() }),
      });
      const payload = (await response.json().catch(() => ({}))) as { error?: string };

      if (!response.ok) {
        setError(payload.error ?? "No se pudo iniciar sesión.");
        setSubmitting(false);
        return;
      }

      router.replace(nextPath);
      router.refresh();
    } catch {
      setError("Error de conexión. Intenta de nuevo.");
      setSubmitting(false);
    }
  };

  return (
    <main className="relative isolate flex min-h-[100dvh] items-center justify-center overflow-hidden bg-background px-4 py-12 text-zinc-100">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(620px_320px_at_18%_-8%,rgba(245,158,11,0.16),transparent_62%),radial-gradient(520px_300px_at_92%_108%,rgba(217,119,6,0.12),transparent_60%)]"
      />

      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
        className="w-full max-w-sm rounded-3xl border border-white/10 bg-white/[0.04] p-7 shadow-[0_30px_80px_-50px_rgba(0,0,0,0.95)] backdrop-blur-xl shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]"
      >
        <span className="inline-flex h-11 w-11 items-center justify-center rounded-2xl border border-amber-500/30 bg-amber-500/10 text-amber-200">
          <ShieldCheck className="h-5 w-5" strokeWidth={1.5} />
        </span>

        <p className="mt-5 text-[11px] font-semibold uppercase tracking-[0.18em] text-amber-200/80">
          Acceso reservado
        </p>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight text-zinc-50">
          Estudio Neutrottt
        </h1>
        <p className="mt-2 text-sm leading-relaxed text-zinc-400">
          Este panel es privado. Ingresa tu clave para gestionar agenda y cotizaciones.
        </p>

        <form onSubmit={handleSubmit} className="mt-6 flex flex-col gap-2">
          <label htmlFor="admin-pin" className="text-xs font-medium text-zinc-400">
            Clave de acceso
          </label>
          <div className="relative">
            <KeyRound
              className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500"
              strokeWidth={1.5}
            />
            <input
              id="admin-pin"
              type="password"
              inputMode="numeric"
              autoComplete="current-password"
              value={pin}
              onChange={(event) => setPin(event.target.value)}
              placeholder="••••••"
              className="w-full rounded-xl border border-white/10 bg-black/40 py-3 pl-9 pr-3 text-sm text-zinc-50 outline-none transition focus:border-amber-500/40 focus:bg-black/55 placeholder:text-zinc-600"
            />
          </div>

          {error ? (
            <p className="mt-1 rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-xs text-rose-200">
              {error}
            </p>
          ) : null}

          <button
            type="submit"
            disabled={submitting || !pin.trim()}
            className="mt-3 inline-flex items-center justify-center gap-2 rounded-xl border border-amber-500/30 bg-amber-600/20 px-4 py-3 text-sm font-semibold text-amber-50 transition hover:bg-amber-600/30 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50"
          >
            {submitting ? <Loader2 className="h-4 w-4 animate-spin" strokeWidth={1.5} /> : null}
            Entrar al panel
          </button>
        </form>
      </motion.div>
    </main>
  );
}
