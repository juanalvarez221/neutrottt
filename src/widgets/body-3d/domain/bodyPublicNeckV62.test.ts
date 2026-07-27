/**
 * Neck V6.2 gate tests — lineage, BC topology, freeze, metrics asserts, adjacency.
 */
import { existsSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  assertOfficialTorsoWithLeftRibsFrozen,
  assertOfficialBackFrozen,
  contentHash16,
  expectedOfficialHashes,
  OFFICIAL_BACK,
} from "../../../../tools/body-regions/neck-v60-core.mjs";
import {
  EXPECTED_SEAM_HASHES,
  NECK_V62_OUT,
} from "../../../../tools/body-regions/neck-v62-core.mjs";
import {
  arePublicTargetsAdjacent,
  isPublicSelectionContiguous,
} from "./bodyPublicAdjacency";

const ROOT = path.resolve(import.meta.dirname, "../../../..");
const ART = NECK_V62_OUT;
const FIELDS = path.join(ROOT, "public/models/interaction/fields");
const V60 = path.join(ROOT, "artifacts/neck-v60/approved");
const V61 = path.join(ROOT, "artifacts/neck-v61/approved");

function readJson(p: string) {
  return JSON.parse(readFileSync(p, "utf8"));
}

describe("Neck V6.2 — official torso freeze", () => {
  it("keeps chest/abdomen/ribs/back/geometry bit-identical", () => {
    const freeze = assertOfficialTorsoWithLeftRibsFrozen(ROOT);
    const back = assertOfficialBackFrozen(ROOT);
    const expected = expectedOfficialHashes();
    expect(freeze.intact).toBe(true);
    expect(back.intact).toBe(true);
    expect(freeze.geometryHash).toBe("c62e81edaa1f");
    expect(freeze.indexHash).toBe("52494d471398c");
    expect(freeze.vertexCount).toBe(14517);
    expect(back.maskHash).toBe(OFFICIAL_BACK.maskHash);
    expect(
      contentHash16(readFileSync(path.join(FIELDS, expected.chest.fieldBin))),
    ).toBe(expected.chest.fieldHash);
    expect(back.upper_back.fieldHash).toBe(OFFICIAL_BACK.upper_back.fieldHash);
    expect(back.lower_back.fieldHash).toBe(OFFICIAL_BACK.lower_back.fieldHash);
    expect(back.full_back.fieldHash).toBe(OFFICIAL_BACK.full_back.fieldHash);
  });

  it("documents that V6.2 did not promote; V6.3 owns official sidecars", () => {
    const report = readJson(path.join(ART, "report.json"));
    expect(report.promoted).toBe(false);
    expect(report.commit).toBe(false);
    expect(report.canPromoteOfficially).toBe(false);
    // Official bins exist only after V6.3 promotion (independent refine, not BC)
    const manifest = JSON.parse(
      readFileSync(path.join(FIELDS, "neutro_body_v1_region_fields.json"), "utf8"),
    );
    const front = manifest.fields.find(
      (f: { regionId: string }) => f.regionId === "neck_front",
    );
    expect(front?.refinement?.encoding).not.toBe("bc-topology-v1");
    expect(front?.refinement?.encoding).toBe("u32-t16-snorm16x3");
  });
});

describe("Neck V6.2 — artifact lineage Case A", () => {
  it("documents V6.1 sidecars bit-identical to V6.0", () => {
    const lineage = readJson(
      path.join(ART, "diagnostic/01-artifact-lineage.json"),
    );
    expect(lineage.bytesIdenticalAllRegions).toBe(true);
    expect(lineage.v61ProducedNewBytes).toBe(false);
    expect(lineage.case).toBe("A");
    for (const r of [
      "neck_front",
      "neck_right",
      "neck_back",
      "neck_left",
      "full_neck",
    ]) {
      const a = readFileSync(path.join(V60, `${r}_sdf.bin`));
      const b = readFileSync(path.join(V61, `${r}_sdf.bin`));
      expect(Buffer.compare(a, b)).toBe(0);
    }
  });

  it("reconciles registry candidates vs packed insertions", () => {
    const lineage = readJson(
      path.join(ART, "diagnostic/01-artifact-lineage.json"),
    );
    expect(lineage.registryV61.candidateEntries).toBe(4844);
    expect(lineage.registryV61.conclusion).toMatch(/not/i);
  });
});

describe("Neck V6.2 — N02 source and seams", () => {
  it("locks N02 and canonical seam hashes", () => {
    const params = readJson(path.join(ART, "approved/parameters.json"));
    expect(params.candidateId).toBe("N02");
    expect(params.lateralBandOffsetM).toBe(0);
    const hashes = readJson(path.join(ART, "approved/hashes.json"));
    expect(hashes.sharedSeams).toEqual(EXPECTED_SEAM_HASHES);
  });
});

