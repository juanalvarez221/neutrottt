/**
 * Gate de dominio: taxonomía pública, cobertura, migración y routing coherente.
 * No evalúa precisión anatómica de máscaras.
 */

import { describe, expect, it } from "vitest";
import {
  assertNoPublicPectorals,
  getSupportedCoverages,
  isPublicSelectableBodyTarget,
  LEGACY_REGION_ID_MIGRATIONS,
  parseBodyPlacementToken,
  PUBLIC_SELECTABLE_BODY_TARGET_IDS,
  regionSupportsCoverage,
  serializeBodyPlacement,
  BODY_PUBLIC_SELECTION_CATALOG,
  getPublicCatalogEntry,
} from "@/widgets/body-3d/domain/bodyPublicSelectionCatalog";
import {
  getPrimaryPublicSelectionTarget,
  getPublicSelectionOptionsForAtomicZone,
  upgradeBodySelectionToPublicTargets,
} from "@/widgets/body-3d/domain/bodyPublicSelectionRouting";
import { resolvePublicTargetHighlightRegions } from "@/widgets/body-3d/domain/bodyPublicHighlightRegions";
import {
  isConnectedBodySelection,
  normalizeConnectedBodySelection,
  tryAddContiguousPublicTarget,
} from "@/widgets/body-3d/domain/bodyPublicAdjacency";
import { getPublicRegionMeta, getPublicShortLabel } from "@/widgets/body-3d/domain/bodyPublicRegionMeta";
import { normalizeQuoteBodyTargets } from "@/widgets/quote/quoteBodyLocation";
import {
  serializeConceptualBodySelection,
  tokensToPlacements,
} from "@/widgets/body-3d/ux/bodySelectionSerialization";
import { resolveTargetToAtomicZoneIds } from "@/widgets/body-3d/domain/bodySelectionTargets";

describe("public taxonomy — no microzones", () => {
  it("no public left/right pectoral targets", () => {
    expect(assertNoPublicPectorals()).toEqual([]);
    expect(isPublicSelectableBodyTarget("left_chest")).toBe(false);
    expect(isPublicSelectableBodyTarget("right_chest")).toBe(false);
    expect(PUBLIC_SELECTABLE_BODY_TARGET_IDS.has("left_chest")).toBe(false);
    expect(PUBLIC_SELECTABLE_BODY_TARGET_IDS.has("right_chest")).toBe(false);
  });

  it("full chest is the only public chest target", () => {
    const chest = BODY_PUBLIC_SELECTION_CATALOG.filter(
      (e) =>
        e.publicSelectable &&
        e.category === "torso" &&
        (e.id.includes("chest") || e.shortLabel.toLowerCase().includes("pectoral")),
    );
    expect(chest.map((c) => c.id)).toEqual(["full_chest"]);
    expect(getPublicShortLabel("full_chest")).toBe("Pecho completo");
  });

  it("hides elbow / wrist / knee / ankle / sternum / sacrum as public", () => {
    for (const id of [
      "right_elbow",
      "left_wrist",
      "right_knee",
      "left_ankle",
      "sternum",
      "sacrum",
      "left_ear",
      "right_flank",
    ]) {
      expect(isPublicSelectableBodyTarget(id)).toBe(false);
    }
  });

  it("hides half sleeves and full_head from public", () => {
    expect(isPublicSelectableBodyTarget("right_upper_half_sleeve")).toBe(false);
    expect(isPublicSelectableBodyTarget("left_lower_half_sleeve")).toBe(false);
    expect(isPublicSelectableBodyTarget("full_head")).toBe(false);
  });
});

