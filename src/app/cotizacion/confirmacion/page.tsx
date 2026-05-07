import Link from "next/link";
import { QuoteShell } from "@/widgets/quote/QuoteShell";
import {
  BadgeDollarSign,
  CalendarClock,
  CheckCircle2,
  Clock3,
  MessageCircleMore,
  PenSquare,
  Sparkles,
  Wallet,
} from "lucide-react";

type SearchParams = Promise<{ [key: string]: string | string[] | undefined }>;

function getParam(
  source: { [key: string]: string | string[] | undefined },
  key: string,
  fallback: string,
) {
  const value = source[key];
  if (Array.isArray(value)) return value[0] ?? fallback;
  return value ?? fallback;
}

function titleCase(text: string) {
  return text
    .split(" ")
    .filter(Boolean)
    .map((chunk) => chunk[0].toUpperCase() + chunk.slice(1).toLowerCase())
    .join(" ");
}

function getEstimateBySize(size: string) {
  const normalized = size.toLowerCase();
  if (normalized.includes("peque")) {
    return {
      sessions: "1 a 2 sesiones",
      perSession: "$220.000 - $320.000 COP",
      total: "$220.000 - $640.000 COP",
    };
  }

  if (normalized.includes("gran")) {
    return {
      sessions: "4 a 6 sesiones",
      perSession: "$380.000 - $550.000 COP",
      total: "$1.520.000 - $3.300.000 COP",
    };
  }

  return {
    sessions: "2 a 3 sesiones",
    perSession: "$300.000 - $420.000 COP",
    total: "$600.000 - $1.260.000 COP",
  };
}

