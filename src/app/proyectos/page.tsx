"use client";

import { useMemo, useState } from "react";
import { AppShell } from "@/widgets/layout/AppShell";
import { Card } from "@/shared/ui/Card";
import { PROJECTS, PROJECT_TAGS, type ProjectTag } from "@/shared/mock/projects";
import { cn } from "@/shared/lib/cn";

export default function ProyectosPage() {
  const [activeTag, setActiveTag] = useState<"all" | ProjectTag>("all");

  const filtered = useMemo(
    () =>
      activeTag === "all"
        ? PROJECTS
        : PROJECTS.filter((project) => project.tag === activeTag),
    [activeTag],
  );

  return (
    <AppShell>
      <header className="flex items-center justify-between">
        <div>
          <p className="typo-eyebrow typo-eyebrow-muted">Portafolio</p>
          <h1 className="typo-section-sm mt-2">Proyectos</h1>
        </div>
      </header>

      <div
        className="mt-4 -mx-1 flex gap-2 overflow-x-auto overscroll-x-contain px-1 pb-2 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        role="tablist"
        aria-label="Filtrar por estilo"
      >
        {PROJECT_TAGS.map((tag) => {
          const active = activeTag === tag.id;
          return (
            <button
              key={tag.id}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => setActiveTag(tag.id)}
              className={cn(
                "shrink-0 rounded-full border px-4 py-2.5 text-xs font-semibold min-h-[44px] transition active:scale-[0.98]",
                active
                  ? "border-stone-500/25 bg-stone-600/12 text-stone-200"
                  : "border-white/10 bg-white/5 text-zinc-200 hover:bg-white/8",
              )}
            >
              {tag.label}
            </button>
          );
        })}
      </div>

      <div className="mt-4 grid max-[380px]:grid-cols-1 grid-cols-2 gap-3 lg:grid-cols-3">
        {filtered.map((p, idx) => (
          <div
            key={p.id}
            className="min-w-0 animate-in fade-in slide-in-from-bottom-2 duration-300"
            style={{ animationDelay: `${60 + idx * 25}ms` }}
          >
            <Card className="group overflow-hidden">
              <div className="relative aspect-square">
                <div className="absolute inset-0 bg-gradient-to-b from-white/12 to-black" />
                <div className="absolute inset-0 bg-[radial-gradient(180px_180px_at_30%_20%,rgba(214,161,90,0.3),transparent_58%)]" />
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
                    <p className="truncate text-sm font-semibold text-zinc-50">{p.title}</p>
                    <div className="mt-2 flex items-center justify-between gap-2">
                      <p className="text-[11px] font-semibold text-zinc-300/80">{p.tag}</p>
                      <span className="h-1 w-10 rounded-full bg-stone-500/50 transition-all group-hover:w-16" />
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
