"use client";

import { useState } from "react";
import { useSearchParams } from "next/navigation";

function sanitizeNext(next: string | null): string {
  if (!next || !next.startsWith("/") || next.startsWith("//") || next.includes("\\")) {
    return "/admin";
  }
  if (!next.startsWith("/admin") || next.startsWith("/admin/login")) return "/admin";
  return next;
}

export function AdminLoginForm() {
  const searchParams = useSearchParams();
  const nextPath = sanitizeNext(searchParams.get("next"));

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!email.trim() || !password || submitting) return;
    setSubmitting(true);
    setError(false);

    try {
      const response = await fetch("/api/admin/auth/login", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: email.trim(),
          password,
        }),
      });

      if (!response.ok) {
        setError(true);
        setSubmitting(false);
        return;
      }

      window.location.assign(nextPath);
    } catch {
      setError(true);
      setSubmitting(false);
    }
  };

  return (
    <main className="flex min-h-[100dvh] items-center justify-center px-4">
      <form
        onSubmit={handleSubmit}
        autoComplete="on"
        className="flex w-full max-w-[18rem] flex-col gap-3"
      >
        <div className="rounded-xl border border-white/[0.08] bg-white/[0.03] px-3.5 py-3">
          <label htmlFor="admin-email" className="block text-[11px] tracking-[0.14em] text-zinc-500 uppercase">
            Correo
          </label>
          <input
            id="admin-email"
            name="email"
            type="text"
            autoComplete="username"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            maxLength={254}
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            className="mt-1.5 w-full border-0 bg-transparent py-1 text-sm text-zinc-200 outline-none"
          />
        </div>

        <div className="rounded-xl border border-white/[0.08] bg-white/[0.03] px-3.5 py-3">
          <label htmlFor="admin-password" className="block text-[11px] tracking-[0.14em] text-zinc-500 uppercase">
            Contraseña
          </label>
          <input
            id="admin-password"
            name="password"
            type="password"
            autoComplete="current-password"
            maxLength={256}
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            className="mt-1.5 w-full border-0 bg-transparent py-1 text-sm text-zinc-200 outline-none"
          />
        </div>

        <button
          type="submit"
          disabled={submitting || !email.trim() || !password}
          className="mt-4 self-start text-[11px] tracking-[0.18em] text-zinc-600 uppercase transition hover:text-zinc-400 active:scale-[0.98] disabled:opacity-40"
        >
          Entrar
        </button>

        {error ? (
          <p className="text-[11px] text-zinc-600" role="alert">
            No se pudo entrar.
          </p>
        ) : null}
      </form>
    </main>
  );
}
