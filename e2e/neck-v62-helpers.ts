/**
 * Shared helpers for Neck V6.2 Playwright (temporary manifest, no promote).
 */
import { readFileSync, existsSync } from "node:fs";
import path from "node:path";
import type { Page } from "@playwright/test";

const ROOT = process.cwd();
const ART = path.join(ROOT, "artifacts/neck-v62");
const OFFICIAL_FIELDS = path.join(
  ROOT,
  "public/models/interaction/fields/neutro_body_v1_region_fields.json",
);

export function readNeckV62Report() {
  return JSON.parse(readFileSync(path.join(ART, "report.json"), "utf8")) as {
    candidateId: string;
    approved: boolean;
    promoted: boolean;
    sharedTopologyHash: string;
    regions: Record<string, { isoline: { meanMm: number; p95Mm: number; maxMm: number; pass: boolean } }>;
  };
}

export function readNeckV62Hashes() {
  return JSON.parse(
    readFileSync(path.join(ART, "approved/hashes.json"), "utf8"),
  ) as {
    sharedTopologyHash: string;
    regions: Record<string, { fieldHash: string; refineHash: string }>;
  };
}

export async function installTempNeckV62Manifest(page: Page) {
  const hashes = readNeckV62Hashes();
  const official = JSON.parse(readFileSync(OFFICIAL_FIELDS, "utf8")) as {
    version: string;
    fields: Array<Record<string, unknown>>;
    geometryHash?: string;
    indexHash?: string;
    vertexCount?: number;
  };

  const mk = (regionId: string, fieldHash: string, refineHash: string) => ({
    regionId,
    geometryHash: "c62e81edaa1f",
    indexHash: "52494d471398c",
    vertexCount: 14517,
    fieldUrl: `/models/interaction/fields/temp/neck-v62/${regionId}_sdf.bin`,
    fieldHash,
    fieldRange: 0.02,
    encoding: "snorm16",
    distanceRangeMeters: 0.02,
    candidateId: "N02",
    temporary: true,
    sharedTopology: {
      url: `/models/interaction/fields/temp/neck-v62/shared_topology.bin`,
      hash: hashes.sharedTopologyHash,
      encoding: "bc-topology-v1",
    },
    refinement: {
      url: `/models/interaction/fields/temp/neck-v62/${regionId}_refine.bin`,
      hash: refineHash,
      encoding: "bc-topology-v1",
      sharedTopologyHash: hashes.sharedTopologyHash,
    },
  });

  const neckFields = [
    "neck_front",
    "neck_right",
    "neck_back",
    "neck_left",
    "full_neck",
  ].map((id) =>
    mk(id, hashes.regions[id].fieldHash, hashes.regions[id].refineHash),
  );

  const temp = {
    ...official,
    version: `${official.version}+neck_v62_temp`,
    temporary: true,
    sharedTopologyHash: hashes.sharedTopologyHash,
    fields: [...official.fields, ...neckFields],
  };

  await page.route("**/neutro_body_v1_region_fields.json", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(temp),
    });
  });
}

export function artifactExists(rel: string) {
  return existsSync(path.join(ART, rel));
}
