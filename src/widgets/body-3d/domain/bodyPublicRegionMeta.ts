/**
 * Presentación pública del selector corporal.
 * Fuente única: bodyPublicSelectionCatalog (no duplicar labels aquí).
 */

import {
  BODY_PUBLIC_SELECTION_CATALOG,
  BODY_PUBLIC_SELECTION_CATALOG_BY_ID,
  getPublicCatalogEntry,
  type PublicRegionCategory,
  type PublicRegionSide,
  type PublicRegionSurface,
} from "@/widgets/body-3d/domain/bodyPublicSelectionCatalog";

export type {
  PublicRegionCategory,
  PublicRegionSide,
  PublicRegionSurface,
};

export type PublicRegionMeta = {
  id: string;
  shortLabel: string;
  fullLabel: string;
  description: string;
  side: PublicRegionSide;
  surface: PublicRegionSurface;
  category: PublicRegionCategory;
};

function toMeta(id: string): PublicRegionMeta | undefined {
  const e = getPublicCatalogEntry(id);
  if (!e) return undefined;
  return {
    id: e.id,
    shortLabel: e.shortLabel,
    fullLabel: e.fullLabel ?? `${e.shortLabel} · ${e.description}`,
    description: e.description,
    side: e.side,
    surface: e.surface,
    category: e.category,
  };
}

/** Metadata profesional derivada del catálogo. */
export const PUBLIC_REGION_META: readonly PublicRegionMeta[] =
  BODY_PUBLIC_SELECTION_CATALOG.map((e) => toMeta(e.id)!);

export const PUBLIC_REGION_META_BY_ID: Readonly<Record<string, PublicRegionMeta>> =
  Object.fromEntries(
    PUBLIC_REGION_META.filter(Boolean).map((m) => [m.id, m]),
  );

export function getPublicRegionMeta(id: string): PublicRegionMeta | undefined {
  return PUBLIC_REGION_META_BY_ID[id] ?? toMeta(id);
}

export function getPublicShortLabel(id: string): string {
  const bare = id.includes("@") ? id.slice(0, id.lastIndexOf("@")) : id;
  return (
    BODY_PUBLIC_SELECTION_CATALOG_BY_ID[bare]?.shortLabel ??
    PUBLIC_REGION_META_BY_ID[bare]?.shortLabel ??
    bare
  );
}

export function getPublicFullLabel(id: string): string {
  const bare = id.includes("@") ? id.slice(0, id.lastIndexOf("@")) : id;
  const e = BODY_PUBLIC_SELECTION_CATALOG_BY_ID[bare];
  if (e) return e.fullLabel ?? `${e.shortLabel} · ${e.description}`;
  return PUBLIC_REGION_META_BY_ID[bare]?.fullLabel ?? getPublicShortLabel(bare);
}

export function getPublicDescription(id: string): string | null {
  const bare = id.includes("@") ? id.slice(0, id.lastIndexOf("@")) : id;
  return (
    BODY_PUBLIC_SELECTION_CATALOG_BY_ID[bare]?.description ??
    PUBLIC_REGION_META_BY_ID[bare]?.description ??
    null
  );
}