describe("dynamic coverage", () => {
  it("coverage supported only by declared regions", () => {
    for (const entry of BODY_PUBLIC_SELECTION_CATALOG.filter(
      (e) => e.publicSelectable,
    )) {
      if (entry.supportedCoverages.length > 1) {
        expect(regionSupportsCoverage(entry.id)).toBe(true);
      } else {
        expect(regionSupportsCoverage(entry.id)).toBe(false);
        expect(getSupportedCoverages(entry.id)).toEqual(["complete"]);
      }
    }
  });

  it("full sleeve supports complete/inner/outer", () => {
    expect(getSupportedCoverages("left_full_sleeve")).toEqual([
      "complete",
      "inner",
      "outer",
    ]);
    expect(getSupportedCoverages("right_full_sleeve")).toEqual([
      "complete",
      "inner",
      "outer",
    ]);
  });

  it("full leg supports complete/inner/outer", () => {
    expect(getSupportedCoverages("left_full_leg")).toEqual([
      "complete",
      "inner",
      "outer",
    ]);
    expect(getSupportedCoverages("right_full_leg")).toEqual([
      "complete",
      "inner",
      "outer",
    ]);
  });

  it("upper arm / forearm / thigh / lower leg support coverage", () => {
    for (const id of [
      "right_upper_arm",
      "left_forearm",
      "right_thigh",
      "left_lower_leg",
    ]) {
      expect(getSupportedCoverages(id)).toEqual([
        "complete",
        "inner",
        "outer",
      ]);
    }
  });

  it("full sleeve does not include hand atomics", () => {
    const atomics = resolveTargetToAtomicZoneIds("left_full_sleeve");
    expect(atomics).not.toContain("left_hand");
    expect(atomics).toContain("left_shoulder");
    expect(atomics).toContain("left_wrist");
  });

  it("full leg does not include foot atomics", () => {
    const atomics = resolveTargetToAtomicZoneIds("right_full_leg");
    expect(atomics).not.toContain("right_foot");
    expect(atomics.some((id) => id.includes("thigh"))).toBe(true);
  });
});

describe("canonical persistence", () => {
  it("canonical state persists regionId + coverage", () => {
    const token = serializeBodyPlacement({
      regionId: "left_full_sleeve",
      coverage: "outer",
    });
    expect(token).toBe("left_full_sleeve@outer");
    expect(parseBodyPlacementToken(token)).toEqual({
      regionId: "left_full_sleeve",
      coverage: "outer",
    });
    const payload = serializeConceptualBodySelection([token]);
    expect(payload.selectedBodyTargets).toEqual(["left_full_sleeve@outer"]);
    expect(payload.selectedBodyPlacements).toEqual([
      { regionId: "left_full_sleeve", coverage: "outer" },
    ]);
  });

  it("complete coverage serializes as bare regionId", () => {
    expect(
      serializeBodyPlacement({
        regionId: "full_chest",
        coverage: "complete",
      }),
    ).toBe("full_chest");
  });

  it("legacy pectoral IDs migrate to full chest", () => {
    expect(LEGACY_REGION_ID_MIGRATIONS.left_pectoral).toBe("full_chest");
    expect(LEGACY_REGION_ID_MIGRATIONS.right_pectoral).toBe("full_chest");
    expect(upgradeBodySelectionToPublicTargets(["left_chest"])).toEqual([
      "full_chest",
    ]);
    expect(upgradeBodySelectionToPublicTargets(["right_pectoral"])).toEqual([
      "full_chest",
    ]);
    expect(normalizeQuoteBodyTargets(["left_chest", "right_chest"])).toEqual([
      "full_chest",
    ]);
  });

  it("tokensToPlacements round-trips coverage", () => {
    expect(tokensToPlacements(["right_thigh@inner", "full_abdomen"])).toEqual([
      { regionId: "right_thigh", coverage: "inner" },
      { regionId: "full_abdomen", coverage: "complete" },
    ]);
  });
});

describe("labels match side", () => {
  it("left/right labels match catalog side", () => {
    for (const id of PUBLIC_SELECTABLE_BODY_TARGET_IDS) {
      const meta = getPublicRegionMeta(id)!;
      const label = getPublicShortLabel(id).toLowerCase();
      if (meta.side === "left") {
        expect(label.includes("izquier")).toBe(true);
      }
      if (meta.side === "right") {
        expect(label.includes("derech")).toBe(true);
      }
    }
  });
});

