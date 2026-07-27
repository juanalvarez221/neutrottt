/**
 * Full Abdomen V3.2 — isoline residual tessellation tests.
 */
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  assertOfficialChestFrozen,
  buildAbdomenV32CandidateGrid,
  buildV31Context,
  evaluateAllAbdomenV32Candidates,
  OFFICIAL_CHEST_HASHES,
  RESIDUAL_THRESH_M,
} from "../../../../tools/body-regions/full-abdomen-v32.mjs";
import { tryAddContiguousPublicTarget } from "@/widgets/body-3d/domain/bodyPublicAdjacency";
import {
  findRegionGeometryFieldEntry,
  type RegionGeometryFieldManifest,
} from "@/widgets/body-3d/domain/bodyRegionGeometryField";

const ROOT = process.cwd();
const GLB = path.join(ROOT, "public/models/production/neutro_body_v1.glb");
const LANDMARKS = path.join(
  ROOT,
  "assets/body-regions/neutro_body_v1_landmarks.json",
);
const FIELDS = path.join(ROOT, "public/models/interaction/fields");
const ART = path.join(ROOT, "artifacts/full-abdomen-v32");
const REPORT = path.join(ART, "report.json");

function contentHash16(buf: Buffer) {
  return createHash("sha256").update(buf).digest("hex").slice(0, 16);
}

describe("full_abdomen V3.2 C07 freeze", () => {
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
    expect(chest.fieldHash).toBe(OFFICIAL_CHEST_HASHES.fieldHash);
    expect(chest.refinement?.hash).toBe(OFFICIAL_CHEST_HASHES.refinementHash);
    expect(contentHash16(fieldBin)).toBe(OFFICIAL_CHEST_HASHES.fieldHash);
    expect(contentHash16(refineBin)).toBe(OFFICIAL_CHEST_HASHES.refinementHash);
    expect(assertOfficialChestFrozen().intact).toBe(true);
    // Global maskHash changes after abdomen promotion (V3.3); chest field stays frozen.
  });
});

describe("full_abdomen V3.2 residual isoline tessellation", () => {
  const ctx = buildV31Context(GLB, LANDMARKS, { skipSeamExtract: true });
  const sweep = evaluateAllAbdomenV32Candidates(ctx);

  it("only processes B01 and B02", () => {
    expect(buildAbdomenV32CandidateGrid().map((c) => c.id)).toEqual([
      "B01",
      "B02",
    ]);
    expect(sweep.results).toHaveLength(2);
  });

  it("only refines triangles with error > 3.5 mm", () => {
    for (const r of sweep.results) {
      expect(r.v32?.aborted).toBe(false);
      for (const tri of r.v32?.residualsBefore ?? []) {
        expect(tri.errorMax).toBeGreaterThan(RESIDUAL_THRESH_M);
        expect(tri.boundaryType).not.toBe("shared_superior");
      }
    }
  });

  it("does not touch the shared superior seam", () => {
    for (const r of sweep.results) {
      expect(r.sharedDist.mean).toBe(0);
      expect(r.sharedDist.p95).toBe(0);
      expect(r.sharedDist.max).toBeLessThanOrEqual(0.0001);
      expect(
        (r.v32?.residualsBefore ?? []).some(
          (t) => t.boundaryType === "shared_superior",
        ),
      ).toBe(false);
    }
  });

  it("has zero T-junctions and non-manifold edges", () => {
    for (const r of sweep.results) {
      expect(r.v32?.pass1?.tJunctions).toBe(0);
      expect(r.v32?.pass1?.nonManifoldEdges).toBe(0);
      expect(r.v32?.pass1?.duplicateInsertedVertices).toBe(0);
    }
  });

  it("meets 1/2/4 mm precision after residual tessellation", () => {
    for (const r of sweep.results) {
      expect(r.refinedIsoline.precision.mean).toBeLessThanOrEqual(0.001);
      expect(r.refinedIsoline.precision.p95).toBeLessThanOrEqual(0.002);
      expect(r.refinedIsoline.precision.max).toBeLessThanOrEqual(0.004);
      expect(r.pass).toBe(true);
    }
  });

  it("keeps residual growth within 5%", () => {
    for (const r of sweep.results) {
      expect(r.v32?.residualTriGrowth ?? 1).toBeLessThanOrEqual(0.05);
      expect(r.v32?.residualVertGrowth ?? 1).toBeLessThanOrEqual(0.05);
    }
  });

  it("has zero positives in excluded anatomy", () => {
    for (const r of sweep.results) {
      expect(r.leaksBefore.chest).toBe(0);
      expect(r.leaksBefore.ribs).toBe(0);
      expect(r.leaksBefore.hips).toBe(0);
      expect(r.leaksBefore.pubis).toBe(0);
      expect(r.leaksBefore.thighs).toBe(0);
      expect(r.leaksBefore.back).toBe(0);
    }
  });

  it(
    "is deterministic for B01 and B02",
    () => {
      const again = evaluateAllAbdomenV32Candidates(ctx);
      for (let i = 0; i < 2; i++) {
        expect(again.results[i]!.refinedIsoline.precision.max).toBe(
          sweep.results[i]!.refinedIsoline.precision.max,
        );
        expect(again.results[i]!.v32?.residualCount).toBe(
          sweep.results[i]!.v32?.residualCount,
        );
      }
    },
    30_000,
  );
});

describe("full_abdomen V3.2 alignment + adjacency", () => {
  it("report alignments have zero mismatches when present", () => {
    if (!existsSync(REPORT)) return;
    const report = JSON.parse(readFileSync(REPORT, "utf8")) as {
      alignments?: Record<
        string,
        { interiorMismatch: number; exteriorMismatch: number }
      >;
    };
    for (const a of Object.values(report.alignments ?? {})) {
      expect(a.interiorMismatch).toBe(0);
      expect(a.exteriorMismatch).toBe(0);
    }
  });

  it("keeps chest+abdomen contiguous and blocks distant pairing", () => {
    expect(tryAddContiguousPublicTarget(["full_chest"], "full_abdomen").ok).toBe(
      true,
    );
    expect(
      tryAddContiguousPublicTarget(["full_chest"], "left_lower_leg_back").ok,
    ).toBe(false);
  });
});
