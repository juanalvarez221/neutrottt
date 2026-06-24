"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { isNavItemActive, PUBLIC_NAV_ITEMS } from "@/features/navigation/navConfig";
import { cn } from "@/shared/lib/cn";

export function NavBar() {
  const pathname = usePathname();

  return (
    <nav className="fixed inset-x-0 bottom-0 z-50">
      <div className="mx-auto w-full max-w-md px-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
        <div className="rounded-2xl border border-white/10 bg-black/70 backdrop-blur-xl shadow-[0_20px_50px_-35px_rgba(0,0,0,0.9)]">
          <div className="grid grid-cols-4">
            {PUBLIC_NAV_ITEMS.map((it) => {
              const active = isNavItemActive(pathname, it);
              const Icon = it.icon;
              return (
                <Link
                  key={it.href}
                  href={it.href}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "flex min-h-[52px] flex-col items-center justify-center gap-1 px-1.5 py-2.5 text-[0.6875rem] font-semibold tracking-wide transition sm:min-h-[56px] sm:px-2 sm:py-3 sm:text-xs",
                    active ? "text-stone-200" : "text-zinc-400 hover:text-zinc-100",
                  )}
                >
                  <span
                    className={cn(
                      "relative flex h-10 w-10 items-center justify-center rounded-xl border transition",
                      active
                        ? "border-stone-500/25 bg-stone-600/12"
                        : "border-white/10 bg-white/5",
                    )}
                  >
                    <Icon className="h-4 w-4" />
                    {active ? (
                      <span className="absolute -bottom-1 h-1 w-6 rounded-full bg-amber-500/70 blur-[0.5px]" />
                    ) : null}
                  </span>
                  <span className="max-w-[4.25rem] truncate leading-none sm:max-w-none">
                    {it.label}
                  </span>
                </Link>
              );
            })}
          </div>
        </div>
      </div>
    </nav>
  );
}
