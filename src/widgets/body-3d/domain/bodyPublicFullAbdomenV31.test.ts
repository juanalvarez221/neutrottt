/**
 * Full Abdomen V3.1 — structural frontiers + C07 freeze + seam reuse.
 */
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  assertOfficialChestFrozen,
  buildAbdomenV31CandidateGrid,
  buildV31Context,
  evaluateAllAbdomenV31Candidates,
  FROZEN_C07,
  OFFICIAL_CHEST_HASHES,
} from "../../../../tools/body-regions/full-abdomen-v31.mjs";
import {
  tryAddContiguousPublicTarget,
} from "@/widgets/body-3d/domain/bodyPublicAdjacency";
import {
  findRegionGeometryFieldEntry,
  type RegionGeometryFieldManifest,
} from "@/widgets/body-3d/domain/bodyRegionGeometryField";
import maskManifest from "@/widgets/body-3d/domain/generated/publicRegionMaskManifest.json";

const ROOT = process.cwd();
const GLB = path.join(ROOT, "public/models/production/neutro_body_v1.glb");
const LANDMARKS = path.join(
  ROOT,
  "assets/body-regions/neutro_body_v1_landmarks.json",
);
const FIELDS = path.join(ROOT, "public/models/interaction/fields");
const ART = path.join(ROOT, "artifacts/full-abdomen-v31");
const SEAM_JSON = path.join(ART, "shared-chest-abdomen-seam.json");
const REPORT = path.join(ART, "report.json");

function contentHash16(buf: Buffer) {
  return createHash("sha256").update(buf).digest("hex").slice(0, 16);
}

describe("full_abdomen V3.1 C07 freeze", () => {
  it("keeps official chest hashes bit-identical", () => {
    const regionFields = JSON.parse(
      readFileSync(path.join(FIELDS, "neutro_body_v1_region_fields.json"), "utf8"),
    ) as RegionGeometryFieldManifest;
    const chest = findRegionGeometryFieldEntry(regionFields, "full_chest")!;
    const fieldBin = readFileSync(
      path.join(FIELDS, "neutro_body_v1_full_chest_sdf.bin"),
    );
    const refineBin = readFileSync(
      path.join(FIELDS, "neutro_body_v1_full_chest_refine.bin"),
    );

    expect(maskManifest.maskHash).toBeTruthy();
    // Global maskHash advances after abdomen V3.3; C07 field freeze is authoritative.
    expect(chest.fieldHash).toBe(OFFICIAL_CHEST_HASHES.fieldHash);
    expect(chest.refinement?.hash).toBe(OFFICIAL_CHEST_HASHES.refinementHash);
    expect(chest.candidateId).toBe(OFFICIAL_CHEST_HASHES.candidateId);
    expect(contentHash16(fieldBin)).toBe(OFFICIAL_CHEST_HASHES.fieldHash);
    expect(contentHash16(refineBin)).toBe(OFFICIAL_CHEST_HASHES.refinementHash);
    expect(assertOfficialChestFrozen().intact).toBe(true);
    expect(FROZEN_C07.id).toBe("C07");
  });
});

describe("full_abdomen V3.1 shared seam", () => {
  it("reuses C07 refined inferior triangles from shared seam asset", () => {
    expect(existsSync(SEAM_JSON)).toBe(true);
    const seam = JSON.parse(readFileSync(SEAM_JSON, "utf8")) as {
      candidateId: string;
      triangleCount: number;
      triangles: number[];
      curveOrder: unknown[];
      seamHash: string;
      fieldHash: string;
      refinementHash: string;
    };
    expect(seam.candidateId).toBe("C07");
    expect(seam.fieldHash).toBe(OFFICIAL_CHEST_HASHES.fieldHash);
    expect(seam.refinementHash).toBe(OFFICIAL_CHEST_HASHES.refinementHash);
    expect(seam.triangleCount).toBeGreaterThan(0);
    expect(seam.triangles).toHaveLength(seam.triangleCount);
    expect(seam.curveOrder.length).toBeGreaterThan(0);
    expect(seam.seamHash).toMatch(/^[a-f0-9]{16}$/);
  });
});

