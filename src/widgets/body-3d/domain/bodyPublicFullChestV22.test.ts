/**
 * Full Chest V2.2 — surface arc parametrization tests.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { loadMeshData } from "../../../../tools/body-mask/glb.mjs";
import { buildBoundaries } from "../../../../tools/body-regions/generate-full-chest-v21.mjs";
import {
  buildSurfaceSField,
  computeSCartesian,
  computeSSurface,
  extractAnteriorArc,
  intersectMeshAtY,
  measureFieldIntegrity,
  selectTorsoPolyline,
  stitchPolylines,
} from "../../../../tools/body-regions/surface-s-field.mjs";

const ROOT = process.cwd();
const LANDMARKS = path.join(
  ROOT,
  "assets/body-regions/neutro_body_v1_landmarks.json",
);
const GLB = path.join(ROOT, "public/models/production/neutro_body_v1.glb");

describe("full_chest V2.2 surface s field", () => {
  const lm = JSON.parse(readFileSync(LANDMARKS, "utf8"));
  const mesh = loadMeshData(GLB);
  const bounds = buildBoundaries(lm);
  const yMin = bounds.meta.yBot - 0.015;
  const yMax = bounds.meta.yTop + 0.04;
  const field = buildSurfaceSField(mesh, lm, yMin, yMax, 48);

  it("selected section contains sternum vicinity", () => {
    const mid = field.slices.find((s) => s.status === "ok" && s.arc);
    expect(mid).toBeTruthy();
    expect(mid!.arc).toBeTruthy();
    expect(Math.abs(mid!.arc!.sternum[0])).toBeLessThan(0.05);
    expect(mid!.arc!.sternum[2]).toBeGreaterThan(-0.05);
  });

  it("arcs terminate near axillary folds (signs)", () => {
    const ok = field.slices.filter((s) => s.arc);
    expect(ok.length).toBeGreaterThan(10);
    for (const s of ok.slice(0, 20)) {
      expect(s.arc!.axRight[0]).toBeLessThan(0);
      expect(s.arc!.axLeft[0]).toBeGreaterThan(0);
    }
  });

  it("anterior arc does not pass through back", () => {
    for (const s of field.slices) {
      if (!s.arc) continue;
      const meanZ =
        s.arc.points.reduce((a, p) => a + p[2], 0) / s.arc.points.length;
      const minZ = Math.min(...s.arc.points.map((p) => p[2]));
      expect(meanZ).toBeGreaterThan(-0.05);
      expect(minZ).toBeGreaterThan(-0.12);
    }
  });

  it("arms do not belong to the field", () => {
    const axR = lm.points.anteriorAxillaryFoldRight;
    const axL = lm.points.anteriorAxillaryFoldLeft;
    const armR = computeSSurface(axR[0] - 0.08, axR[1], axR[2], field);
    const armL = computeSSurface(axL[0] + 0.08, axL[1], axL[2], field);
    // Far lateral arm points should fail projection tolerance or |s|>1
    expect(armR == null || Math.abs(armR.s) > 1.0 || armR.dist > field.tolerance).toBe(
      true,
    );
    expect(armL == null || Math.abs(armL.s) > 1.0 || armL.dist > field.tolerance).toBe(
      true,
    );
  });

  it("s_surface is continuous across neighboring slices", () => {
    const ok = field.slices.filter((s) => s.arc);
    for (let i = 1; i < ok.length; i++) {
      const a = ok[i - 1].arc!.sternum;
      const b = ok[i].arc!.sternum;
      expect(Math.hypot(a[0] - b[0], a[2] - b[2])).toBeLessThan(0.05);
    }
  });

  it("s_surface preserves left/right convention (+X = left = +s)", () => {
    const integrity = measureFieldIntegrity(mesh, field, lm, yMin, yMax);
    expect(integrity.inversions).toBe(0);
    expect(integrity.landmarks.sternum).not.toBeNull();
    if (integrity.landmarks.sternum != null) {
      expect(Math.abs(integrity.landmarks.sternum)).toBeLessThan(0.35);
    }
    if (integrity.landmarks.axRight != null) {
      expect(integrity.landmarks.axRight).toBeLessThan(0);
    }
    if (integrity.landmarks.axLeft != null) {
      expect(integrity.landmarks.axLeft).toBeGreaterThan(0);
    }
  });

  it("profile projection does not leave empty axillary band", () => {
    // Sample points along frontal-lateral breast surface
    let hits = 0;
    let total = 0;
    for (let i = 0; i < 40; i++) {
      const y = yMin + ((yMax - yMin) * i) / 39;
      for (const x of [-0.1, -0.08, 0.08, 0.1]) {
        const z = 0.02;
        total++;
        const r = computeSSurface(x, y, z, field);
        if (r && Math.abs(r.s) <= 1.05) hits++;
      }
    }
    expect(hits / total).toBeGreaterThan(0.35);
  });

  it("output field build is deterministic", () => {
    const a = buildSurfaceSField(mesh, lm, yMin, yMax, 32);
    const b = buildSurfaceSField(mesh, lm, yMin, yMax, 32);
    expect(a.valid).toBe(b.valid);
    expect(a.interpolated).toBe(b.interpolated);
    expect(a.slices[10]?.arc?.totalLen).toBeCloseTo(
      b.slices[10]?.arc?.totalLen ?? -1,
      5,
    );
  });

  it("does not use cartesian x/axFold in surface module classify path", () => {
    const src = readFileSync(
      path.join(ROOT, "tools/body-regions/generate-full-chest-v22.mjs"),
      "utf8",
    );
    expect(src).toMatch(/computeSSurface/);
    expect(src).toMatch(/classifyPointV22/);
    expect(src).not.toMatch(/s = x \/ axFold/);
  });

  it("stitch + torso select reject tiny arm loops", () => {
    const y = 0.5 * (yMin + yMax);
    const { segments } = intersectMeshAtY(mesh, y);
    const polys = stitchPolylines(segments);
    const sel = selectTorsoPolyline(polys, y, lm, null);
    expect(sel.best).toBeTruthy();
    const arc = extractAnteriorArc(
      sel.best.poly.pts,
      y,
      lm,
      sel.best.poly.closed,
    );
    expect(arc).toBeTruthy();
    expect(arc!.axRight[0]).toBeLessThan(arc!.axLeft[0]);
  });

  it("cartesian helper remains available only for comparison", () => {
    expect(computeSCartesian(0.132, lm)).toBeCloseTo(1, 1);
    expect(computeSCartesian(-0.132, lm)).toBeCloseTo(-1, 1);
  });
});