export default async function CotizacionConfirmacionPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const params = await searchParams;
  const size = titleCase(getParam(params, "size", "mediano"));
  const zone = titleCase(getParam(params, "zone", "brazo"));
  const style = getParam(params, "style", "Realismo oscuro");
  const estimate = getEstimateBySize(size);

  return (
    <QuoteShell brand="MALIANTEO">
      <section className="relative overflow-hidden rounded-3xl border border-white/10 bg-[radial-gradient(560px_260px_at_15%_0%,rgba(168,85,247,0.26),transparent_60%),linear-gradient(180deg,rgba(255,255,255,0.05),transparent_35%),#0d0d0e] p-5 md:p-8">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(560px_280px_at_90%_100%,rgba(124,58,237,0.14),transparent_62%)]" />

        <div className="relative z-10">
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-violet-200/80">
            Resumen final
          </p>
          <h1 className="typo-section mt-2 text-[2.2rem] md:text-[2.8rem]">
            Confirmación
          </h1>
          <p className="typo-body mt-3 max-w-2xl">
            Gracias por confiar en mí para tu proyecto. Aquí puedes revisar con
            calma tu cotización inteligente antes de enviarla a validación con
            Teo.
          </p>
        </div>
      </section>

      <section className="mt-5 grid gap-4 md:grid-cols-[1.15fr_.85fr]">
        <article className="glass-card rounded-2xl p-5">
          <div className="flex items-center justify-between gap-3">
            <p className="typo-subtitle inline-flex items-center gap-2 text-sm uppercase tracking-[0.14em] text-zinc-300">
              <BadgeDollarSign className="h-4 w-4 text-violet-300" />
              Cotización inteligente
            </p>
            <span className="typo-tech rounded-full border border-violet-500/35 bg-violet-600/20 px-3 py-1 text-violet-100">
              {estimate.total}
            </span>
          </div>
          <p className="typo-body mt-2 text-sm">
            Este cálculo inicial te da un marco claro de inversión antes de la
            revisión y ajuste oficial.
          </p>

          <div className="typo-tech mt-4 grid gap-2 rounded-2xl border border-white/10 bg-black/35 p-4 text-zinc-200">
            <p className="inline-flex items-center gap-2 text-zinc-200">
              <Sparkles className="h-4 w-4 text-violet-300" />
              Tamaño: {size}
            </p>
            <p className="inline-flex items-center gap-2 text-zinc-200">
              <CheckCircle2 className="h-4 w-4 text-violet-300" />
              Zona: {zone}
            </p>
            <p className="inline-flex items-center gap-2 text-zinc-200">
              <CheckCircle2 className="h-4 w-4 text-violet-300" />
              Estilo: {style}
            </p>
          </div>

          <div className="typo-tech mt-4 grid gap-2 rounded-2xl border border-white/10 bg-white/5 p-4 text-zinc-200">
            <p className="inline-flex items-center gap-2 text-zinc-200">
              <Sparkles className="h-4 w-4 text-violet-300" />
              Sesiones estimadas: {estimate.sessions}
            </p>
            <p className="inline-flex items-center gap-2 text-zinc-200">
              <BadgeDollarSign className="h-4 w-4 text-violet-300" />
              Rango por sesión: {estimate.perSession}
            </p>
            <p className="inline-flex items-center gap-2 text-zinc-200">
              <Wallet className="h-4 w-4 text-violet-300" />
              Total estimado: {estimate.total}
            </p>
          </div>

          <div className="typo-tech mt-4 grid gap-2 text-zinc-300">
            <p className="inline-flex items-center gap-2 text-zinc-300">
              <Clock3 className="h-4 w-4 text-zinc-400" />
              Tiempo estimado de sesión: 3 a 5 horas
            </p>
            <p className="inline-flex items-center gap-2 text-zinc-300">
              <CalendarClock className="h-4 w-4 text-zinc-400" />
              Respuesta del artista: menos de 24 horas
            </p>
          </div>
        </article>

        <article className="glass-card rounded-2xl p-5">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-zinc-300">
            Proceso de validación
          </p>
          <h2 className="typo-subtitle mt-2">
            Revisión con Teo y confirmación oficial
          </h2>
          <div className="mt-4 grid gap-3">
            <div className="rounded-xl border border-white/10 bg-white/5 p-3">
              <p className="typo-tech inline-flex items-center gap-2 text-zinc-100">
                <MessageCircleMore className="h-4 w-4 text-violet-300" />
                1) Se notifica a Teo que tienes una nueva cotización
                inteligente.
              </p>
            </div>
            <div className="rounded-xl border border-white/10 bg-white/5 p-3">
              <p className="typo-tech inline-flex items-center gap-2 text-zinc-100">
                <PenSquare className="h-4 w-4 text-violet-300" />
                2) Teo valida la propuesta y, si aplica, te comparte un ajuste.
              </p>
            </div>
            <div className="rounded-xl border border-white/10 bg-white/5 p-3">
              <p className="typo-tech inline-flex items-center gap-2 text-zinc-100">
                <CheckCircle2 className="h-4 w-4 text-violet-300" />
                3) Confirmas la cotización oficial y agendas con abono de
                $100.000 COP por sesión.
              </p>
            </div>
          </div>

          <button
            type="button"
            className="typo-cta mt-6 inline-flex w-full items-center justify-center gap-2 rounded-xl border border-violet-500/35 bg-gradient-to-r from-violet-700 to-fuchsia-600 px-5 py-4 text-white transition hover:-translate-y-0.5 hover:shadow-[0_0_24px_rgba(139,92,246,0.35)] active:translate-y-0"
          >
            Enviar cotización a Teo
          </button>
          <p className="typo-tech mt-2 text-zinc-500">
            Vista previa: en la siguiente fase este botón activará la
            notificación real al panel de Teo.
          </p>
        </article>
      </section>

      <section className="mt-5 flex items-center justify-between gap-3">
        <Link
          href={`/cotizacion/referencia?size=${encodeURIComponent(size.toLowerCase())}&zone=${encodeURIComponent(zone.toLowerCase())}&style=${encodeURIComponent(style)}`}
          className="rounded-xl border border-white/10 bg-white/5 px-5 py-3 text-sm font-semibold text-zinc-100 transition hover:bg-white/8"
        >
          Volver
        </Link>

        <Link
          href="/citas"
          className="rounded-xl border border-violet-500/35 bg-violet-600/15 px-5 py-3 text-sm font-semibold text-violet-100 transition hover:bg-violet-600/20"
        >
          Ir a mis citas
        </Link>
      </section>
    </QuoteShell>
  );
}

