/**
 * Highlight coverage shader / JS mirror — IDs stay categorical.
 */
import { describe, expect, it } from "vitest";
import {
  binaryCenterMembership,
  REGION_MASK_COVERAGE_GLSL,
  sampleRegionCoverageJs,
} from "@/widgets/body-3d/interaction/regionMaskCoverage";

describe("regionMaskCoverage shader contract", () => {
  it("never mixes ID numbers numerically", () => {
    expect(REGION_MASK_COVERAGE_GLSL).not.toMatch(/mix\(\s*id/);
    expect(REGION_MASK_COVERAGE_GLSL).toMatch(
      /float m00 = float\(abs\(maskIdAt\(mask, uv00\) - activeRegionId\) < 0\.5\)/,
    );
  });

  it("coverage compares equality with activeRegionId only", () => {
    expect(REGION_MASK_COVERAGE_GLSL).toMatch(/activeRegionId/);
    expect(REGION_MASK_COVERAGE_GLSL).toMatch(/fwidth\(cov\)/);
  });

  it("interior ≈ 1, exterior ≈ 0, edge in (0,1)", () => {
    const size = 32;
    const data = new Uint8Array(size * size);
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        data[y * size + x] = x < 16 ? 9 : 7;
      }
    }
    const at = (x: number, y: number) => data[y * size + x];
    expect(sampleRegionCoverageJs(at, size, 9, 0.15, 0.5, 0.02)).toBeGreaterThan(
      0.98,
    );
    expect(sampleRegionCoverageJs(at, size, 9, 0.85, 0.5, 0.02)).toBeLessThan(
      0.02,
    );
    const edge = sampleRegionCoverageJs(at, size, 9, 0.5, 0.5, 0.1);
    expect(edge).toBeGreaterThan(0.05);
    expect(edge).toBeLessThan(0.95);
  });

  it("neighbor regions do not contaminate highlight", () => {
    const size = 16;
    const data = new Uint8Array(size * size);
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        data[y * size + x] = x < 8 ? 9 : 4;
      }
    }
    const at = (x: number, y: number) => data[y * size + x];
    // Deep in region 9 — asking for region 4 must be ~0
    expect(sampleRegionCoverageJs(at, size, 4, 0.2, 0.5, 0.02)).toBeLessThan(
      0.02,
    );
    // Deep in region 4 — asking for region 9 must be ~0
    expect(sampleRegionCoverageJs(at, size, 9, 0.8, 0.5, 0.02)).toBeLessThan(
      0.02,
    );
  });

  it("binary selection authority stays nearest-center", () => {
    const size = 4;
    const data = new Uint8Array(16).fill(0);
    data[0] = 9;
    data[1] = 9;
    const at = (x: number, y: number) => data[y * size + x];
    expect(binaryCenterMembership(at, size, 9, 0.1, 0.9)).toBe(1);
    expect(binaryCenterMembership(at, size, 9, 0.9, 0.9)).toBe(0);
  });
});