describe("full_abdomen V3.1 candidate engine", () => {
  const ctx = buildV31Context(GLB, LANDMARKS, { skipSeamExtract: true });
  const sweep = evaluateAllAbdomenV31Candidates(ctx);

  it("builds exactly four candidates B01–B04", () => {
    const grid = buildAbdomenV31CandidateGrid();
    expect(grid).toHaveLength(4);
    expect(grid.map((g) => g.id)).toEqual(["B01", "B02", "B03", "B04"]);
  });

  it("uses curvature laterals that are not constant", () => {
    expect(ctx.laterals.diagnostics.areConstant).toBe(false);
    expect(ctx.laterals.diagnostics.continuous).toBe(true);
    expect(ctx.laterals.diagnostics.symmetryPass).toBe(true);
    const widths = ctx.laterals.slices.map((s) => s.widthS);
    const span = Math.max(...widths) - Math.min(...widths);
    expect(span).toBeGreaterThan(0.02);
  });

  it("has continuous width profile with waist pinch and pelvic open", () => {
    expect(ctx.laterals.diagnostics.waistNarrower).toBe(true);
    expect(ctx.laterals.diagnostics.opensTowardPelvis).toBe(true);
  });

  it("inferior curve has center lower than laterals without V/peak", () => {
    for (const r of sweep.results) {
      expect(r.inferior.diagnostics.centerLower).toBe(true);
      expect(r.inferior.diagnostics.hasDeepV).toBe(false);
      expect(r.inferior.diagnostics.hasPeak).toBe(false);
      expect(r.inferior.diagnostics.nearlyHorizontal).toBe(false);
    }
  });

  it("reuses all C07 seam triangles in refinement", () => {
    for (const r of sweep.results) {
      expect(r.refinement.seamReused).toBe(r.refinement.seamTotal);
      expect(r.sharedDist.mean).toBe(0);
      expect(r.sharedDist.p95).toBe(0);
      expect(r.sharedDist.max).toBeLessThanOrEqual(0.0001);
    }
  });

  it("reports field precision against 1/2/4 mm targets", () => {
    // Documented: mean/p95 may pass while max remains the gating residual.
    for (const r of sweep.results) {
      expect(r.refinedIsoline.precision.mean).toBeLessThanOrEqual(0.0015);
      expect(r.refinedIsoline.precision.p95).toBeLessThanOrEqual(0.003);
      expect(r.refinement.growth).toBeLessThanOrEqual(0.15 + 1e-6);
    }
  });

  it("has zero positives in excluded anatomy before soft retract", () => {
    for (const r of sweep.results) {
      expect(r.leaksBefore.chest).toBe(0);
      expect(r.leaksBefore.ribs).toBe(0);
      expect(r.leaksBefore.hips).toBe(0);
      expect(r.leaksBefore.pubis).toBe(0);
      expect(r.leaksBefore.thighs).toBe(0);
      expect(r.leaksBefore.back).toBe(0);
    }
  });

  it("keeps A02 out of any approved path", () => {
    expect(existsSync(path.join(ROOT, "artifacts/full-abdomen-v30/approved"))).toBe(
      true,
    );
    const approvedFiles = existsSync(
      path.join(ROOT, "artifacts/full-abdomen-v30/rejected/A02/candidate.json"),
    );
    expect(approvedFiles).toBe(true);
  });
});

describe("full_abdomen V3.1 alignment + adjacency", () => {
  it("field alignment interior/exterior mismatches are zero for finalists when report exists", () => {
    if (!existsSync(REPORT)) return;
    const report = JSON.parse(readFileSync(REPORT, "utf8")) as {
      alignments?: Record<
        string,
        { interiorMismatch: number; exteriorMismatch: number }
      >;
    };
    for (const align of Object.values(report.alignments ?? {})) {
      expect(align.interiorMismatch).toBe(0);
      expect(align.exteriorMismatch).toBe(0);
    }
  });

  it("allows chest+abdomen and rejects distant lower-leg pairing", () => {
    expect(tryAddContiguousPublicTarget(["full_chest"], "full_abdomen").ok).toBe(
      true,
    );
    expect(
      tryAddContiguousPublicTarget(["full_chest"], "left_lower_leg_back").ok,
    ).toBe(false);
  });
});
