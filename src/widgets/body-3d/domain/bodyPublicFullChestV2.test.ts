/**
 * Tests for Full Chest Generator V2 domain + mask URL cache-bust.
 */
import { describe, expect, it } from "vitest";
import {
  BODY_PUBLIC_REGION_MASK_HASH,
  BODY_PUBLIC_REGION_MASK_MANIFEST,
  BODY_PUBLIC_REGION_MASK_SRC,
  buildPublicRegionMaskSrc,
} from "@/widgets/body-3d/domain/bodyPublicRegionMask";
import { resolvePublicTargetHighlightRegions } from "@/widgets/body-3d/domain/bodyPublicHighlightRegions";

describe("full_chest V2 mask cache", () => {
  it("buildPublicRegionMaskSrc appends content hash query", () => {
    const a = buildPublicRegionMaskSrc(
      "/models/interaction/neutro_body_v1_anatomical_region_ids.png",
      "abc123def456",
    );
    const b = buildPublicRegionMaskSrc(
      "/models/interaction/neutro_body_v1_anatomical_region_ids.png",
      "fff000111222",
    );
    expect(a).toContain("?v=abc123def456");
    expect(b).toContain("?v=fff000111222");
    expect(a).not.toBe(b);
  });

  it("strips prior query before appending new hash", () => {
    const url = buildPublicRegionMaskSrc(
      "/models/interaction/neutro_body_v1_anatomical_region_ids.png?v=old",
      "newhash00",
    );
    expect(url).toBe(
      "/models/interaction/neutro_body_v1_anatomical_region_ids.png?v=newhash00",
    );
  });

  it("BODY_PUBLIC_REGION_MASK_SRC is versioned from manifest hash", () => {
    expect(BODY_PUBLIC_REGION_MASK_SRC).toContain("?v=");
    expect(BODY_PUBLIC_REGION_MASK_SRC).toContain(BODY_PUBLIC_REGION_MASK_HASH);
    if (BODY_PUBLIC_REGION_MASK_MANIFEST.maskHash) {
      expect(BODY_PUBLIC_REGION_MASK_HASH).toBe(
        BODY_PUBLIC_REGION_MASK_MANIFEST.maskHash,
      );
    }
  });

  it("changing hash produces a different public mask URL", () => {
    const base = BODY_PUBLIC_REGION_MASK_MANIFEST.maskTexture;
    const u1 = buildPublicRegionMaskSrc(base, "hash_aaaa");
    const u2 = buildPublicRegionMaskSrc(base, "hash_bbbb");
    expect(u1).not.toEqual(u2);
  });
});

describe("full_chest V2 contract unchanged", () => {
  it("still resolves only full_chest_surface", () => {
    expect(resolvePublicTargetHighlightRegions("full_chest")).toEqual([
      "full_chest_surface",
    ]);
  });
});
