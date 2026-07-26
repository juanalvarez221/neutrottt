/**
 * Right Ribs V4.1 — u_ribs lateral parametrization, loop integrity, GDF QA.
 * Does not promote official assets. R02 is diagnostic only (not approved).
 */
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  assertTorsoFrontFrozen,
  FROZEN_B01,
  FROZEN_TORSO_FRONT,
  OFFICIAL_CHEST_HASHES,
} from "../../../../tools/body-regions/right-ribs-v40.mjs";
import { R02 } from "../../../../tools/body-regions/right-ribs-v41.mjs";
import { tryAddContiguousPublicTarget } from "@/widgets/body-3d/domain/bodyPublicAdjacency";
import {
  findRegionGeometryFieldEntry,
  type RegionGeometryFieldManifest,
} from "@/widgets/body-3d/domain/bodyRegionGeometryField";
import maskManifest from "@/widgets/body-3d/domain/generated/publicRegionMaskManifest.json";

const ROOT = process.cwd();
const FIELDS = path.join(ROOT, "public/models/interaction/fields");
const ART = path.join(ROOT, "artifacts/right-ribs-v41");
const REPORT = path.join(ART, "report.json");
const REJECTED_R02 = path.join(
  ROOT,
  "artifacts/right-ribs-v40/rejected/R02/candidate.json",
);

function contentHash16(buf: Buffer) {
  return createHash("sha256").update(buf).digest("hex").slice(0, 16);
}

type V41Report = {
  version: string;
  candidateId: string;
  pass: boolean;
  officialAssetsOverwritten: boolean;
  promoted: boolean;
  stages: { A: string; B: string; C: string; D: string };
  torsoFrontRegression: {
    chestFieldHash: string;
    chestRefinementHash: string;
    abdomenFieldHash: string;
    abdomenRefinementHash: string;
    maskHash: string;
    intact: boolean;
  };
  loop: {
    closedLoops: number;
    maxEndpointGapMm: number;
    autoIntersections: number;
    inverted: number;
    pass: boolean;
  };
  uRibs: {
    sliceCount: number;
    nan: number;
    nanPct: number;
    inversions: number;
    unparamPct: number;
    frontSeam: number;
    posteriorSeam: number;
    pass?: boolean;
  };
  classification: {
    positives: number;
    components: number;
    tinyIslands: number;
    leaks: Record<string, number>;
  };
  refinedIsolineMm: { mean: number; p95: number; max: number };
  topology: { tJunctions: number; nonManifold: number; growth: number };
  raycast: {
    interior: { pass: boolean };
    exterior: { pass: boolean };
    posterior: { results: Array<{ u: number | null; inArc: boolean }> };
  };
};

function loadReport(): V41Report | null {
  if (!existsSync(REPORT)) return null;
  return JSON.parse(readFileSync(REPORT, "utf8")) as V41Report;
}

describe("right_ribs V4.1 torso front freeze", () => {
  it("keeps pecho C07 field/refine bit-identical", () => {
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
    expect(contentHash16(fieldBin)).toBe("cc4f1242dc879825");
    expect(contentHash16(refineBin)).toBe("b309a72b943d16e8");
  });

  it("keeps abdomen B01 field/refine bit-identical", () => {
    const regionFields = JSON.parse(
      readFileSync(path.join(FIELDS, "neutro_body_v1_region_fields.json"), "utf8"),
    ) as RegionGeometryFieldManifest;
    const abd = findRegionGeometryFieldEntry(regionFields, "full_abdomen")!;
    const fieldBin = readFileSync(
      path.join(FIELDS, "neutro_body_v1_full_abdomen_sdf.bin"),
    );
    const refineBin = readFileSync(
      path.join(FIELDS, "neutro_body_v1_full_abdomen_refine.bin"),
    );
    expect(abd.fieldHash).toBe(FROZEN_B01.fieldHash);
    expect(abd.refinement?.hash).toBe(FROZEN_B01.refinementHash);
    expect(contentHash16(fieldBin)).toBe("30a41c0dcc820ab0");
    expect(contentHash16(refineBin)).toBe("e624d3f9ecc9d40a");
  });

  it("keeps chest/abdomen freeze intact (mask may advance after V4.2)", () => {
    expect(FROZEN_TORSO_FRONT.maskHash).toBe("8f68930e75e0");
    const freeze = assertTorsoFrontFrozen();
    expect(freeze.intact).toBe(true);
    const promoted = existsSync(
      path.join(ROOT, "artifacts/right-ribs-v42/report.json"),
    );
    if (!promoted) {
      expect(maskManifest.maskHash).toBe("8f68930e75e0");
    } else {
      expect(maskManifest.maskHash).not.toBe("8f68930e75e0");
    }
  });

  it("registers official right_ribs after V4.2 promotion (or stays absent pre-promote)", () => {
    const regionFields = JSON.parse(
      readFileSync(path.join(FIELDS, "neutro_body_v1_region_fields.json"), "utf8"),
    ) as RegionGeometryFieldManifest;
    const entry = findRegionGeometryFieldEntry(regionFields, "right_ribs");
    const promotedReport = path.join(
      ROOT,
      "artifacts/right-ribs-v42/report.json",
    );
    if (!existsSync(promotedReport)) {
      expect(entry).toBeNull();
      return;
    }
    expect(entry?.candidateId).toBe("V4.1");
    expect(entry?.fieldHash).toBe("69a61207dd331a1d");
  });
});

