/**
 * Full Chest Anatomical Refinement V2.6 — candidate sweep, filters, metrics,
 * finalist selection, and highlight/hit-area alignment on the frozen V2.5
 * Geometry Distance Field pipeline. Nothing here promotes official assets.
 */
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  buildBoundaries,
  DEFAULT_BOUNDARY_OPTS,
} from "../../../../tools/body-regions/generate-full-chest-v21.mjs";
import {
  buildCandidateGrid,
  buildHitProbes,
  buildV26Context,
  evaluateAllCandidates,
  evaluateCandidate,
  sampleHitAlignment,
} from "../../../../tools/body-regions/full-chest-v26.mjs";

const ROOT = process.cwd();
const GLB = path.join(ROOT, "public/models/production/neutro_body_v1.glb");
const LANDMARKS = path.join(
  ROOT,
  "assets/body-regions/neutro_body_v1_landmarks.json",
);
const APPROVED = path.join(ROOT, "artifacts/full-chest-v26/approved");

// Shared frozen context (mesh + landmarks + s_surface) built once.
const ctx = buildV26Context(GLB, LANDMARKS);
const sweep = evaluateAllCandidates(ctx);

describe("full_chest V2.6 candidate engine", () => {
  it("keeps the V2.5 default boundaries bit-identical when no options are passed", () => {
    const lm = JSON.parse(readFileSync(LANDMARKS, "utf8"));
    const a = buildBoundaries(lm);
    const b = buildBoundaries(lm, DEFAULT_BOUNDARY_OPTS);
    for (let s = -1; s <= 1; s += 0.05) {
      expect(a.upperY(s)).toBeCloseTo(b.upperY(s), 12);
      expect(a.lowerY(s)).toBeCloseTo(b.lowerY(s), 12);
    }
    // The default lower center sits at imfMed + 1 mm (frozen V2.2 value).
    expect(a.meta.centerLowY).toBeCloseTo(a.meta.imfMedY + 0.001, 9);
    expect(a.meta.infraclavicularOffset).toBe(0.012);
  });

  it("generates exactly 8 deterministic candidates over the 2x2x2 grid", () => {
    const grid1 = buildCandidateGrid();
    const grid2 = buildCandidateGrid();
    expect(grid1).toHaveLength(8);
    expect(grid1.map((c) => c.id)).toEqual(grid2.map((c) => c.id));
    const infra = new Set(grid1.map((c) => c.infraclavicularOffset));
    const rise = new Set(grid1.map((c) => c.upperCenterRise));
    const trans = new Set(grid1.map((c) => c.inferiorCenterTransition));
    expect([...infra].sort()).toEqual([0.01, 0.014]);
    expect([...rise].sort()).toEqual([0, 0.003]);
    expect([...trans].sort()).toEqual([0, 0.002]);
    for (const c of grid1) expect(c.lateralInsetMeters).toBe(0);
  });

  it("is deterministic: re-evaluating a candidate gives identical field", () => {
    const params = buildCandidateGrid()[6]!; // C07
    const a = evaluateCandidate(ctx.mesh, ctx.lm, ctx.field, params);
    const b = evaluateCandidate(ctx.mesh, ctx.lm, ctx.field, params);
    expect(a.values.length).toBe(b.values.length);
    let maxDiff = 0;
    for (let i = 0; i < a.values.length; i++) {
      maxDiff = Math.max(maxDiff, Math.abs(a.values[i]! - b.values[i]!));
    }
    expect(maxDiff).toBe(0);
  });

  it("every candidate keeps a single connected region with ordered frontiers", () => {
    for (const r of sweep.results) {
      expect(r.region.components).toBe(1);
      // upperY strictly above lowerY across the whole span.
      expect(r.shape.minUpperLowerGapMeters).toBeGreaterThan(0);
      // leftS > rightS at mid chest height.
      const midY = 0.5 * (r.bounds.meta.yBot + r.bounds.meta.yTop);
      expect(r.bounds.leftS(midY)).toBeGreaterThan(r.bounds.rightS(midY));
    }
  });

  it("never produces positive field values in arms, back or neck", () => {
    for (const r of sweep.results) {
      expect(r.leaksBefore.armRight).toBe(0);
      expect(r.leaksBefore.armLeft).toBe(0);
      expect(r.leaksBefore.back).toBe(0);
      expect(r.leaksBefore.neck).toBe(0);
    }
  });

  it("keeps symmetry within 2% for every candidate", () => {
    for (const r of sweep.results) {
      expect(r.symmetry.symmetryPct).toBeLessThanOrEqual(2);
    }
  });

  it("rejects a 0 mm upper rise (superior local minimum) and yields 4 survivors", () => {
    const zeroRise = sweep.results.filter((r) => r.params.upperCenterRise === 0);
    for (const r of zeroRise) {
      expect(r.filters).toContain("upper local min at s=0");
      expect(r.pass).toBe(false);
    }
    expect(sweep.survivors).toEqual(["C03", "C04", "C07", "C08"]);
    expect(sweep.finalists).toHaveLength(3);
  });

  it("has no deep W / V and stays anchored to IMF and axillary landmarks", () => {
    for (const id of sweep.finalists) {
      const r = sweep.results.find((x) => x.id === id)!;
      expect(r.shape.interiorMinima).toBeLessThan(2);
      expect(r.shape.centerDipBelowMedialMm).toBeLessThanOrEqual(2);
      expect(r.metrics.distanceToImfMaxMm!).toBeLessThanOrEqual(3);
      expect(r.metrics.distanceToAxillaMaxMm!).toBeLessThanOrEqual(3);
      expect(r.abdominalInvasionMm).toBeLessThanOrEqual(2);
    }
  });

  it("meets the frozen V2.5 isoline precision for every finalist", () => {
    for (const id of sweep.finalists) {
      const r = sweep.results.find((x) => x.id === id)!;
      expect(r.isoline.precision.mean).toBeLessThanOrEqual(0.001);
      expect(r.isoline.precision.p95).toBeLessThanOrEqual(0.002);
      expect(r.isoline.precision.max).toBeLessThanOrEqual(0.004);
    }
  });

  it("aligns highlight and selectable area: 0 interior/exterior mismatches", () => {
    const id = sweep.finalists[0]!;
    const r = sweep.results.find((x) => x.id === id)!;
    const align = sampleHitAlignment(ctx.mesh, ctx.lm, r.bounds, ctx.field, r.values);
    expect(align.interior).toBeGreaterThanOrEqual(2000);
    expect(align.exterior).toBeGreaterThanOrEqual(2000);
    expect(align.interiorMismatch).toBe(0);
    expect(align.exteriorMismatch).toBe(0);
  });

  it("resolves interior clicks to chest and rejects exterior clicks", () => {
    const id = sweep.finalists[0]!;
    const r = sweep.results.find((x) => x.id === id)!;
    const probes = buildHitProbes(ctx.mesh, ctx.lm, r.bounds, ctx.field, r.values);
    expect(probes.interiorPass).toBe(true);
    expect(probes.exteriorPass).toBe(true);
    for (const res of Object.values(probes.interiorResults)) {
      expect((res as { fieldValue: number }).fieldValue).toBeGreaterThan(0);
    }
    for (const res of Object.values(probes.exteriorResults)) {
      expect((res as { fieldValue: number }).fieldValue).toBeLessThanOrEqual(0);
    }
  });

  it("stages the approved candidate under artifacts (V2.6 did not promote)", () => {
    const reportPath = path.join(ROOT, "artifacts/full-chest-v26/report.json");
    expect(existsSync(reportPath)).toBe(true);
    const report = JSON.parse(readFileSync(reportPath, "utf8"));
    expect(report.officialMaskOverwritten).toBe(false);
    expect(report.officialSidecarOverwritten).toBe(false);
    expect(report.glbModified).toBe(false);
    expect(report.approved).not.toBeNull();
    expect(report.identity.matchesV25Manifest).toBe(true);
    expect(existsSync(path.join(APPROVED, "neutro_body_v1_full_chest_sdf_C07.bin"))).toBe(
      true,
    );
    // Official field may already be V2.7 C07 after promotion; URL stays un-suffixed.
    const official = JSON.parse(
      readFileSync(
        path.join(
          ROOT,
          "public/models/interaction/fields/neutro_body_v1_region_fields.json",
        ),
        "utf8",
      ),
    );
    expect(official.fields[0].fieldUrl).not.toContain("_C0");
    expect(["2.5", "2.7", "4.4", "5.2"]).toContain(official.version);
    if (official.version === "2.7") {
      expect(official.fields[0].candidateId).toBe("C07");
    }
  });

  it("keeps the candidate sidecar payload within budget (<= 40 KB)", () => {
    const report = JSON.parse(
      readFileSync(path.join(ROOT, "artifacts/full-chest-v26/report.json"), "utf8"),
    );
    expect(report.approved.sidecarBytes).toBeLessThanOrEqual(40 * 1024);
  });
});
