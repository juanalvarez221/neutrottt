/**
 * Full Chest Visual Boundary V2.4 — analytical SDF tests.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  BODY_PUBLIC_REGION_MASK_SRC,
  buildPublicRegionMaskSrc,
} from "@/widgets/body-3d/domain/bodyPublicRegionMask";
import {
  buildPublicRegionSdfSrc,
  getPublicRegionSdfSrc,
  getPublicRegionVisualAsset,
  regionIdsWithSdf,
} from "@/widgets/body-3d/domain/bodyPublicRegionVisualAssets";
import { REGION_MASK_COVERAGE_GLSL } from "@/widgets/body-3d/interaction/regionMaskCoverage";
import {
  REGION_MASK_SDF_GLSL,
  sampleSdfVisualCoverageJs,
} from "@/widgets/body-3d/interaction/regionMaskSdf";

const ROOT = process.cwd();

describe("full_chest V2.4 visual SDF", () => {
  it("IDs never interpolate numerically", () => {
    expect(REGION_MASK_COVERAGE_GLSL).not.toMatch(/mix\(\s*id/);
    expect(REGION_MASK_SDF_GLSL).toMatch(/sampleSdfVisualCoverage/);
    expect(REGION_MASK_SDF_GLSL).not.toMatch(/mix\(.*maskId/);
  });

  it("V2.5 retired the SDF UV path from the runtime highlight", () => {
    const src = readFileSync(
      path.join(
        ROOT,
        "src/widgets/body-3d/interaction/BodyPublicRegionMaskHighlight.tsx",
      ),
      "utf8",
    );
    expect(src).toMatch(/NearestFilter/);
    expect(src).toMatch(/HOVER_OPACITY = 0.78/);
    expect(src).toMatch(/SELECTED_OPACITY = 0.9/);
    expect(src).not.toMatch(/uUseSdf/);
    expect(src).not.toMatch(/sampleSdfVisualCoverage/);
    expect(src).not.toMatch(/getPublicRegionSdfSrc/);
  });

  it("manifest versions SDF URL by hash", () => {
    const a = buildPublicRegionSdfSrc("/models/interaction/sdf/x.png", "aaa");
    const b = buildPublicRegionSdfSrc("/models/interaction/sdf/x.png", "bbb");
    expect(a).not.toBe(b);
    expect(a).toContain("?v=aaa");
  });

  it("full_chest has no productive SDF UV (Geometry Field is official)", () => {
    const asset = getPublicRegionVisualAsset("full_chest");
    expect(asset?.maskIndex).toBe(9);
    expect(asset?.sdfUrl).toBeUndefined();
    expect(getPublicRegionSdfSrc("full_chest")).toBeNull();
    expect(regionIdsWithSdf(["full_chest"])).toBeNull();
  });

  it("abdomen uses geometry field without legacy SDF UV", () => {
    const asset = getPublicRegionVisualAsset("full_abdomen");
    expect(asset?.maskIndex).toBe(11);
    expect(asset?.sdfUrl).toBeUndefined();
    expect(getPublicRegionSdfSrc("full_abdomen")).toBeNull();
    expect(regionIdsWithSdf(["full_abdomen_region"])).toBeNull();
  });

  it("categorical mask URL stays independent of SDF hash", () => {
    expect(BODY_PUBLIC_REGION_MASK_SRC).toMatch(
      /neutro_body_v1_anatomical_region_ids\.png/,
    );
    expect(buildPublicRegionMaskSrc("/m.png", "x")).toBe("/m.png?v=x");
  });

  it("SDF coverage interior≈1 exterior≈0 edge in (0,1)", () => {
    // Synthetic field: left half inside (enc=1), right outside (enc=0), mid=0.5
    const sample = (u: number, _v: number) => {
      void _v;
      if (u < 0.45) return 1;
      if (u > 0.55) return 0;
      return 0.5;
    };
    expect(sampleSdfVisualCoverageJs(sample, 0.012, 0.2, 0.5, 0.0002)).toBeGreaterThan(
      0.98,
    );
    expect(sampleSdfVisualCoverageJs(sample, 0.012, 0.8, 0.5, 0.0002)).toBeLessThan(
      0.02,
    );
    const edge = sampleSdfVisualCoverageJs(sample, 0.012, 0.5, 0.5, 0.0008);
    expect(edge).toBeGreaterThan(0.2);
    expect(edge).toBeLessThan(0.8);
  });

  it("generator encodes analytical SDF (not binary DT)", () => {
    const src = readFileSync(
      path.join(ROOT, "tools/body-regions/generate-full-chest-sdf.mjs"),
      "utf8",
    );
    expect(src).toMatch(/analyticalSignedDistance/);
    expect(src).toMatch(/SDF_RANGE_M = 0\.012/);
    expect(src).not.toMatch(/distanceTransform/);
    expect(src).toMatch(/encodeSdf/);
  });
});