describe("right_ribs V4.1 R02 rejection + report gates", () => {
  it("keeps R02 under rejected/ (not approved)", () => {
    expect(existsSync(REJECTED_R02)).toBe(true);
    expect(
      existsSync(path.join(ROOT, "artifacts/right-ribs-v40/approved")),
    ).toBe(false);
  });

  it("uses diagnostic candidate R02 only", () => {
    const report = loadReport();
    if (!report) return;
    expect(report.candidateId).toBe(R02.id);
    expect(report.version).toBe("4.1");
    expect(report.officialAssetsOverwritten).toBe(false);
    expect(report.promoted).toBe(false);
  });

  it("passes closed boundary loop (stage A)", () => {
    const report = loadReport();
    if (!report) return;
    expect(report.stages.A).toBe("PASS");
    expect(report.loop.closedLoops).toBe(1);
    expect(report.loop.maxEndpointGapMm).toBeLessThanOrEqual(0.1);
    expect(report.loop.autoIntersections).toBe(0);
    expect(report.loop.inverted).toBe(0);
    expect(report.loop.pass).toBe(true);
  });

  it("passes continuous u_ribs (stage B)", () => {
    const report = loadReport();
    if (!report) return;
    expect(report.stages.B).toBe("PASS");
    expect(report.uRibs.sliceCount).toBe(96);
    expect(report.uRibs.frontSeam).toBe(0);
    expect(report.uRibs.posteriorSeam).toBe(1);
    expect(report.uRibs.nan).toBe(0);
    expect(report.uRibs.inversions).toBe(0);
    expect(report.uRibs.unparamPct).toBeLessThan(0.5);
    const post = report.raycast.posterior.results[0];
    expect(post?.inArc).toBe(true);
    expect(post?.u).toBeGreaterThan(0);
    expect(post?.u).toBeLessThan(1);
  });

  it("passes single-component classification without exclusion leaks (stage C)", () => {
    const report = loadReport();
    if (!report) return;
    expect(report.stages.C).toBe("PASS");
    expect(report.classification.components).toBe(1);
    expect(report.classification.tinyIslands).toBe(0);
    expect(report.classification.positives).toBeGreaterThan(0);
    for (const key of ["chest", "abdomen", "arm", "deltoid", "back", "hip"]) {
      expect(report.classification.leaks[key] ?? 0).toBe(0);
    }
  });

  it("passes metric isoline precision after refine (stage D)", () => {
    const report = loadReport();
    if (!report) return;
    expect(report.stages.D).toBe("PASS");
    expect(report.refinedIsolineMm.mean).toBeLessThanOrEqual(1);
    expect(report.refinedIsolineMm.p95).toBeLessThanOrEqual(2);
    expect(report.refinedIsolineMm.max).toBeLessThanOrEqual(4);
    expect(report.topology.tJunctions).toBe(0);
    expect(report.topology.nonManifold).toBe(0);
    expect(report.topology.growth).toBeLessThanOrEqual(0.05 + 1e-9);
  });

  it("passes interior/exterior raycast probes", () => {
    const report = loadReport();
    if (!report) return;
    expect(report.raycast.interior.pass).toBe(true);
    expect(report.raycast.exterior.pass).toBe(true);
  });

  it("marks V4.1 gate pass when report exists", () => {
    const report = loadReport();
    if (!report) return;
    expect(report.pass).toBe(true);
    expect(report.torsoFrontRegression.intact).toBe(true);
  });
});

describe("right_ribs V4.1 adjacency", () => {
  it("allows pecho + costillas derechas", () => {
    expect(tryAddContiguousPublicTarget(["full_chest"], "right_ribs").ok).toBe(
      true,
    );
  });

  it("allows abdomen + costillas derechas", () => {
    expect(
      tryAddContiguousPublicTarget(["full_abdomen"], "right_ribs").ok,
    ).toBe(true);
  });

  it("rejects distant costillas + pantorrilla", () => {
    expect(
      tryAddContiguousPublicTarget(["right_ribs"], "right_lower_leg_back").ok,
    ).toBe(false);
  });
});
