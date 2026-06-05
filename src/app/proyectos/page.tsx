import { AppShell } from "@/widgets/layout/AppShell";
import { Card } from "@/shared/ui/Card";
import { PROJECTS } from "@/shared/mock/projects";

export default function ProyectosPage() {
  return (
    <AppShell>
      <header className="flex items-center justify-between">
        <div>
          <p className="text-xs font-semibold tracking-[0.18em] text-amber-200/70 uppercase">
            Portafolio
          </p>
          <h1 className="mt-1 text-2xl font-semibold text-zinc-50">
            Proyectos
          </h1>
        </div>
        <div className="h-10 w-10 rounded-full border border-white/10 bg-white/5" />
      </header>

      <div className="mt-4 flex gap-2 overflow-auto pb-2 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {["Todas", "Realismo", "Blackwork", "Surrealismo", "Fineline"].map(
          (t, i) => (
            <button
              key={t}
              className={
                i === 0
                  ? "shrink-0 rounded-full border border-amber-500/30 bg-amber-600/15 px-3 py-1 text-xs font-semibold text-amber-100"
                  : "shrink-0 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-semibold text-zinc-200"
              }
            >
              {t}
            </button>
          ),
        )}
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-3">
        {PROJECTS.map((p, idx) => (
          <div
            key={p.id}
            className="animate-in fade-in slide-in-from-bottom-2 duration-300"
            style={{ animationDelay: `${60 + idx * 25}ms` }}
          >
            <Card className="group overflow-hidden">
              <div className="relative aspect-square">
                <div className="absolute inset-0 bg-gradient-to-b from-white/12 to-black" />
                <div className="absolute inset-0 bg-[radial-gradient(180px_180px_at_30%_20%,rgba(245,158,11,0.3),transparent_58%)]" />
                <div className="absolute inset-0 opacity-0 transition group-hover:opacity-100 bg-[radial-gradient(260px_120px_at_50%_0%,rgba(255,255,255,0.10),transparent_60%)]" />
                <div
                  className="absolute inset-0 opacity-70"
                  style={{
                    backgroundImage:
                      "linear-gradient(90deg, rgba(255,255,255,0.06) 1px, transparent 1px), linear-gradient(rgba(255,255,255,0.03) 1px, transparent 1px)",
                    backgroundSize: "18px 18px",
                    transform: `translateY(${(idx % 3) * 2}px)`,
                  }}
                />

                <div className="absolute inset-x-0 bottom-0 p-3">
                  <div className="rounded-2xl border border-white/10 bg-black/55 p-3 backdrop-blur">
                    <p className="text-sm font-semibold text-zinc-50">
                      {p.title}
                    </p>
                    <div className="mt-2 flex items-center justify-between gap-2">
                      <p className="text-[11px] font-semibold text-zinc-300/80">
                        {p.tag}
                      </p>
                      <span className="h-1 w-10 rounded-full bg-amber-600/60 transition-all group-hover:w-16" />
                    </div>
                  </div>
                </div>
              </div>
            </Card>
          </div>
        ))}
      </div>
    </AppShell>
  );
}

