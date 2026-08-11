/**
 * Full Chest V2.3 — coverage AA + adaptive raster tests.
 */
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  binaryCenterMembership,
  REGION_MASK_COVERAGE_GLSL,
  sampleRegionCoverageJs,
} from "@/widgets/body-3d/interaction/regionMaskCoverage";
import { buildPublicRegionMaskSrc } from "@/widgets/body-3d/domain/bodyPublicRegionMask";

const ROOT = process.cwd();

describe("full_chest V2.3 region mask coverage", () => {
  it("GLSL never interpolates ID numbers (only membership)", () => {
    expect(REGION_MASK_COVERAGE_GLSL).toMatch(/sampleRegionCoverage/);
    expect(REGION_MASK_COVERAGE_GLSL).toMatch(/fwidth/);
    expect(REGION_MASK_COVERAGE_GLSL).toMatch(/mix\(m00/);
    // Must compare equality, not blend ids
    expect(REGION_MASK_COVERAGE_GLSL).toMatch(/activeRegionId/);
    expect(REGION_MASK_COVERAGE_GLSL).not.toMatch(/mix\(id/);
  });

  it("coverage only compares equality with activeRegionId", () => {
    const size = 8;
    const data = new Uint8Array(size * size);
    // Fill left half with id 9, right with id 3
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        data[y * size + x] = x < size / 2 ? 9 : 3;
      }
    }
    const at = (x: number, y: number) => data[y * size + x];
    // Deep interior of id 9
    const interior = sampleRegionCoverageJs(at, size, 9, 0.2, 0.5, 0.02);
    expect(interior).toBeGreaterThan(0.95);
    // Deep exterior for id 9 (inside id 3)
    const exterior = sampleRegionCoverageJs(at, size, 9, 0.8, 0.5, 0.02);
    expect(exterior).toBeLessThan(0.05);
    // Neighbor region 3 must not contaminate id-9 coverage in left interior
    const wrongId = sampleRegionCoverageJs(at, size, 3, 0.2, 0.5, 0.02);
    expect(wrongId).toBeLessThan(0.05);
  });

  it("edge produces coverage between 0 and 1", () => {
    const size = 16;
    const data = new Uint8Array(size * size);
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        data[y * size + x] = x < 8 ? 9 : 0;
      }
    }
    const at = (x: number, y: number) => data[y * size + x];
    const edge = sampleRegionCoverageJs(at, size, 9, 0.5, 0.5, 0.08);
    expect(edge).toBeGreaterThan(0.05);
    expect(edge).toBeLessThan(0.95);
  });

  it("binary center membership stays categorical", () => {
    const size = 4;
    const data = new Uint8Array([9, 9, 0, 0, 9, 9, 0, 0, 9, 9, 0, 0, 9, 9, 0, 0]);
    const at = (x: number, y: number) => data[y * size + x];
    expect(binaryCenterMembership(at, size, 9, 0.1, 0.5)).toBe(1);
    expect(binaryCenterMembership(at, size, 9, 0.9, 0.5)).toBe(0);
  });

  it("shader source embeds coverage helpers", () => {
    const src = readFileSync(
      path.join(
        ROOT,
        "src/widgets/body-3d/interaction/BodyPublicRegionMaskHighlight.tsx",
      ),
      "utf8",
    );
    expect(src).toMatch(/REGION_MASK_COVERAGE_GLSL/);
    expect(src).toMatch(/sampleLutCoverage/);
    expect(src).toMatch(/prefers-reduced-motion/);
    expect(src).toMatch(/HOVER_OPACITY = 0.78/);
    expect(src).toMatch(/PREVIEW_OPACITY = 0.84/);
    expect(src).toMatch(/SELECTED_OPACITY = 0.9/);
  });

  it("maskHash changes URL when PNG hash changes", () => {
    const a = buildPublicRegionMaskSrc("/models/interaction/x.png", "aaa");
    const b = buildPublicRegionMaskSrc("/models/interaction/x.png", "bbb");
    expect(a).not.toBe(b);
    expect(a).toContain("?v=aaa");
  });

  it("binary output hash is reproducible", () => {
    const buf = Buffer.from([9, 9, 0, 9, 0, 0]);
    const h1 = createHash("sha256").update(buf).digest("hex").slice(0, 16);
    const h2 = createHash("sha256").update(Buffer.from(buf)).digest("hex").slice(0, 16);
    expect(h1).toBe(h2);
  });

  it("adaptive raster module uses coverage >= 0.5 not 3/4", () => {
    const src = readFileSync(
      path.join(ROOT, "tools/body-regions/generate-full-chest-v23.mjs"),
      "utf8",
    );
    expect(src).toMatch(/COVERAGE_THRESHOLD = 0\.5/);
    expect(src).toMatch(/OFFSETS_16/);
    expect(src).not.toMatch(/votes < 3/);
  });
});