describe("routing coherence audit", () => {
  const cases: Array<{
    atomic: string;
    expectedPrimary: string;
    category: string;
    side?: "left" | "right" | "both" | "center";
  }> = [
    { atomic: "left_ribs", expectedPrimary: "left_ribs", category: "torso", side: "left" },
    { atomic: "right_ribs", expectedPrimary: "right_ribs", category: "torso", side: "right" },
    { atomic: "left_chest", expectedPrimary: "full_chest", category: "torso", side: "both" },
    { atomic: "right_chest", expectedPrimary: "full_chest", category: "torso", side: "both" },
    { atomic: "sternum", expectedPrimary: "full_chest", category: "torso", side: "both" },
    {
      atomic: "left_upper_arm_front",
      expectedPrimary: "left_biceps_region",
      category: "arm",
      side: "left",
    },
    {
      atomic: "right_upper_arm_back",
      expectedPrimary: "right_triceps_region",
      category: "arm",
      side: "right",
    },
    {
      atomic: "left_thigh_outer",
      expectedPrimary: "left_thigh_outer",
      category: "leg",
      side: "left",
    },
    {
      atomic: "right_thigh_inner",
      expectedPrimary: "right_thigh_inner",
      category: "leg",
      side: "right",
    },
    {
      atomic: "left_scapula",
      expectedPrimary: "upper_back_large",
      category: "back",
      side: "both",
    },
    {
      atomic: "lower_back_center",
      expectedPrimary: "lower_back_large",
      category: "back",
      side: "both",
    },
  ];

  it("routing target matches anatomical category and side", () => {
    for (const c of cases) {
      const primary = getPrimaryPublicSelectionTarget(c.atomic);
      expect(primary, c.atomic).toBe(c.expectedPrimary);
      const meta = getPublicCatalogEntry(primary!);
      expect(meta?.category, c.atomic).toBe(c.category);
      if (c.side) expect(meta?.side, c.atomic).toBe(c.side);

      const highlights = resolvePublicTargetHighlightRegions(primary!);
      expect(highlights.length, `${c.atomic} highlight`).toBeGreaterThan(0);

      // No torso label → arm highlight
      if (c.category === "torso" || c.category === "back") {
        expect(
          highlights.every(
            (h) =>
              !h.includes("biceps") &&
              !h.includes("triceps") &&
              !h.includes("forearm") &&
              !h.includes("shoulder_surface"),
          ),
          `${c.atomic} must not highlight arm`,
        ).toBe(true);
      }

      // Side coherence for lateral targets
      if (c.side === "left") {
        expect(
          highlights.every((h) => !h.startsWith("right_")),
          `${c.atomic} left→right mismatch`,
        ).toBe(true);
      }
      if (c.side === "right") {
        expect(
          highlights.every((h) => !h.startsWith("left_")),
          `${c.atomic} right→left mismatch`,
        ).toBe(true);
      }
    }
  });

  it("ribs primary options are ribs (not arm)", () => {
    const left = getPublicSelectionOptionsForAtomicZone("left_ribs").map(
      (o) => o.targetId,
    );
    expect(left[0]).toBe("left_ribs");
    expect(left.every((id) => !id.includes("arm") && !id.includes("sleeve"))).toBe(
      true,
    );
  });
});

describe("contiguous selection rules", () => {
  it("distant selections remain blocked", () => {
    const distant = tryAddContiguousPublicTarget(
      ["full_chest"],
      "left_lower_leg_back",
    );
    expect(distant.ok).toBe(false);
    if (!distant.ok) {
      expect(distant.message).toMatch(/separada/i);
    }
    expect(
      isConnectedBodySelection(["full_chest", "left_lower_leg_front"]),
    ).toBe(false);
  });

  it("connected selections remain allowed", () => {
    expect(tryAddContiguousPublicTarget(["full_chest"], "full_abdomen").ok).toBe(
      true,
    );
    expect(
      tryAddContiguousPublicTarget(["right_ribs"], "full_abdomen").ok,
    ).toBe(true);
  });

  it("normalizations remain valid", () => {
    expect(
      normalizeConnectedBodySelection(["upper_back_large", "lower_back_large"]),
    ).toEqual(["full_back"]);
    expect(
      normalizeConnectedBodySelection([
        "right_biceps_region",
        "right_triceps_region",
      ]),
    ).toEqual(["right_upper_arm"]);
    expect(
      normalizeConnectedBodySelection(["left_chest", "right_chest"]),
    ).toEqual(["full_chest"]);
  });
});

describe("catalog metadata completeness", () => {
  it("every public entry has required metadata fields", () => {
    for (const e of BODY_PUBLIC_SELECTION_CATALOG.filter(
      (x) => x.publicSelectable,
    )) {
      expect(e.shortLabel.length).toBeGreaterThan(0);
      expect(e.description.length).toBeGreaterThan(0);
      expect(e.side).toBeTruthy();
      expect(e.category).toBeTruthy();
      expect(e.supportedCoverages.length).toBeGreaterThan(0);
      expect(e.preferredView).toBeTruthy();
      expect(e.focusSection).toBeTruthy();
      expect(e.memberIds.length).toBeGreaterThan(0);
    }
  });
});
