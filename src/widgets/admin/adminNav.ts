export type AdminNavHref =
  | "/admin"
  | "/admin/cotizaciones"
  | "/admin/asesorias"
  | "/admin/recorridos"
  | "/admin/analitica";

export type AdminNavItem = {
  href: AdminNavHref;
  label: string;
  hint: string;
  primary: boolean;
};

export const ADMIN_NAV: readonly AdminNavItem[] = [
  {
    href: "/admin",
    label: "Inicio",
    hint: "Pendientes y novedades",
    primary: true,
  },
  {
    href: "/admin/cotizaciones",
    label: "Cotizaciones",
    hint: "Recibidas e incompletas",
    primary: true,
  },
  {
    href: "/admin/asesorias",
    label: "Asesorías",
    hint: "Agenda y confirmaciones",
    primary: true,
  },
  {
    href: "/admin/recorridos",
    label: "Recorridos",
    hint: "Quién se detuvo y dónde",
    primary: true,
  },
  {
    href: "/admin/analitica",
    label: "Métricas",
    hint: "Uso del sitio",
    primary: true,
  },
] as const;

export function isAdminNavActive(pathname: string, href: AdminNavHref): boolean {
  if (href === "/admin") {
    return pathname === "/admin";
  }
  return pathname === href || pathname.startsWith(`${href}/`);
}