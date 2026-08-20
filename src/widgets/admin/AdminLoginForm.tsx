"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

function sanitizeNext(next: string | null): string {
  if (!next || !next.startsWith("/") || next.startsWith("//") || next.includes("\\")) {
    return "/admin";
  }
  if (!next.startsWith("/admin") || next.startsWith("/admin/login")) return "/admin";
  return next;
}

export function AdminLoginForm() {
  const router = useRouter();
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
        credentials: "same-origin",
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

      router.replace(nextPath);
      router.refresh();
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
        className="flex w-full max-w-[17rem] flex-col gap-3"
      >
        <label htmlFor="admin-email" className="sr-only">
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
          className="w-full border-0 border-b border-zinc-700/80 bg-transparent py-2.5 text-sm text-zinc-300 outline-none transition focus:border-zinc-500"
        />

        <label htmlFor="admin-password" className="sr-only">
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
          className="w-full border-0 border-b border-zinc-700/80 bg-transparent py-2.5 text-sm text-zinc-300 outline-none transition focus:border-zinc-500"
        />

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
