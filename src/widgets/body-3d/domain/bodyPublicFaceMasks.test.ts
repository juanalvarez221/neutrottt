import { readFileSync, existsSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  isConnectedBodySelection,
  tryAddContiguousPublicTarget,
} from "@/widgets/body-3d/domain/bodyPublicAdjacency";
import { resolvePublicTargetHighlightRegions } from "@/widgets/body-3d/domain/bodyPublicHighlightRegions";

type FaceMasksFile = {
  model: string;
  sourceMeshHash: string;
  faceCountTotal: number;
  regions: Record<string, { faceIndices: number[] }>;
};

const MASKS_PATH = path.join(
  process.cwd(),
  "assets/body-regions/neutro_body_v1_public_region_faces.json",
);

function loadMasks(): FaceMasksFile {
  expect(existsSync(MASKS_PATH)).toBe(true);
  return JSON.parse(readFileSync(MASKS_PATH, "utf8")) as FaceMasksFile;
}

describe("authoritative public face masks", () => {
  it("face sets match source hash metadata", () => {
    const masks = loadMasks();
    expect(masks.model).toBe("neutro_body_v1");
    expect(masks.sourceMeshHash.length).toBeGreaterThanOrEqual(8);
    expect(masks.faceCountTotal).toBeGreaterThan(1000);
    expect(Object.keys(masks.regions).length).toBeGreaterThan(20);
  });

  it("public face sets have no overlaps", () => {
    const masks = loadMasks();
    const seen = new Map<number, string>();
    const overlaps: string[] = [];
    for (const [rid, { faceIndices }] of Object.entries(masks.regions)) {
      for (const fi of faceIndices) {
        const prev = seen.get(fi);
        if (prev) overlaps.push(`${fi}:${prev}+${rid}`);
        else seen.set(fi, rid);
      }
    }
    expect(overlaps.slice(0, 10)).toEqual([]);
  });

  it("left/right masks are valid mirrors by face-count tolerance", () => {
    const masks = loadMasks();
    const pairs: Array<[string, string]> = [
      ["right_pectoral_region", "left_pectoral_region"],
      ["right_ribs_region", "left_ribs_region"],
      ["right_biceps_surface", "left_biceps_surface"],
      ["right_thigh_front_surface", "left_thigh_front_surface"],
      ["right_shin_surface", "left_shin_surface"],
    ];
    for (const [a, b] of pairs) {
      const na = masks.regions[a]?.faceIndices.length ?? 0;
      const nb = masks.regions[b]?.faceIndices.length ?? 0;
      expect(na).toBeGreaterThan(10);
      expect(nb).toBeGreaterThan(10);
      const ratio = Math.min(na, nb) / Math.max(na, nb);
      expect(ratio).toBeGreaterThan(0.55);
    }
  });

  it("pectorals do not overlap abdomen", () => {
    const masks = loadMasks();
    const pec = new Set([
      ...(masks.regions.right_pectoral_region?.faceIndices ?? []),
      ...(masks.regions.left_pectoral_region?.faceIndices ?? []),
    ]);
    const abd = new Set(masks.regions.full_abdomen_region?.faceIndices ?? []);
    for (const fi of pec) expect(abd.has(fi)).toBe(false);
  });

  it("chest highlight resolves only pectoral surfaces", () => {
    const regions = [...resolvePublicTargetHighlightRegions("full_chest")].sort();
    expect(regions).toEqual(
      ["left_pectoral_region", "right_pectoral_region"].sort(),
    );
  });

  it("ribs do not overlap back", () => {
    const masks = loadMasks();
    const ribs = new Set([
      ...(masks.regions.right_ribs_region?.faceIndices ?? []),
      ...(masks.regions.left_ribs_region?.faceIndices ?? []),
    ]);
    const back = new Set([
      ...(masks.regions.upper_back_region?.faceIndices ?? []),
      ...(masks.regions.lower_back_region?.faceIndices ?? []),
    ]);
    for (const fi of ribs) expect(back.has(fi)).toBe(false);
  });

  it("lower leg complete = shin ∪ calf", () => {
    const left = resolvePublicTargetHighlightRegions("left_lower_leg");
    expect(left).toEqual(
      expect.arrayContaining(["left_shin_surface", "left_calf_surface"]),
    );
  });

  it("connected selection logic remains valid", () => {
    expect(isConnectedBodySelection(["full_chest", "full_abdomen"])).toBe(true);
    expect(
      isConnectedBodySelection(["full_chest", "left_lower_leg_front"]),
    ).toBe(false);
    const rejected = tryAddContiguousPublicTarget(
      ["full_chest"],
      "left_lower_leg_front",
    );
    expect(rejected.ok).toBe(false);
  });
});
