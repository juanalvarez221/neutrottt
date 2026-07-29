import type { LucideIcon } from "lucide-react";
import { Home, Image as ImageIcon, Sparkles, MessageCircle, ShoppingBag } from "lucide-react";

export type NavItem = {
  href: string;
  label: string;
  icon: LucideIcon;
  /** Si true, sub-rutas también marcan activo (ej. /cotizacion/tamano). */
  matchPrefix?: boolean;
  /** Abre en pestaña nueva (flujo de cotización). */
  openInNewTab?: boolean;
};

export const PUBLIC_NAV_ITEMS: NavItem[] = [
  { href: "/", label: "Inicio", icon: Home },
  { href: "/proyectos", label: "Proyectos", icon: ImageIcon, matchPrefix: true },
  { href: "/tienda", label: "Tienda", icon: ShoppingBag, matchPrefix: true },
  {
    href: "/cotizacion",
    label: "Cotizar",
    icon: Sparkles,
    matchPrefix: true,
    openInNewTab: true,
  },
  { href: "/contacto", label: "Contacto", icon: MessageCircle },
];

export function isNavItemActive(pathname: string, item: NavItem): boolean {
  if (item.matchPrefix) {
    return pathname === item.href || pathname.startsWith(`${item.href}/`);
  }
  return pathname === item.href;
}
