/**
 * Uniform triangle midpoint subdivision + exact surface coincidence.
 * Edge midpoints stay on original edges (exact skin match).
 */
export function subdivideOnce(mesh) {
  const { positions, uvs, indices, triangleCount, vertexCount } = mesh;
  const edgeKey = (a, b) => (a < b ? `${a}|${b}` : `${b}|${a}`);
  const midpoint = new Map();
  const newPos = Array.from(positions);
  const newUv = Array.from(uvs);
  let next = vertexCount;

  const mid = (a, b) => {
    const key = edgeKey(a, b);
    const existing = midpoint.get(key);
    if (existing !== undefined) return existing;
    const i = next++;
    midpoint.set(key, i);
    newPos.push(
      (positions[a * 3] + positions[b * 3]) * 0.5,
      (positions[a * 3 + 1] + positions[b * 3 + 1]) * 0.5,
      (positions[a * 3 + 2] + positions[b * 3 + 2]) * 0.5,
    );
    newUv.push(
      (uvs[a * 2] + uvs[b * 2]) * 0.5,
      (uvs[a * 2 + 1] + uvs[b * 2 + 1]) * 0.5,
    );
    return i;
  };

  const newIdx = [];
  for (let t = 0; t < triangleCount; t++) {
    const a = indices[t * 3];
    const b = indices[t * 3 + 1];
    const c = indices[t * 3 + 2];
    const ab = mid(a, b);
    const bc = mid(b, c);
    const ca = mid(c, a);
    newIdx.push(a, ab, ca, ab, b, bc, ca, bc, c, ab, bc, ca);
  }

  return {
    positions: Float64Array.from(newPos),
    uvs: Float64Array.from(newUv),
    indices: Uint32Array.from(newIdx),
    triangleCount: newIdx.length / 3,
    vertexCount: newPos.length / 3,
    hasUv: true,
    primitives: [{ name: "HighlightSurface", triStart: 0, triCount: newIdx.length / 3 }],
  };
}

export function subdivideLevels(mesh, levels) {
  let current = mesh;
  for (let i = 0; i < levels; i++) current = subdivideOnce(current);
  return current;
}
