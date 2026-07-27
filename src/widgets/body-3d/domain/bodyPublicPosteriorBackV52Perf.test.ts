/**
 * Micro performance budget for Geometry Field cache reselect.
 */
import { describe, expect, it } from "vitest";
import { regionFieldCacheKey } from "@/widgets/body-3d/interaction/bodyRegionGeometryFieldLoader";
import type { RegionGeometryFieldEntry } from "@/widgets/body-3d/domain/bodyRegionGeometryField";

describe("Posterior Back V5.2 — micro cache key", () => {
  it("builds composite cache key from geometry+field+refinement hashes", () => {
    const entry = {
      regionId: "full_back",
      geometryHash: "c62e81edaa1f",
      indexHash: "52494d471398c",
      vertexCount: 14517,
      fieldUrl: "/x.bin",
      fieldHash: "6da0b6bfe2eb5b38",
      encoding: "snorm16",
      distanceRangeMeters: 0.02,
      refinement: {
        url: "/y.bin",
        hash: "c79f8241b89fecb2",
        triangleCount: 1,
        bandMeters: 0.005,
        encoding: "u32-snorm16x3",
      },
    } as RegionGeometryFieldEntry;
    expect(regionFieldCacheKey(entry)).toBe(
      "c62e81edaa1f:52494d471398c:6da0b6bfe2eb5b38:c79f8241b89fecb2",
    );
  });
});
