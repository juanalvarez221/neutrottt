/**
 * Full Chest Geometry Distance Field V2.5 — sidecar, field and shader tests.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { loadMeshData, parseGlb, readAccessor } from "../../../../tools/body-mask/glb.mjs";
import {
  hashFloat32Canonical as hashFloat32Mjs,
  hashUint32Canonical as hashUint32Mjs,
} from "../../../../tools/body-regions/geometry-field-hash.mjs";
import {
  buildExclusionSets,
  countPositives,
  decodeSnorm16,
} from "../../../../tools/body-regions/generate-full-chest-geometry-field.mjs";
import {
  hashFloat32Canonical,
  hashUint32Canonical,
} from "@/widgets/body-3d/domain/bodyRegionGeometryFieldHash";
import {
  buildRegionGeometryFieldSrc,
  decodeRegionFieldRefinement,
  decodeRegionGeometryField,
  findRegionGeometryFieldEntry,
  validateGeometryIdentity,
  type RegionGeometryFieldManifest,
} from "@/widgets/body-3d/domain/bodyRegionGeometryField";

const ROOT = process.cwd();
const GLB = path.join(ROOT, "public/models/production/neutro_body_v1.glb");
const FIELDS = path.join(ROOT, "public/models/interaction/fields");

const manifest = JSON.parse(
  readFileSync(path.join(FIELDS, "neutro_body_v1_region_fields.json"), "utf8"),
) as RegionGeometryFieldManifest;
const entry = findRegionGeometryFieldEntry(manifest, "full_chest")!;

const gltf = parseGlb(GLB);
const primitive = gltf.json.meshes[0].primitives[0];
const positions = readAccessor(gltf, primitive.attributes.POSITION);
const indices = readAccessor(gltf, primitive.indices);

function toArrayBuffer(buffer: Buffer): ArrayBuffer {
  return buffer.buffer.slice(
    buffer.byteOffset,
    buffer.byteOffset + buffer.byteLength,
  ) as ArrayBuffer;
}

const sidecar = readFileSync(
  path.join(FIELDS, path.basename(entry.fieldUrl)),
);
const values = decodeRegionGeometryField(toArrayBuffer(sidecar), entry);

describe("full_chest V2.5 geometry distance field", () => {
  it("manifest identity matches the runtime geometry", () => {
    expect(entry.regionId).toBe("full_chest");
    expect(entry.vertexCount).toBe(positions.count);
    expect(entry.geometryHash).toBe(hashFloat32Canonical(positions.data));
    expect(entry.indexHash).toBe(hashUint32Canonical(indices.data));
    expect(manifest.indexCount).toBe(indices.count);
  });

  it("generator and runtime hashes agree", () => {
    expect(hashFloat32Canonical(positions.data)).toBe(
      hashFloat32Mjs(positions.data),
    );
    expect(hashUint32Canonical(indices.data)).toBe(hashUint32Mjs(indices.data));
  });

  it("rejects a tampered geometry with GEOMETRY_FIELD_MISMATCH", () => {
    const ok = validateGeometryIdentity(entry, {
      positions: positions.data,
      indices: indices.data,
      vertexCount: positions.count,
    });
    expect(ok.ok).toBe(true);

    const tampered = Float32Array.from(positions.data);
    tampered[0] += 0.01;
    const bad = validateGeometryIdentity(entry, {
      positions: tampered,
      indices: indices.data,
      vertexCount: positions.count,
    });
    expect(bad.ok).toBe(false);
    if (!bad.ok) expect(bad.reason).toContain("GEOMETRY_FIELD_MISMATCH");

    const wrongCount = validateGeometryIdentity(entry, {
      positions: positions.data,
      indices: indices.data,
      vertexCount: positions.count - 1,
    });
    expect(wrongCount.ok).toBe(false);
  });

  it("sidecar decodes to one value per vertex within range", () => {
    expect(entry.encoding).toBe("snorm16");
    expect(sidecar.length).toBe(entry.vertexCount * 2);
    expect(values.length).toBe(positions.count);
    for (let i = 0; i < values.length; i += 97) {
      expect(Math.abs(values[i]!)).toBeLessThanOrEqual(
        entry.distanceRangeMeters + 1e-6,
      );
    }
  });

  it("snorm16 keeps boundary precision under 0.5 mm", () => {
    const reference = decodeSnorm16(sidecar, entry.vertexCount);
    let maxError = 0;
    for (let i = 0; i < values.length; i++) {
      maxError = Math.max(maxError, Math.abs(values[i]! - reference[i]!));
    }
    expect(maxError).toBeLessThan(0.0005);
  });

  it("is positive inside, negative outside and near zero at the frontier", () => {
    let positive = 0;
    let negative = 0;
    let nearZero = 0;
    for (const value of values) {
      if (value > 0) positive++;
      else negative++;
      if (Math.abs(value) <= 0.002) nearZero++;
    }
    expect(positive).toBeGreaterThan(100);
    expect(negative).toBeGreaterThan(positive);
    expect(nearZero).toBeGreaterThan(0);

    // Sternum mid-chest must be well inside, hip must be far outside.
    const mesh = loadMeshData(GLB);
    const nearest = (x: number, y: number, z: number) => {
      let best = 0;
      let bestD = Infinity;
      for (let i = 0; i < mesh.vertexCount; i++) {
        const d = Math.hypot(
          mesh.positions[i * 3]! - x,
          mesh.positions[i * 3 + 1]! - y,
          mesh.positions[i * 3 + 2]! - z,
        );
        if (d < bestD) {
          bestD = d;
          best = i;
        }
      }
      return best;
    };
    expect(values[nearest(0, 1.26, 0.05)]!).toBeGreaterThan(0);
    expect(values[nearest(0, 0.89, 0.05)]!).toBeLessThan(0);
  });

  it("never leaks positive values into arms, back or neck", () => {
    const mesh = loadMeshData(GLB);
    const lm = JSON.parse(
      readFileSync(
        path.join(ROOT, "assets/body-regions/neutro_body_v1_landmarks.json"),
        "utf8",
      ),
    );
    const sets = buildExclusionSets(mesh, lm);
    expect(sets.armRight.length).toBeGreaterThan(0);
    expect(sets.armLeft.length).toBeGreaterThan(0);
    expect(sets.back.length).toBeGreaterThan(0);
    expect(sets.neck.length).toBeGreaterThan(0);
    expect(countPositives(values, sets.armRight)).toBe(0);
    expect(countPositives(values, sets.armLeft)).toBe(0);
    expect(countPositives(values, sets.back)).toBe(0);
    expect(countPositives(values, sets.neck)).toBe(0);
  });

  it("versions the sidecar URL by fieldHash", () => {
    const a = buildRegionGeometryFieldSrc(entry.fieldUrl, "aaa");
    const b = buildRegionGeometryFieldSrc(entry.fieldUrl, "bbb");
    expect(a).not.toBe(b);
    expect(a).toContain("?v=aaa");
    expect(buildRegionGeometryFieldSrc(`${entry.fieldUrl}?v=old`, "new")).toBe(
      `${entry.fieldUrl}?v=new`,
    );
  });

  it("ships a bounded local refinement of the frontier band", () => {
    const source = entry.refinement!;
    expect(source.bandMeters).toBe(0.005);
    const buffer = readFileSync(path.join(FIELDS, path.basename(source.url)));
    const refinement = decodeRegionFieldRefinement(
      toArrayBuffer(buffer),
      entry.distanceRangeMeters,
    );
    expect(refinement.triangles.length).toBe(source.triangleCount);
    expect(refinement.midValues.length).toBe(source.triangleCount * 3);

    const mesh = loadMeshData(GLB);
    for (const triangle of refinement.triangles) {
      expect(triangle).toBeLessThan(mesh.triangleCount);
    }
    // 1 subdivision level over the band only, far below the 15% budget.
    const increase = (refinement.triangles.length * 3) / mesh.triangleCount;
    expect(increase).toBeLessThan(0.15);
  });

  it("reports isoline precision within the V2.5 criteria", () => {
    const report = JSON.parse(
      readFileSync(
        path.join(ROOT, "artifacts/full-chest-v25/report.json"),
        "utf8",
      ),
    );
    expect(report.validation.precision.mean).toBeLessThanOrEqual(0.001);
    expect(report.validation.precision.p95).toBeLessThanOrEqual(0.002);
    expect(report.validation.precision.max).toBeLessThanOrEqual(0.004);
    expect(report.refinement.precision.mean).toBeLessThanOrEqual(
      report.validation.precision.mean,
    );
    expect(report.officialMaskOverwritten).toBe(false);
    expect(report.glbModified).toBe(false);
  });

  it("keeps the sidecar and GPU payload small", () => {
    expect(sidecar.length).toBeLessThanOrEqual(100 * 1024);
    // Float32 upload of the same field.
    expect(entry.vertexCount * 4).toBeLessThanOrEqual(60 * 1024);
  });

  it("shader interpolates distance, never IDs", () => {
    const src = readFileSync(
      path.join(
        ROOT,
        "src/widgets/body-3d/interaction/BodyPublicRegionMaskHighlight.tsx",
      ),
      "utf8",
    );
    expect(src).toMatch(/attribute float \$\{FIELD_ATTRIBUTE\}/);
    expect(src).toMatch(/varying float vActiveRegionDistance/);
    expect(src).toMatch(/vActiveRegionDistance = \$\{FIELD_ATTRIBUTE\}/);
    expect(src).toMatch(/fwidth\(distanceMeters\)/);
    expect(src).toMatch(/smoothstep\(-aaWidth, aaWidth, distanceMeters\)/);
    expect(src).toMatch(/FIELD_MIN_AA_METERS = 0\.00025/);
    expect(src).toMatch(/FIELD_MAX_AA_METERS = 0\.0015/);
    expect(src).toMatch(/aActiveRegionDistance/);
    expect(src).not.toMatch(/aFullChestDistance/);
    expect(src).not.toMatch(/mix\(\s*id/);
  });

  it("generator derives the field from geometry, not from the mask PNG", () => {
    const src = readFileSync(
      path.join(
        ROOT,
        "tools/body-regions/generate-full-chest-geometry-field.mjs",
      ),
      "utf8",
    );
    expect(src).toMatch(/signedDistanceMeters/);
    expect(src).toMatch(/OUTSIDE_DEFAULT_M = -0\.02/);
    expect(src).not.toMatch(/distanceTransform/);
    expect(src).not.toMatch(/nearestTexel/);
    expect(src).not.toMatch(/\.png/);
  });
});
