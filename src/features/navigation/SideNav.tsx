"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { isNavItemActive, PUBLIC_NAV_ITEMS } from "@/features/navigation/navConfig";
import { cn } from "@/shared/lib/cn";

export function SideNav() {
  const pathname = usePathname();

  return (
    <aside className="hidden lg:block lg:sticky lg:top-0 lg:h-dvh">
      <div className="h-full w-[280px] p-6">
        <div className="app-surface noise flex h-full flex-col rounded-3xl p-5">
          <div className="leading-none">
            <p className="hero-brand-name text-[2.1rem] leading-[1.08] sm:text-[2.5rem]">
              Danniel Cuervo
            </p>
            <p className="hero-brand-tagline mt-2 text-[0.58rem] tracking-[0.22em] text-stone-400/80">
              Tattoo Artist
            </p>
          </div>

          <div className="mt-8 grid gap-1">
            {PUBLIC_NAV_ITEMS.map((it) => {
              const active = isNavItemActive(pathname, it);
              const Icon = it.icon;
              return (
                <Link
                  key={it.href}
                  href={it.href}
                  target={it.openInNewTab ? "_blank" : undefined}
                  rel={it.openInNewTab ? "noopener noreferrer" : undefined}
                  aria-current={active && !it.openInNewTab ? "page" : undefined}
                  className={cn(
                    "group flex items-center gap-3 rounded-2xl border px-3 py-2.5 text-sm font-semibold transition",
                    active
                      ? "border-stone-500/25 bg-stone-600/10 text-stone-100"
                      : "border-transparent bg-transparent text-zinc-300 hover:border-white/10 hover:bg-white/5",
                  )}
                >
                  <span
                    className={cn(
                      "flex h-9 w-9 items-center justify-center rounded-xl border transition",
                      active
                        ? "border-stone-500/25 bg-stone-600/12"
                        : "border-white/10 bg-white/5 group-hover:bg-white/7",
                    )}
                  >
                    <Icon className="h-4 w-4" />
                  </span>
                  <span className="min-w-0">{it.label}</span>
                </Link>
              );
            })}
          </div>

          <div className="mt-auto pt-6">
            <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
              <p className="text-xs font-semibold tracking-[0.18em] text-stone-400/80 uppercase">
                Estilo
              </p>
              <p className="mt-1 text-sm font-semibold text-zinc-50">
                Lettering
              </p>
              <p className="mt-2 text-xs leading-5 text-zinc-400">
                Lettering · Emerald Tattoo Studio, Medellín
              </p>
            </div>
          </div>
        </div>
      </div>
    </aside>
  );
}
