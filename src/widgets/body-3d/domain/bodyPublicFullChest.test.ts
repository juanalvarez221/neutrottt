/**
 * Tests for full_chest_surface contract (unique visual region).
 */
import { describe, expect, it } from "vitest";
import {
  LEGACY_REGION_ID_MIGRATIONS,
  isPublicSelectableBodyTarget,
  PUBLIC_SELECTABLE_BODY_TARGET_IDS,
} from "@/widgets/body-3d/domain/bodyPublicSelectionCatalog";
import { upgradeBodySelectionToPublicTargets } from "@/widgets/body-3d/domain/bodyPublicSelectionRouting";
import { resolvePublicTargetHighlightRegions } from "@/widgets/body-3d/domain/bodyPublicHighlightRegions";
import {
  BODY_PUBLIC_REGION_MASK_MANIFEST,
  getMaskIndexForRegionId,
} from "@/widgets/body-3d/domain/bodyPublicRegionMask";
import { normalizeQuoteBodyTargets } from "@/widgets/quote/quoteBodyLocation";

describe("full_chest unique public + visual contract", () => {
  it("full_chest is the only public chest target", () => {
    const chestTargets = [...PUBLIC_SELECTABLE_BODY_TARGET_IDS].filter(
      (id) =>
        id.includes("chest") ||
        id.includes("pectoral") ||
        id === "full_chest_surface",
    );
    expect(chestTargets).toEqual(["full_chest"]);
    expect(isPublicSelectableBodyTarget("left_chest")).toBe(false);
    expect(isPublicSelectableBodyTarget("right_chest")).toBe(false);
  });

  it("full_chest resolves only full_chest_surface", () => {
    expect(resolvePublicTargetHighlightRegions("full_chest")).toEqual([
      "full_chest_surface",
    ]);
    expect(resolvePublicTargetHighlightRegions("full_chest")).not.toContain(
      "left_pectoral_region",
    );
    expect(resolvePublicTargetHighlightRegions("full_chest")).not.toContain(
      "right_pectoral_region",
    );
  });

  it("aliases pectorales legacy migran a full_chest", () => {
    expect(LEGACY_REGION_ID_MIGRATIONS.left_pectoral).toBe("full_chest");
    expect(LEGACY_REGION_ID_MIGRATIONS.right_pectoral).toBe("full_chest");
    expect(LEGACY_REGION_ID_MIGRATIONS.left_pectoral_region).toBe("full_chest");
    expect(LEGACY_REGION_ID_MIGRATIONS.right_pectoral_region).toBe(
      "full_chest",
    );
    expect(upgradeBodySelectionToPublicTargets(["left_pectoral", "right_chest"])).toEqual([
      "full_chest",
    ]);
  });

  it("no se persisten IDs pectorales", () => {
    const next = normalizeQuoteBodyTargets([
      "left_chest",
      "right_chest",
      "left_pectoral_region",
    ]);
    expect(next).toEqual(["full_chest"]);
    expect(next.every((id) => !id.includes("pectoral"))).toBe(true);
    expect(next.every((id) => id !== "left_chest" && id !== "right_chest")).toBe(
      true,
    );
  });

  it("full_chest_surface tiene un único mask ID", () => {
    const idx = getMaskIndexForRegionId("full_chest_surface");
    expect(idx).toBe(9);
    expect(BODY_PUBLIC_REGION_MASK_MANIFEST.composites.full_chest).toEqual([
      "full_chest_surface",
    ]);
    expect(BODY_PUBLIC_REGION_MASK_MANIFEST.regions.full_chest_surface.maskIndex).toBe(
      9,
    );
  });
});
