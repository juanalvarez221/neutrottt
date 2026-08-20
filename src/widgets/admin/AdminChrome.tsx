"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const LINKS = [
  { href: "/admin", label: "Panel" },
  { href: "/admin/analitica", label: "Metricas" },
];

export function AdminChrome({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  if (pathname.startsWith("/admin/login")) return children;

  return (
    <>
      <nav className="sticky top-0 z-20 border-b border-white/10 bg-[#17110d]/90 px-4 py-3 backdrop-blur-md">
        <div className="mx-auto flex max-w-[1400px] items-center gap-4">
          {LINKS.map((link) => {
            const active =
              link.href === "/admin"
                ? pathname === "/admin" || pathname.startsWith("/admin/cotizaciones")
                : pathname.startsWith(link.href);
            return (
              <Link
                key={link.href}
                href={link.href}
                className={
                  active
                    ? "text-[11px] uppercase tracking-[0.16em] text-zinc-200"
                    : "text-[11px] uppercase tracking-[0.16em] text-zinc-600 transition hover:text-zinc-400"
                }
              >
                {link.label}
              </Link>
            );
          })}
        </div>
      </nav>
      {children}
    </>
  );
}
