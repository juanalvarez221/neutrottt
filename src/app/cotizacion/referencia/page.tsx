import Link from "next/link";
import { QuoteShell } from "@/widgets/quote/QuoteShell";

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

export default async function CotizacionReferenciaPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const params = await searchParams;
  const size = getParam(params, "size", "mediano");
  const zone = getParam(params, "zone", "pecho");
  const style = getParam(params, "style", "Realismo oscuro");

  return (
    <QuoteShell brand="MALIANTEO">
      <section className="relative mb-8">
        <div className="pointer-events-none absolute -left-10 -top-10 h-40 w-40 rounded-full bg-violet-600/15 blur-[60px]" />
        <h2 className="typo-section text-[2.2rem] leading-[1.05] md:text-[3.2rem]">
          Inspiración
          <br />
          <span className="bg-gradient-to-r from-white to-zinc-400 bg-clip-text text-transparent">
            y referencias
          </span>
        </h2>
        <p className="typo-body mt-3 max-w-xl">
          Si tienes imágenes de referencia, compártelas. Me ayudarán a alinear
          mucho mejor la propuesta contigo desde el inicio.
        </p>
      </section>

      <section className="mb-8">
        <div className="glass-card rounded-2xl p-5">
          <div className="mb-4 flex items-center gap-3">
            <div className="flex h-6 w-6 items-center justify-center rounded-full border border-violet-500/30 bg-violet-600/10">
              <span className="text-[10px] font-bold text-white">4</span>
            </div>
            <h3 className="typo-subtitle text-sm uppercase tracking-[0.14em] text-zinc-200">
              Referencias visuales (opcional)
            </h3>
          </div>

          <div className="flex min-h-44 items-center justify-center rounded-2xl border border-dashed border-white/15 bg-white/5">
            <div className="text-center">
              <div className="mx-auto h-12 w-12 rounded-2xl border border-white/10 bg-white/5" />
              <p className="mt-3 text-sm font-semibold text-zinc-50">
                Agregar imagen de referencia
              </p>
              <p className="mt-1 text-xs text-zinc-400">
                Arrastra y suelta o selecciona un archivo
              </p>
            </div>
          </div>

          <p className="mt-3 text-xs text-zinc-400">
            Vista previa de interfaz: la carga de archivos se conectará en una
            próxima iteración.
          </p>
        </div>
      </section>

      <div className="mt-6 flex items-center justify-between gap-3">
        <Link
          href={`/cotizacion/estilo?size=${encodeURIComponent(size)}&zone=${encodeURIComponent(zone)}`}
          className="rounded-xl border border-white/10 bg-white/5 px-5 py-3 text-sm font-semibold text-zinc-100 transition hover:bg-white/8"
        >
          Anterior
        </Link>
        <Link
          href={`/cotizacion/confirmacion?size=${encodeURIComponent(size)}&zone=${encodeURIComponent(zone)}&style=${encodeURIComponent(style)}`}
          className="rounded-xl border border-violet-500/35 bg-gradient-to-r from-violet-700 to-fuchsia-600 px-6 py-3 text-sm font-bold uppercase tracking-[0.2em] text-white transition hover:-translate-y-0.5 hover:shadow-[0_0_20px_rgba(139,92,246,0.35)]"
        >
          Revisar mi cotización
        </Link>
      </div>
    </QuoteShell>
  );
}

