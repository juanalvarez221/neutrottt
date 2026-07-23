import { describe, expect, it } from "vitest";
import {
  getPublicDescription,
  getPublicFullLabel,
  getPublicRegionMeta,
  getPublicShortLabel,
  PUBLIC_REGION_META,
} from "@/widgets/body-3d/domain/bodyPublicRegionMeta";
import {
  listPublicTargetsMissingMeta,
  PUBLIC_SELECTABLE_BODY_TARGET_IDS,
  PUBLIC_SELECTION_TARGETS,
} from "@/widgets/body-3d/domain/bodyPublicSelectionTargets";
import {
  placeHoverTooltip,
  resolveContextualPanelSide,
  resolveDesktopPanelMaxWidth,
  resolveSelectorLayoutMode,
} from "@/widgets/body-3d/ux/bodySelectorLayout";

describe("public region professional metadata", () => {
  it("every public target has shortLabel, fullLabel and category", () => {
    expect(listPublicTargetsMissingMeta()).toEqual([]);
    for (const target of PUBLIC_SELECTION_TARGETS) {
      const meta = getPublicRegionMeta(target.id);
      expect(meta, target.id).toBeDefined();
      expect(meta!.shortLabel.length).toBeGreaterThan(0);
      expect(meta!.fullLabel.length).toBeGreaterThan(0);
      expect(meta!.description.length).toBeGreaterThan(0);
      expect(meta!.category).toBeTruthy();
    }
  });

  it("covers key professional labels", () => {
    expect(getPublicShortLabel("right_biceps_region")).toBe("Bíceps derecho");
    expect(getPublicFullLabel("right_biceps_region")).toContain(
      "Cara anterior del brazo superior",
    );
    expect(getPublicShortLabel("right_triceps_region")).toBe("Tríceps derecho");
    expect(getPublicShortLabel("full_chest")).toBe("Pecho completo");
    expect(getPublicFullLabel("full_chest")).toBe(
      "Pecho completo · Región pectoral",
    );
    expect(getPublicShortLabel("right_chest")).toBe("Pectoral derecho");
    expect(getPublicShortLabel("upper_back_large")).toBe("Espalda alta");
    expect(getPublicDescription("upper_back_large")).toBe(
      "Región escapular y dorsal superior",
    );
    expect(getPublicShortLabel("lower_back_large")).toBe("Espalda baja");
    expect(getPublicShortLabel("right_thigh_front")).toBe(
      "Muslo derecho · Cara anterior",
    );
    expect(getPublicShortLabel("head_top")).toBe("Cabeza · Parte superior");
    expect(getPublicShortLabel("neck_front")).toBe("Cuello · Parte anterior");
  });

  it("meta catalog covers all selectable public ids", () => {
    for (const id of PUBLIC_SELECTABLE_BODY_TARGET_IDS) {
      expect(getPublicRegionMeta(id), id).toBeDefined();
    }
    expect(PUBLIC_REGION_META.length).toBeGreaterThanOrEqual(
      PUBLIC_SELECTABLE_BODY_TARGET_IDS.size,
    );
  });
});

describe("body selector layout helpers", () => {
  it("places tooltip to the right when there is space", () => {
    const p = placeHoverTooltip(100, 200, 1280, 800);
    expect(p.side).toBe("right");
    expect(p.left).toBeGreaterThan(100);
  });

  it("places tooltip to the left near the right edge", () => {
    const p = placeHoverTooltip(1200, 200, 1280, 800);
    expect(p.side).toBe("left");
    expect(p.left).toBeLessThan(1200);
  });

  it("clamps tooltip within viewport", () => {
    const p = placeHoverTooltip(10, 5, 320, 568);
    expect(p.left).toBeGreaterThanOrEqual(12);
    expect(p.top).toBeGreaterThanOrEqual(12);
  });

  it("resolves panel side opposite to focus", () => {
    expect(resolveContextualPanelSide(900, 1280)).toBe("left");
    expect(resolveContextualPanelSide(200, 1280)).toBe("right");
  });

  it("resolves adaptive layout modes", () => {
    expect(resolveSelectorLayoutMode(1440)).toBe("desktop-wide");
    expect(resolveSelectorLayoutMode(1024)).toBe("desktop-medium");
    expect(resolveSelectorLayoutMode(800)).toBe("tablet-sheet");
    expect(resolveSelectorLayoutMode(390)).toBe("mobile-sheet");
  });

  it("limits medium desktop panel width", () => {
    expect(resolveDesktopPanelMaxWidth("desktop-wide", 1920)).toBe(320);
    expect(resolveDesktopPanelMaxWidth("desktop-medium", 1000)).toBe(300);
    expect(resolveDesktopPanelMaxWidth("desktop-medium", 900)).toBe(288);
  });
});
