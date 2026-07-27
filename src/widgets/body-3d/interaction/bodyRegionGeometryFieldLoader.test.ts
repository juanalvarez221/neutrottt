/**
 * V2.5 runtime loader: validation, cache, fallback and derived geometry.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { BufferAttribute, BufferGeometry, Uint32BufferAttribute } from "three";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { parseGlb, readAccessor } from "../../../../tools/body-mask/glb.mjs";
import {
  decodeRegionFieldRefinement,
  type RegionGeometryFieldManifest,
} from "@/widgets/body-3d/domain/bodyRegionGeometryField";
import {
  clearRegionGeometryFieldCache,
  getRegionGeometryFieldStats,
  loadRegionGeometryField,
} from "@/widgets/body-3d/interaction/bodyRegionGeometryFieldLoader";
import { buildRefinedFieldGeometry } from "@/widgets/body-3d/interaction/bodyRegionFieldGeometry";

const ROOT = process.cwd();
const FIELDS = path.join(ROOT, "public/models/interaction/fields");
const MANIFEST_FILE = path.join(FIELDS, "neutro_body_v1_region_fields.json");

const manifest = JSON.parse(
  readFileSync(MANIFEST_FILE, "utf8"),
) as RegionGeometryFieldManifest;
const entry = manifest.fields[0]!;

const gltf = parseGlb(path.join(ROOT, "public/models/production/neutro_body_v1.glb"));
const primitive = gltf.json.meshes[0].primitives[0];
const positions = readAccessor(gltf, primitive.attributes.POSITION);
const indices = readAccessor(gltf, primitive.indices);
const identity = {
  positions: positions.data as Float32Array,
  indices: indices.data as ArrayLike<number>,
  vertexCount: positions.count,
};

function fileResponse(file: string) {
  const buffer = readFileSync(file);
  return {
    ok: true,
    status: 200,
    json: async () => JSON.parse(buffer.toString("utf8")),
    arrayBuffer: async () =>
      buffer.buffer.slice(
        buffer.byteOffset,
        buffer.byteOffset + buffer.byteLength,
      ),
  };
}

let requests: string[] = [];

function installFetch(handler?: (url: string) => unknown) {
  requests = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: string) => {
      const url = String(input).split("?")[0]!;
      requests.push(url);
      if (handler) {
        const custom = handler(url);
        if (custom) return custom;
      }
      if (url.endsWith("neutro_body_v1_region_fields.json")) {
        return fileResponse(MANIFEST_FILE);
      }
      return fileResponse(path.join(FIELDS, path.basename(url)));
    }),
  );
}

beforeEach(() => {
  clearRegionGeometryFieldCache();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("bodyRegionGeometryFieldLoader", () => {
  it("loads and validates the full_chest field", async () => {
    installFetch();
    const result = await loadRegionGeometryField("full_chest", identity);
    expect(result.status).toBe("ok");
    if (result.status !== "ok") return;
    expect(result.values.length).toBe(entry.vertexCount);
    expect(result.refinement?.triangles.length).toBe(
      entry.refinement?.triangleCount,
    );
    expect(requests.some((url) => url.endsWith(".bin"))).toBe(true);
  });

  it("caches by hash so re-selecting never re-downloads", async () => {
    installFetch();
    await loadRegionGeometryField("full_chest", identity);
    const afterFirst = getRegionGeometryFieldStats().fieldFetches;
    await loadRegionGeometryField("full_chest", identity);
    await loadRegionGeometryField("full_chest_surface", identity);
    const stats = getRegionGeometryFieldStats();
    expect(stats.fieldFetches).toBe(afterFirst);
    expect(stats.manifestFetches).toBe(1);
    expect(stats.cacheHits).toBeGreaterThan(0);
  });

  it("loads full_abdomen B01 field from the official manifest", async () => {
    installFetch();
    const result = await loadRegionGeometryField("full_abdomen", identity);
    expect(result.status).toBe("ok");
    if (result.status === "ok") {
      expect(result.entry.candidateId).toBe("B01");
      expect(result.entry.fieldHash).toBe("30a41c0dcc820ab0");
      expect(result.values).toHaveLength(identity.vertexCount);
    }
  });

  it("returns unavailable for regions without a field", async () => {
    installFetch();
    const result = await loadRegionGeometryField("left_calf_surface", identity);
    expect(result.status).toBe("unavailable");
  });

  it("reports GEOMETRY_FIELD_MISMATCH instead of applying the field", async () => {
    installFetch();
    const tampered = Float32Array.from(positions.data);
    tampered[3] += 0.05;
    const result = await loadRegionGeometryField("full_chest", {
      ...identity,
      positions: tampered,
    });
    expect(result.status).toBe("mismatch");
    if (result.status === "mismatch") {
      expect(result.reason).toContain("GEOMETRY_FIELD_MISMATCH");
    }
  });

  it("degrades to the categorical path when the sidecar fails", async () => {
    installFetch((url) =>
      url.endsWith("full_chest_sdf.bin")
        ? { ok: false, status: 404, json: async () => ({}), arrayBuffer: async () => new ArrayBuffer(0) }
        : null,
    );
    const result = await loadRegionGeometryField("full_chest", identity);
    expect(result.status).toBe("error");
  });

  it("degrades when the manifest itself fails", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("offline");
      }),
    );
    const result = await loadRegionGeometryField("full_chest", identity);
    expect(result.status).toBe("error");
  });
});

describe("buildRefinedFieldGeometry", () => {
  function baseGeometry() {
    const geometry = new BufferGeometry();
    geometry.setAttribute(
      "position",
      new BufferAttribute(
        Float32Array.from([0, 0, 0, 1, 0, 0, 0, 1, 0, 1, 1, 0]),
        3,
      ),
    );
    geometry.setAttribute(
      "uv",
      new BufferAttribute(Float32Array.from([0, 0, 1, 0, 0, 1, 1, 1]), 2),
    );
    geometry.setIndex(new Uint32BufferAttribute([0, 1, 2, 1, 3, 2], 1));
    return geometry;
  }

  it("appends midpoints only for refined triangles", () => {
    const base = baseGeometry();
    const values = Float32Array.from([-0.004, 0.004, -0.004, 0.01]);
    const refined = buildRefinedFieldGeometry(
      base,
      values,
      {
        triangles: Uint32Array.from([0]),
        midValues: Float32Array.from([0.001, -0.002, 0.003]),
      },
      "aActiveRegionDistance",
    )!;

    expect(refined.getAttribute("position").count).toBe(7);
    expect(refined.getIndex()!.count).toBe((1 + 3 + 1) * 3);

    const distance = refined.getAttribute("aActiveRegionDistance");
    expect(distance.getX(0)).toBeCloseTo(-0.004);
    expect(distance.getX(4)).toBeCloseTo(0.001);
    expect(distance.getX(5)).toBeCloseTo(-0.002);
    expect(distance.getX(6)).toBeCloseTo(0.003);

    const position = refined.getAttribute("position");
    expect(position.getX(4)).toBeCloseTo(0.5);
    expect(position.getY(4)).toBeCloseTo(0);
    expect(refined.getAttribute("uv").getX(4)).toBeCloseTo(0.5);
  });

  it("matches the sidecar refinement shape", () => {
    const source = entry.refinement!;
    const buffer = readFileSync(path.join(FIELDS, path.basename(source.url)));
    const refinement = decodeRegionFieldRefinement(
      buffer.buffer.slice(
        buffer.byteOffset,
        buffer.byteOffset + buffer.byteLength,
      ) as ArrayBuffer,
      entry.distanceRangeMeters,
    );
    expect(refinement.triangles.length).toBe(source.triangleCount);
    for (const value of refinement.midValues) {
      expect(Math.abs(value)).toBeLessThanOrEqual(
        entry.distanceRangeMeters + 1e-6,
      );
    }
  });
});
