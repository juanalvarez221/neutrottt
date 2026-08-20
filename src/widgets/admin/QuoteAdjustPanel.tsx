"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  ArrowLeft,
  CircleDollarSign,
  Loader2,
  Send,
} from "lucide-react";
import { Card } from "@/shared/ui/Card";
import {
  SESSION_PRICE_SEPARATE_DAYS,
  defaultSessionCountFromEstimate,
  formatCop,
} from "@/shared/lib/quoteSessionPricing";

type QuoteRecord = {
  id: string;
  clientName: string;
  whatsapp: string;
  email: string;
  projectSize: string;
  bodyPlacement: string;
  referenceNotes?: string;
  style?: string;
  connectionAnswers?: {
    referral?: string;
    values?: string;
    collaboration?: string;
    purpose?: string;
  };
  estimateSessions?: string;
  estimatePerSession?: string;
  estimateTotal?: string;
  statusLabel: string;
  createdAt: string;
  officialSessionPrice?: number;
  officialSessionCount?: number;
  officialNote?: string;
  officialSentAt?: string;
};

type LoadState = "loading" | "ready" | "missing" | "error";

function Detail({ label, value }: { label: string; value?: string | null }) {
  if (!value?.trim()) return null;
  return (
    <div className="border-t border-white/10 py-3 first:border-t-0 first:pt-0">
      <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-zinc-500">{label}</p>
      <p className="mt-1 text-sm leading-relaxed text-zinc-100">{value.trim()}</p>
    </div>
  );
}