describe("Neck V6.2 — boundary graph and shared topology", () => {
  it("validates boundary graph invariants", () => {
    const graph = readJson(
      path.join(ART, "boundary-graph/neck-boundary-graph.json"),
    );
    expect(graph.validation.pass).toBe(true);
    expect(graph.validation.loops).toBe(2);
    expect(graph.validation.seams).toBe(4);
    expect(graph.validation.duplicateNodes).toBe(0);
    expect(graph.validation.components).toBe(1);
  });

  it("has shared topology under 5% embedding budget", () => {
    const metrics = readJson(path.join(ART, "approved/metrics.json"));
    expect(metrics.sharedTopology.vertexIncPct).toBeLessThanOrEqual(5);
    expect(metrics.sharedTopology.triangleIncPct).toBeLessThanOrEqual(5);
    expect(metrics.sharedTopology.hash).toMatch(/^[a-f0-9]{16}$/);
  });

  it("stores shared edge registry with zero T-junctions recorded", () => {
    const reg = readJson(
      path.join(ART, "refinement/shared-edge-registry.json"),
    );
    expect(reg.tJunctions).toBe(0);
    expect(reg.entries).toBeGreaterThan(0);
  });
});

describe("Neck V6.2 — isoline metrics document BC regression (rejected)", () => {
  it("V6.2 shared topology fails 1/2/4 mm on partials (reason for V6.3)", () => {
    const metrics = readJson(path.join(ART, "approved/metrics.json"));
    const report = readJson(path.join(ART, "report.json"));
    expect(report.canPromoteOfficially).toBe(false);
    const anyFail = (
      ["neck_front", "neck_right", "neck_back", "neck_left"] as const
    ).some((region) => {
      const iso = metrics.regions[region].isoline;
      return iso.meanMm > 1 || iso.p95Mm > 2 || iso.maxMm > 4 || !iso.pass;
    });
    expect(anyFail).toBe(true);
  });

  it("full_neck has no regression vs V6.0 bytes", () => {
    const hashes = readJson(path.join(ART, "approved/hashes.json"));
    const v60 = contentHash16(
      readFileSync(path.join(V60, "full_neck_sdf.bin")),
    );
    expect(hashes.regions.full_neck.fieldHash).toBe(v60);
  });
});

describe("Neck V6.2 — runtime temp bins exist with new hashes", () => {
  it("partial refine hashes differ from V6.0 mid-edge codec", () => {
    const hashes = readJson(path.join(ART, "approved/hashes.json"));
    const v60Refine = contentHash16(
      readFileSync(path.join(V60, "neck_front_refine.bin")),
    );
    expect(hashes.regions.neck_front.refineHash).not.toBe(v60Refine);
    // Base SDF may remain bit-identical under frozen N02 analytical field
    for (const r of ["neck_front", "neck_right", "neck_back", "neck_left"]) {
      const p = path.join(
        ROOT,
        `public/models/interaction/fields/temp/neck-v62/${r}_sdf.bin`,
      );
      const rp = path.join(
        ROOT,
        `public/models/interaction/fields/temp/neck-v62/${r}_refine.bin`,
      );
      expect(existsSync(p)).toBe(true);
      expect(existsSync(rp)).toBe(true);
      expect(statSync(p).size).toBeGreaterThan(1000);
      expect(statSync(rp).size).toBeGreaterThan(100);
    }
  });
});

describe("Neck V6.2 — adjacency", () => {
  it("allows circular neck and torso adjacencies", () => {
    expect(arePublicTargetsAdjacent("neck_front", "neck_right")).toBe(true);
    expect(arePublicTargetsAdjacent("neck_right", "neck_back")).toBe(true);
    expect(arePublicTargetsAdjacent("neck_back", "neck_left")).toBe(true);
    expect(arePublicTargetsAdjacent("neck_left", "neck_front")).toBe(true);
    expect(arePublicTargetsAdjacent("neck_front", "full_chest")).toBe(true);
    expect(arePublicTargetsAdjacent("neck_back", "upper_back")).toBe(true);
    expect(arePublicTargetsAdjacent("full_neck", "full_chest")).toBe(true);
    expect(arePublicTargetsAdjacent("full_neck", "upper_back")).toBe(true);
  });

  it("rejects isolated laterals and distant selection", () => {
    expect(
      isPublicSelectionContiguous(["neck_right", "neck_left"]),
    ).toBe(false);
    expect(
      isPublicSelectionContiguous(["full_neck", "right_calf"]),
    ).toBe(false);
    expect(
      isPublicSelectionContiguous(["neck_right", "neck_front", "neck_left"]),
    ).toBe(true);
  });
});
