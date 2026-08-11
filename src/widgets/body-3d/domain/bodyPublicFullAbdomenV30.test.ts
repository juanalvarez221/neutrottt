/**
 * Full Abdomen V3.0 — programmatic surface candidates (no official promotion).
 */
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  buildAbdomenCandidateGrid,
  buildV30Context,
  evaluateAllAbdomenCandidates,
  FROZEN_C07,
  measureChestAbdomenSeam,
  OFFICIAL_CHEST_HASHES,
  sampleAbdomenFieldAlignment,
} from "../../../../tools/body-regions/full-abdomen-v30.mjs";
import {
  arePublicTargetsAdjacent,
  tryAddContiguousPublicTarget,
} from "@/widgets/body-3d/domain/bodyPublicAdjacency";
import {
  getPublicDescription,
  getPublicShortLabel,
} from "@/widgets/body-3d/domain/bodyPublicRegionMeta";
import {
  getSupportedCoverages,
  isPublicSelectableBodyTarget,
  regionSupportsCoverage,
} from "@/widgets/body-3d/domain/bodyPublicSelectionCatalog";
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
const REPORT = path.join(ROOT, "artifacts/full-abdomen-v30/report.json");

function contentHash16(buf: Buffer) {
  return createHash("sha256").update(buf).digest("hex").slice(0, 16);
}

describe("full_abdomen V3.0 official chest freeze", () => {
  it("keeps C07 chest hashes bit-identical", () => {
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
    expect(chest.fieldHash).toBe(OFFICIAL_CHEST_HASHES.fieldHash);
    expect(chest.refinement?.hash).toBe(OFFICIAL_CHEST_HASHES.refinementHash);
    expect(chest.candidateId).toBe(OFFICIAL_CHEST_HASHES.candidateId);
    expect(contentHash16(fieldBin)).toBe(OFFICIAL_CHEST_HASHES.fieldHash);
    expect(contentHash16(refineBin)).toBe(OFFICIAL_CHEST_HASHES.refinementHash);

    if (
      chest.fieldHash !== OFFICIAL_CHEST_HASHES.fieldHash ||
      chest.refinement?.hash !== OFFICIAL_CHEST_HASHES.refinementHash ||
      chest.candidateId !== OFFICIAL_CHEST_HASHES.candidateId
    ) {
      throw new Error("FULL_CHEST_REGRESSION_DETECTED");
    }
  });
});

describe("full_abdomen V3.0 product contract", () => {
  it("exposes a single complete-only Abdomen completo target", () => {
    expect(getPublicShortLabel("full_abdomen")).toBe("Abdomen completo");
    expect(getPublicDescription("full_abdomen")).toBe(
      "Superficie frontal del abdomen bajo el pecho, hasta la zona púbica",
    );
    expect(getSupportedCoverages("full_abdomen")).toEqual(["complete"]);
    expect(regionSupportsCoverage("full_abdomen")).toBe(false);
    expect(isPublicSelectableBodyTarget("full_abdomen")).toBe(true);
    expect(isPublicSelectableBodyTarget("upper_abdomen")).toBe(false);
    expect(isPublicSelectableBodyTarget("lower_abdomen")).toBe(false);
  });
});

describe("full_abdomen V3.0 candidate engine", () => {
  const ctx = buildV30Context(GLB, LANDMARKS);
  const sweep = evaluateAllAbdomenCandidates(ctx);

  it("builds eight deterministic candidates A01–A08", () => {
    const grid = buildAbdomenCandidateGrid();
    expect(grid).toHaveLength(8);
    expect(grid.map((c) => c.id)).toEqual([
      "A01",
      "A02",
      "A03",
      "A04",
      "A05",
      "A06",
      "A07",
      "A08",
    ]);
    expect(FROZEN_C07.id).toBe("C07");
  });

  it("reuses C07.lowerY as the shared upper frontier (gap=overlap=0)", () => {
    for (const r of sweep.results) {
      const seam = measureChestAbdomenSeam(ctx.chestBounds, r.bounds);
      expect(seam.maxGapMm).toBeLessThanOrEqual(0.5);
      expect(seam.maxOverlapMm).toBeLessThanOrEqual(0.5);
      expect(seam.pass).toBe(true);
      expect(r.bounds.meta.sharedUpperSource).toBe("C07.lowerY");
    }
  });

  it("keeps positives out of chest, ribs, hips, pubis, thighs and back", () => {
    for (const r of sweep.results) {
      expect(r.leaksBefore.chest).toBe(0);
      expect(r.leaksBefore.pubis).toBe(0);
      expect(r.leaksBefore.thighs).toBe(0);
      expect(r.leaksBefore.back).toBe(0);
      expect(r.leaksBefore.hips).toBe(0);
      expect(r.ribInvasionMm).toBeLessThanOrEqual(2);
    }
  });

  it("keeps symmetry within 5% and produces survivors", () => {
    expect(sweep.survivors.length).toBeGreaterThan(0);
    for (const id of sweep.survivors) {
      const r = sweep.results.find((x) => x.id === id)!;
      expect(r.symmetry.symmetryPct).toBeLessThanOrEqual(5);
      expect(r.region.components).toBe(1);
    }
  });

  it(
    "aligns geometry field with analytic interior/exterior samples",
    () => {
    const approvedId = sweep.finalists[0] ?? sweep.survivors[0];
    const r = sweep.results.find((x) => x.id === approvedId)!;
    const alignment = sampleAbdomenFieldAlignment(
      ctx.mesh,
      r.bounds,
      ctx.field,
      r.values,
      { interior: 3000, exterior: 3000, band: 0.002 },
    );
    expect(alignment.interior).toBeGreaterThanOrEqual(3000);
    expect(alignment.exterior).toBeGreaterThanOrEqual(3000);
    expect(alignment.interiorMismatch).toBe(0);
    expect(alignment.exteriorMismatch).toBe(0);
  },
  20_000,
  );

  it("stages an approved candidate without touching official assets", () => {
    expect(existsSync(REPORT)).toBe(true);
    const report = JSON.parse(readFileSync(REPORT, "utf8"));
    expect(report.officialMaskOverwritten).toBe(false);
    expect(report.officialSidecarOverwritten).toBe(false);
    expect(report.glbModified).toBe(false);
    expect(report.chestRegression.intact).toBe(true);
    expect(report.approvedId).toBeTruthy();
  });
});

describe("full_abdomen V3.0 adjacency", () => {
  it("allows connected chest + abdomen and blocks distant calf", () => {
    const ok = tryAddContiguousPublicTarget(["full_chest"], "full_abdomen");
    expect(ok.ok).toBe(true);
    const distant = tryAddContiguousPublicTarget(
      ["full_chest"],
      "left_lower_leg_back",
    );
    expect(distant.ok).toBe(false);
    expect(
      arePublicTargetsAdjacent("full_chest", "full_abdomen") ||
        arePublicTargetsAdjacent("full_chest_surface", "full_abdomen_region"),
    ).toBe(true);
  });
});
