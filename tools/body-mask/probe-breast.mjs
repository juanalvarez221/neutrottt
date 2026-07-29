import { loadMeshData } from "./glb.mjs";

const mesh = loadMeshData("public/models/production/neutro_body_v1.glb");

// Find the most anterior points on each breast mound.
const candidates = { left: null, right: null };
for (let i = 0; i < mesh.vertexCount; i++) {
  const x = mesh.positions[i * 3];
  const y = mesh.positions[i * 3 + 1];
  const z = mesh.positions[i * 3 + 2];
  if (y < 1.18 || y > 1.34) continue;
  if (Math.abs(x) < 0.03 || Math.abs(x) > 0.16) continue;
  if (z < 0.05) continue;
  const side = x >= 0 ? "left" : "right";
  const score = z + 0.15 * (1 - Math.abs(y - 1.26));
  const cur = candidates[side];
  if (!cur || score > cur.score) {
    candidates[side] = { x, y, z, score };
  }
}
console.log(candidates);

// Also find inframammary nadir under each breast (lowest anterior y in breast x-band).
const infra = { left: null, right: null };
for (let i = 0; i < mesh.vertexCount; i++) {
  const x = mesh.positions[i * 3];
  const y = mesh.positions[i * 3 + 1];
  const z = mesh.positions[i * 3 + 2];
  if (y < 1.14 || y > 1.24) continue;
  if (Math.abs(x) < 0.04 || Math.abs(x) > 0.14) continue;
  if (z < 0.08) continue;
  const side = x >= 0 ? "left" : "right";
  const score = -y + 0.4 * z;
  const cur = infra[side];
  if (!cur || score > cur.score) {
    infra[side] = { x, y, z, score };
  }
}
console.log("infra", infra);
