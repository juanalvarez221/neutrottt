/**
 * Derived overlay geometry for region distance fields.
 *
 * The original vertices keep their index (the sidecar maps onto them one to
 * one) and three midpoint vertices are appended per refined triangle. Midpoint
 * positions, normals and uvs are barycentric, so the rendered surface is
 * unchanged; only the distance attribute gains resolution at the frontier.
 */
import { BufferAttribute, BufferGeometry, Uint32BufferAttribute } from "three";
import type { RegionFieldRefinement } from "@/widgets/body-3d/domain/bodyRegionGeometryField";

function copyInto(
  source: ArrayLike<number>,
  itemSize: number,
  total: number,
): Float32Array {
  const out = new Float32Array(total * itemSize);
  out.set(source as unknown as ArrayLike<number> as never, 0);
  return out;
}

export function buildRefinedFieldGeometry(
  base: BufferGeometry,
  values: Float32Array,
  refinement: RegionFieldRefinement,
  attributeName: string,
): BufferGeometry | null {
  const position = base.getAttribute("position");
  const index = base.getIndex();
  if (!position || !index) return null;

  const vertexCount = position.count;
  const triangleCount = index.count / 3;
  const refinedCount = refinement.triangles.length;
  if (refinedCount === 0) return null;

  const total = vertexCount + refinedCount * 3;
  const positions = copyInto(position.array as Float32Array, 3, total);
  const normalAttr = base.getAttribute("normal");
  const uvAttr = base.getAttribute("uv");
  const normals = normalAttr
    ? copyInto(normalAttr.array as Float32Array, 3, total)
    : null;
  const uvs = uvAttr ? copyInto(uvAttr.array as Float32Array, 2, total) : null;
  const distances = new Float32Array(total);
  distances.set(values.subarray(0, Math.min(values.length, vertexCount)));

  const slotOf = new Map<number, number>();
  for (let i = 0; i < refinedCount; i++) {
    slotOf.set(refinement.triangles[i]!, i);
  }

  const indices = new Uint32Array((triangleCount + refinedCount * 3) * 3);
  let write = 0;
  let next = vertexCount;

  for (let t = 0; t < triangleCount; t++) {
    const a = index.getX(t * 3);
    const b = index.getX(t * 3 + 1);
    const c = index.getX(t * 3 + 2);
    const slot = slotOf.get(t);
    if (slot === undefined) {
      indices[write++] = a;
      indices[write++] = b;
      indices[write++] = c;
      continue;
    }

    const pairs: readonly [number, number][] = [
      [a, b],
      [b, c],
      [c, a],
    ];
    const mid: number[] = [];
    for (let k = 0; k < 3; k++) {
      const [i, j] = pairs[k]!;
      const v = next++;
      for (let axis = 0; axis < 3; axis++) {
        positions[v * 3 + axis] =
          (positions[i * 3 + axis]! + positions[j * 3 + axis]!) / 2;
        if (normals) {
          normals[v * 3 + axis] =
            (normals[i * 3 + axis]! + normals[j * 3 + axis]!) / 2;
        }
      }
      if (normals) {
        const nx = normals[v * 3]!;
        const ny = normals[v * 3 + 1]!;
        const nz = normals[v * 3 + 2]!;
        const length = Math.hypot(nx, ny, nz) || 1;
        normals[v * 3] = nx / length;
        normals[v * 3 + 1] = ny / length;
        normals[v * 3 + 2] = nz / length;
      }
      if (uvs) {
        uvs[v * 2] = (uvs[i * 2]! + uvs[j * 2]!) / 2;
        uvs[v * 2 + 1] = (uvs[i * 2 + 1]! + uvs[j * 2 + 1]!) / 2;
      }
      distances[v] = refinement.midValues[slot * 3 + k]!;
      mid.push(v);
    }

    const [m0, m1, m2] = mid as [number, number, number];
    indices.set([a, m0, m2, m0, b, m1, m2, m1, c, m0, m1, m2], write);
    write += 12;
  }

  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new BufferAttribute(positions, 3));
  if (normals) geometry.setAttribute("normal", new BufferAttribute(normals, 3));
  if (uvs) geometry.setAttribute("uv", new BufferAttribute(uvs, 2));
  geometry.setAttribute(attributeName, new BufferAttribute(distances, 1));
  geometry.setIndex(new Uint32BufferAttribute(indices.subarray(0, write), 1));
  geometry.boundingBox = base.boundingBox;
  geometry.boundingSphere = base.boundingSphere;
  return geometry;
}
