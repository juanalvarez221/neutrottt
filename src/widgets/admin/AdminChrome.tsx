"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Activity,
  CalendarDays,
  ClipboardList,
  LayoutGrid,
  LogOut,
  MoreHorizontal,
  Palette,
  Route,
} from "lucide-react";
import { cn } from "@/shared/lib/cn";
import { ADMIN_NAV, isAdminNavActive, type AdminNavHref } from "@/widgets/admin/adminNav";

const ICONS: Record<AdminNavHref, typeof LayoutGrid> = {
  "/admin": LayoutGrid,
  "/admin/cotizaciones": ClipboardList,
  "/admin/asesorias": CalendarDays,
  "/admin/recorridos": Route,
  "/admin/analitica": Activity,
  "/admin/estudio": Palette,
};

export function AdminChrome({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [loggingOut, setLoggingOut] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);

  if (pathname.startsWith("/admin/login")) return children;

  const handleLogout = async () => {
    if (loggingOut) return;
    setLoggingOut(true);
    try {
      await fetch("/api/admin/auth/logout", {
        method: "POST",
        credentials: "same-origin",
      });
    } catch {
      // Aun si falla la red, cerramos la vista local.
    }
    window.location.assign("/admin/login");
  };

  const primary = ADMIN_NAV.filter((item) => item.primary);
  const secondary = ADMIN_NAV.filter((item) => !item.primary);

  return (
    <div className="min-h-[100dvh] bg-background text-zinc-100">
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-[15.5rem] border-r border-white/10 bg-[#17110d]/95 px-4 py-6 backdrop-blur-md lg:flex lg:flex-col">
        <div>
          <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-amber-200/75">
            Neutrottt
          </p>
          <p className="mt-1 text-lg font-semibold tracking-tight text-zinc-50">Operación</p>
        </div>

        <nav className="mt-8 flex flex-1 flex-col gap-1">
          {ADMIN_NAV.map((item) => (
            <NavLink
              key={item.href}
              href={item.href}
              label={item.label}
              hint={item.hint}
              active={isAdminNavActive(pathname, item.href)}
            />
          ))}
        </nav>

        <button
          type="button"
          onClick={() => void handleLogout()}
          disabled={loggingOut}
          className="mt-4 inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3 py-2.5 text-sm text-zinc-300 transition hover:bg-white/10 active:scale-[0.98] disabled:opacity-50"
        >
          <LogOut className="h-4 w-4" strokeWidth={1.5} />
          {loggingOut ? "Saliendo" : "Cerrar sesión"}
        </button>
      </aside>

      <div className="lg:pl-[15.5rem]">
        <header className="sticky top-0 z-20 border-b border-white/10 bg-[#17110d]/90 px-4 py-3 backdrop-blur-md lg:hidden">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-amber-200/75">
                Neutrottt
              </p>
              <p className="text-sm font-semibold text-zinc-50">Operación</p>
            </div>
            <button
              type="button"
              onClick={() => void handleLogout()}
              disabled={loggingOut}
              className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/5 px-2.5 py-1.5 text-xs font-semibold text-zinc-300 transition hover:bg-white/10 disabled:opacity-50"
            >
              <LogOut className="h-3.5 w-3.5" strokeWidth={1.5} />
              Salir
            </button>
          </div>
        </header>

        <div className="px-4 py-6 pb-[max(6.5rem,calc(5.25rem+env(safe-area-inset-bottom)))] sm:px-6 lg:px-8 lg:py-8 lg:pb-10">
          <div className="mx-auto max-w-[1400px]">{children}</div>
        </div>
      </div>

      <nav className="fixed inset-x-0 bottom-0 z-30 border-t border-white/10 bg-[#17110d]/95 px-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] pt-2 backdrop-blur-md lg:hidden">
        <div className="grid grid-cols-5 gap-1">
          {primary.slice(0, 4).map((item) => {
            const Icon = ICONS[item.href];
            const active = isAdminNavActive(pathname, item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "flex min-h-12 flex-col items-center justify-center gap-1 rounded-xl px-1 text-[10px] font-semibold tracking-wide",
                  active ? "bg-white/8 text-zinc-50" : "text-zinc-500",
                )}
              >
                <Icon className="h-4 w-4" strokeWidth={1.6} />
                {item.label}
              </Link>
            );
          })}
          <button
            type="button"
            onClick={() => setMoreOpen((open) => !open)}
            className={cn(
              "flex min-h-12 flex-col items-center justify-center gap-1 rounded-xl px-1 text-[10px] font-semibold tracking-wide",
              moreOpen || secondary.some((item) => isAdminNavActive(pathname, item.href))
                ? "bg-white/8 text-zinc-50"
                : "text-zinc-500",
            )}
          >
            <MoreHorizontal className="h-4 w-4" strokeWidth={1.6} />
            Más
          </button>
        </div>
      </nav>

      {moreOpen ? (
        <div className="fixed inset-0 z-40 lg:hidden">
          <button
            type="button"
            aria-label="Cerrar menú"
            className="absolute inset-0 bg-black/50"
            onClick={() => setMoreOpen(false)}
          />
          <div className="absolute inset-x-0 bottom-0 rounded-t-3xl border border-white/10 bg-[#1c1612] px-4 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-4">
            <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-zinc-500">
              Más secciones
            </p>
            <div className="mt-3 space-y-1">
              {primary.slice(4).concat(secondary).map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => setMoreOpen(false)}
                  className="flex items-center justify-between rounded-xl border border-white/8 bg-white/[0.03] px-3 py-3"
                >
                  <span className="text-sm font-semibold text-zinc-100">{item.label}</span>
                  <span className="text-xs text-zinc-500">{item.hint}</span>
                </Link>
              ))}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function NavLink({
  href,
  label,
  hint,
  active,
}: {
  href: AdminNavHref;
  label: string;
  hint: string;
  active: boolean;
}) {
  const Icon = ICONS[href];
  return (
    <Link
      href={href}
      className={cn(
        "group flex items-start gap-3 rounded-xl px-3 py-2.5 transition active:scale-[0.98]",
        active ? "bg-white/8 text-zinc-50" : "text-zinc-400 hover:bg-white/5 hover:text-zinc-200",
      )}
    >
      <Icon className="mt-0.5 h-4 w-4 shrink-0" strokeWidth={1.6} />
      <span className="min-w-0">
        <span className="block text-sm font-semibold">{label}</span>
        <span className="mt-0.5 block text-[11px] leading-snug text-zinc-500 group-hover:text-zinc-400">
          {hint}
        </span>
      </span>
    </Link>
  );
}
