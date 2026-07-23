import { BodyLabWorkbench } from "@/widgets/body-3d/lab/BodyLabWorkbench";

export default function LabBody3DPage() {
  return (
    <main className="min-h-[100dvh] bg-[#17110d] text-zinc-100">
      <div className="mx-auto flex min-h-[100dvh] max-w-[1400px] flex-col px-4 py-6 sm:px-6 md:py-8">
        <header className="mb-5 shrink-0 space-y-1">
          <p className="font-mono text-[11px] font-semibold uppercase tracking-[0.18em] text-zinc-500">
            Laboratorio · Selector corporal 3D
          </p>
          <h1 className="text-xl font-semibold tracking-tight text-[rgba(255,242,228,0.96)] sm:text-2xl">
            Prototipo de experiencia
          </h1>
          <p className="max-w-2xl text-sm leading-relaxed text-zinc-500">
            Valida la UX premium antes de integrar el cotizador. El modo
            técnico permanece disponible para diagnóstico.
          </p>
        </header>

        <BodyLabWorkbench />
      </div>
    </main>
  );
}
