import type { LucideIcon } from "lucide-react";
import { Home, Image as ImageIcon, Sparkles, MessageCircle } from "lucide-react";

export type NavItem = {
  href: string;
  label: string;
  icon: LucideIcon;
  /** Si true, sub-rutas también marcan activo (ej. /cotizacion/tamano). */
  matchPrefix?: boolean;
};

export const PUBLIC_NAV_ITEMS: NavItem[] = [
  { href: "/", label: "Inicio", icon: Home },
  { href: "/proyectos", label: "Proyectos", icon: ImageIcon, matchPrefix: true },
  { href: "/cotizacion", label: "Cotizar", icon: Sparkles, matchPrefix: true },
  { href: "/contacto", label: "Contacto", icon: MessageCircle, matchPrefix: true },
];

export function isNavItemActive(pathname: string, item: NavItem): boolean {
  if (item.matchPrefix) {
    return pathname === item.href || pathname.startsWith(`${item.href}/`);
  }
  return pathname === item.href;
}