export function QuoteAdjustPanel({ quoteId }: { quoteId: string }) {
  const [state, setState] = useState<LoadState>("loading");
  const [record, setRecord] = useState<QuoteRecord | null>(null);
  const [sessionPrice, setSessionPrice] = useState(SESSION_PRICE_SEPARATE_DAYS);
  const [sessionCount, setSessionCount] = useState(3);
  const [note, setNote] = useState("");
  const [error, setError] = useState("");
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setState("loading");
      setError("");
      try {
        const response = await fetch(`/api/admin/quote-requests/${encodeURIComponent(quoteId)}`, {
          cache: "no-store",
        });
        const payload = (await response.json()) as { request?: QuoteRecord; error?: string };
        if (cancelled) return;
        if (response.status === 404) {
          setState("missing");
          return;
        }
        if (!response.ok || !payload.request) {
          setError(payload.error ?? "No se pudo leer el brief.");
          setState("error");
          return;
        }
        const next = payload.request;
        setRecord(next);
        setSessionPrice(next.officialSessionPrice || SESSION_PRICE_SEPARATE_DAYS);
        setSessionCount(
          next.officialSessionCount || defaultSessionCountFromEstimate(next.estimateSessions),
        );
        setNote(next.officialNote ?? "");
        setSent(Boolean(next.officialSentAt));
        setState("ready");
      } catch {
        if (!cancelled) {
          setError("Error de conexión.");
          setState("error");
        }
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [quoteId]);

  const total = useMemo(() => sessionPrice * sessionCount, [sessionPrice, sessionCount]);
  const connection = record?.connectionAnswers ?? {};

  const sendOfficial = async () => {
    if (sending) return;
    setSending(true);
    setError("");
    try {
      const response = await fetch(`/api/admin/quote-requests/${encodeURIComponent(quoteId)}/send`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sessionPrice,
          sessionCount,
          note: note.trim() || undefined,
        }),
      });
      const payload = (await response.json()) as { error?: string; request?: QuoteRecord };
      if (!response.ok) {
        setError(payload.error ?? "No se pudo enviar la cotización.");
        setSending(false);
        return;
      }
      if (payload.request) setRecord(payload.request);
      setSent(true);
    } catch {
      setError("Error de conexión al enviar.");
    } finally {
      setSending(false);
    }
  };

  return (
    <main className="min-h-[100dvh] bg-background px-4 py-6 text-zinc-100 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-[1400px]">
        <Link
          href="/admin"
          className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-semibold text-zinc-300 transition hover:bg-white/8 active:scale-[0.98]"
        >
          <ArrowLeft className="h-3.5 w-3.5" strokeWidth={1.5} />
          Panel
        </Link>

        <div className="mt-6 grid gap-6 lg:grid-cols-[1.2fr_0.8fr] lg:items-start">
          <div>
            <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-amber-200/80">
              Cotización
            </p>
            <h1 className="mt-1 text-3xl font-semibold tracking-tight text-zinc-50 sm:text-4xl">
              {state === "loading" ? "Cargando brief" : record?.clientName ?? "Brief"}
            </h1>
            <p className="mt-2 max-w-[65ch] text-sm leading-relaxed text-zinc-400">
              Ajusta sesiones y valor. La cifra oficial sale por correo desde Neutrottt.
            </p>

            {state === "loading" ? (
              <div className="mt-8 space-y-3">
                <div className="h-24 animate-pulse rounded-2xl bg-white/5" />
                <div className="h-40 animate-pulse rounded-2xl bg-white/5" />
              </div>
            ) : null}

            {state === "missing" ? (
              <Card className="mt-8">
                <div className="p-5">
                  <p className="text-sm text-zinc-300">Ese brief ya no está. Vuelve al panel.</p>
                </div>
              </Card>
            ) : null}

            {state === "error" ? (
              <Card className="mt-8">
                <div className="flex items-start gap-3 p-5">
                  <AlertTriangle className="mt-0.5 h-4 w-4 text-rose-300" strokeWidth={1.5} />
                  <p className="text-sm text-rose-200">{error}</p>
                </div>
              </Card>
            ) : null}

            {state === "ready" && record ? (
              <Card className="mt-8">
                <div className="p-5 sm:p-6">
                  <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-zinc-500">
                    {record.id} · {record.statusLabel}
                  </p>
                  <div className="mt-4">
                    <Detail label="WhatsApp" value={record.whatsapp} />
                    <Detail label="Correo" value={record.email} />
                    <Detail label="Tamaño" value={record.projectSize} />
                    <Detail label="Zona" value={record.bodyPlacement} />
                    <Detail label="Estilo" value={record.style} />
                    <Detail label="Qué quiere" value={record.referenceNotes} />
                    <Detail label="Llegó por" value={connection.referral} />
                    <Detail label="Valores" value={connection.values} />
                    <Detail label="Colaboración" value={connection.collaboration} />
                    <Detail label="Nota" value={connection.purpose} />
                    <Detail label="Estimado orientativo" value={record.estimateTotal} />
                    <Detail label="Sesiones orientativas" value={record.estimateSessions} />
                  </div>
                </div>
              </Card>
            ) : null}
          </div>

          {state === "ready" && record ? (
            <Card>
              <form
                className="flex flex-col gap-5 p-5 sm:p-6"
                onSubmit={(event) => {
                  event.preventDefault();
                  void sendOfficial();
                }}
              >
                <div className="flex items-center gap-2">
                  <CircleDollarSign className="h-4 w-4 text-amber-300" strokeWidth={1.5} />
                  <h2 className="text-sm font-semibold text-zinc-50">Cifra oficial</h2>
                </div>

                <div className="flex flex-col gap-2">
                  <label htmlFor="session-price" className="text-xs font-medium text-zinc-400">
                    Precio por sesión (COP)
                  </label>
                  <input
                    id="session-price"
                    type="number"
                    min={1}
                    step={50000}
                    value={sessionPrice}
                    onChange={(event) => setSessionPrice(Number(event.target.value))}
                    className="rounded-xl border border-white/10 bg-black/40 px-3 py-3 font-mono text-sm text-zinc-50 outline-none transition focus:border-amber-500/40"
                  />
                  <p className="text-xs text-zinc-500">Referencia días aparte: {formatCop(SESSION_PRICE_SEPARATE_DAYS)}.</p>
                </div>

                <div className="flex flex-col gap-2">
                  <label htmlFor="session-count" className="text-xs font-medium text-zinc-400">
                    Número de sesiones
                  </label>
                  <input
                    id="session-count"
                    type="number"
                    min={1}
                    max={40}
                    value={sessionCount}
                    onChange={(event) => setSessionCount(Number(event.target.value))}
                    className="rounded-xl border border-white/10 bg-black/40 px-3 py-3 font-mono text-sm text-zinc-50 outline-none transition focus:border-amber-500/40"
                  />
                </div>

                <div className="flex flex-col gap-2">
                  <label htmlFor="official-note" className="text-xs font-medium text-zinc-400">
                    Nota para el cliente (opcional)
                  </label>
                  <textarea
                    id="official-note"
                    rows={4}
                    value={note}
                    onChange={(event) => setNote(event.target.value)}
                    placeholder="Escala, sesiones, lo que deba saber antes de sentarse."
                    className="resize-none rounded-xl border border-white/10 bg-black/40 px-3 py-3 text-sm leading-relaxed text-zinc-50 outline-none transition focus:border-amber-500/40 placeholder:text-zinc-600"
                  />
                </div>

                <div className="rounded-xl border border-white/10 bg-black/30 px-4 py-3">
                  <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-zinc-500">Total</p>
                  <p className="mt-1 font-mono text-2xl font-semibold tabular-nums text-zinc-50">
                    {formatCop(total)}
                  </p>
                  <p className="mt-1 text-xs text-zinc-500">
                    {sessionCount} sesiones · {formatCop(sessionPrice)} c/u
                  </p>
                </div>

                {error ? (
                  <p className="rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-xs text-rose-200">
                    {error}
                  </p>
                ) : null}

                {sent ? (
                  <p className="rounded-lg border border-emerald-500/25 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-100">
                    Cotización oficial enviada desde Neutrottt
                    {record.officialSentAt
                      ? ` · ${new Date(record.officialSentAt).toLocaleString("es-CO", {
                          dateStyle: "medium",
                          timeStyle: "short",
                        })}`
                      : "."}
                  </p>
                ) : null}

                <button
                  type="submit"
                  disabled={sending || sessionPrice <= 0 || sessionCount < 1}
                  className="inline-flex items-center justify-center gap-2 rounded-xl border border-amber-500/30 bg-amber-600/20 px-4 py-3 text-sm font-semibold text-amber-50 transition hover:bg-amber-600/30 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {sending ? <Loader2 className="h-4 w-4 animate-spin" strokeWidth={1.5} /> : <Send className="h-4 w-4" strokeWidth={1.5} />}
                  {sent ? "Reenviar cotización oficial" : "Enviar cotización oficial"}
                </button>
              </form>
            </Card>
          ) : null}
        </div>
      </div>
    </main>
  );
}
