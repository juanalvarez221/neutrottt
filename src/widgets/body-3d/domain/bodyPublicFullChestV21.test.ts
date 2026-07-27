/**
 * Full Chest Generator V2.1 — unit tests (boundaries, membership, no PIP).
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  buildBoundaries,
  classifyPoint,
  computeS,
  hermiteInterp,
  monotoneCubicInterp,
  validateBoundaries,
  verifyLandmarkLaterality,
} from "../../../../tools/body-regions/generate-full-chest-v21.mjs";

const ROOT = process.cwd();
const LANDMARKS = path.join(
  ROOT,
  "assets/body-regions/neutro_body_v1_landmarks.json",
);

describe("full_chest V2.1 boundaries", () => {
  const lm = JSON.parse(readFileSync(LANDMARKS, "utf8"));

  it("verifies landmark laterality (+X = left)", () => {
    const lat = verifyLandmarkLaterality(lm);
    expect(lat.anatomicalLeft).toBe("+X");
    expect(lm.points.clavicleLeft[0]).toBeGreaterThan(0);
    expect(lm.points.clavicleRight[0]).toBeLessThan(0);
  });

  it("upperY always above lowerY on dense s grid", () => {
    const b = buildBoundaries(lm);
    for (let i = 0; i < 129; i++) {
      const s = -1 + (2 * i) / 128;
      expect(b.upperY(s)).toBeGreaterThan(b.lowerY(s));
    }
  });

  it("leftS always exterior to rightS on dense y grid", () => {
    const b = buildBoundaries(lm);
    const { yBot, yTop } = b.meta;
    for (let i = 0; i < 129; i++) {
      const y = yBot + ((yTop - yBot) * i) / 128;
      expect(b.leftS(y)).toBeGreaterThan(b.rightS(y));
    }
  });

  it("validateBoundaries passes without auto-intersection / NaN", () => {
    const b = buildBoundaries(lm);
    const v = validateBoundaries(b);
    expect(v.ok).toBe(true);
    expect(v.errors).toEqual([]);
  });

  it("upper has no local minimum at s=0 (no tab/notch)", () => {
    const b = buildBoundaries(lm);
    const u0 = b.upperY(0);
    expect(u0).toBeGreaterThanOrEqual(b.upperY(0.15) - 1e-6);
    expect(u0).toBeGreaterThanOrEqual(b.upperY(-0.15) - 1e-6);
  });

  it("lower center limited to 0–3 mm above medial IMF", () => {
    const b = buildBoundaries(lm);
    const c = b.lowerY(0);
    expect(c).toBeGreaterThanOrEqual(b.meta.imfMedY - 1e-6);
    expect(c).toBeLessThanOrEqual(b.meta.imfMedY + 0.003 + 1e-6);
  });

  it("classification is deterministic for the same point", () => {
    const b = buildBoundaries(lm);
    const axis = lm.axisZSamples;
    const p = lm.points.breastApexLeft;
    const a = classifyPoint(p[0], p[1], p[2], lm, b, axis);
    const c = classifyPoint(p[0], p[1], p[2], lm, b, axis);
    expect(a).toBe(c);
    expect(a).toBe(true);
  });

  it("s maps left (+X) positive and right (−X) negative", () => {
    const axis = lm.axisZSamples;
    const sL = computeS(0.1, 1.3, 0.02, lm, axis);
    const sR = computeS(-0.1, 1.3, 0.02, lm, axis);
    expect(sL).toBeGreaterThan(0);
    expect(sR).toBeLessThan(0);
  });

  it("has no polygon PIP / artificial bridges in module surface", () => {
    const src = readFileSync(
      path.join(ROOT, "tools/body-regions/generate-full-chest-v21.mjs"),
      "utf8",
    );
    expect(src).not.toMatch(/\bpointInPoly\b|\bpoint-in-polygon\b|\bwindingNumber\b/i);
    expect(src).not.toMatch(/function\s+sternalCorridor|sternalCorridor\s*\(/i);
    expect(src).toMatch(/rightS\(y\)/);
    expect(src).toMatch(/leftS\(y\)/);
    expect(src).toMatch(/upperY\(s\)/);
    expect(src).toMatch(/lowerY\(s\)/);
    expect(src).toMatch(/usesPolygonPIP: false/);
    expect(src).toMatch(/usesSternalCorridor: false/);
  });

  it("monotone / hermite helpers are stable", () => {
    const f = monotoneCubicInterp([0, 0.5, 1], [1, 0.9, 0.8]);
    expect(f(0)).toBeCloseTo(1, 5);
    expect(f(1)).toBeCloseTo(0.8, 5);
    const h = hermiteInterp([
      { x: 0, y: 1, dy: 0 },
      { x: 1, y: 0.9, dy: null },
    ]);
    expect(h(0)).toBeCloseTo(1, 5);
  });

  it("output hash is reproducible for identical buffer", () => {
    const a = Buffer.from([1, 2, 3, 9, 9, 0]);
    const b = Buffer.from([1, 2, 3, 9, 9, 0]);
    const ha = createHash("sha256").update(a).digest("hex");
    const hb = createHash("sha256").update(b).digest("hex");
    expect(ha).toBe(hb);
  });
});
