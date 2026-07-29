import path from "node:path";
import { loadMeshData } from "./glb.mjs";

const ROOT = path.resolve(import.meta.dirname, "..", "..");
const mesh = loadMeshData(path.join(ROOT, "public/models/production/neutro_body_v1.glb"));
const P = mesh.positions;
const n = mesh.vertexCount;

const SLICE = 0.015;
const LINK = 0.045;

function f(v, d = 4) {
  return v.toFixed(d).padStart(8);
}

function clusterSlice(points) {
  const parent = points.map((_, i) => i);
  const find = (a) => {
    while (parent[a] !== a) {
      parent[a] = parent[parent[a]];
      a = parent[a];
    }
    return a;
  };
  const union = (a, b) => {
    const ra = find(a);
    const rb = find(b);
    if (ra !== rb) parent[ra] = rb;
  };
  for (let i = 0; i < points.length; i++) {
    for (let j = i + 1; j < points.length; j++) {
      const dx = points[i][0] - points[j][0];
      const dz = points[i][2] - points[j][2];
      if (dx * dx + dz * dz <= LINK * LINK) union(i, j);
    }
  }
  const groups = new Map();
  for (let i = 0; i < points.length; i++) {
    const r = find(i);
    if (!groups.has(r)) groups.set(r, []);
    groups.get(r).push(points[i]);
  }
  return [...groups.values()]
    .filter((g) => g.length >= 6)
    .map((g) => {
      let sx = 0, sz = 0;
      let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
      for (const [x, , z] of g) {
        sx += x; sz += z;
        minX = Math.min(minX, x); maxX = Math.max(maxX, x);
        minZ = Math.min(minZ, z); maxZ = Math.max(maxZ, z);
      }
      return {
        count: g.length,
        cx: sx / g.length,
        cz: sz / g.length,
        minX, maxX, minZ, maxZ,
      };
    })
    .sort((a, b) => a.cx - b.cx);
}

console.log("=== SLICE CLUSTERS (link 0.045) ===");
console.log("  y     | clusters | per cluster: n cx cz  xrange  zrange");
for (let y = 0; y <= 1.74; y += SLICE) {
  const pts = [];
  for (let i = 0; i < n; i++) {
    const py = P[i * 3 + 1];
    if (py < y || py >= y + SLICE) continue;
    pts.push([P[i * 3], py, P[i * 3 + 2]]);
  }
  if (pts.length < 6) continue;
  const clusters = clusterSlice(pts);
  const desc = clusters
    .map(
      (c) =>
        `[n=${String(c.count).padStart(4)} c=(${c.cx.toFixed(3)},${c.cz.toFixed(3)}) ` +
        `x:${c.minX.toFixed(3)}..${c.maxX.toFixed(3)} z:${c.minZ.toFixed(3)}..${c.maxZ.toFixed(3)}]`,
    )
    .join(" ");
  console.log(`${f(y, 3)} | ${clusters.length} | ${desc}`);
}
