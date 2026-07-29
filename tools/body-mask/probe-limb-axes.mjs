import path from "node:path";
import { loadMeshData } from "./glb.mjs";
import { measureAxialRadiusField, measureAxisZ } from "./segmentation.mjs";

const ROOT = path.resolve(import.meta.dirname, "..", "..");
const mesh = loadMeshData(path.join(ROOT, "public/models/production/neutro_body_v1.glb"));
const P = mesh.positions;
const n = mesh.vertexCount;
const DEG = 180 / Math.PI;

const axisZ = measureAxisZ(mesh);
const axialRadius = measureAxialRadiusField(mesh, axisZ);

function f(v, d = 4) {
  return v.toFixed(d).padStart(8);
}

/** Points that sit clearly outside the measured trunk surface belong to limbs. */
function isOutsideTrunk(x, y, z) {
  const dz = z - axisZ(y);
  const r = Math.hypot(x, dz);
  const theta = Math.atan2(x, dz) * DEG;
  return r - axialRadius(y, theta) > 0.03;
}

console.log("=== RIGHT ARM CENTRELINE (points outside the trunk, x < -0.15) ===");
console.log("  y      | count |    cx        cz     | rad   | zmin     zmax");
for (let y = 1.44; y >= 0.85; y -= 0.02) {
  const pts = [];
  for (let i = 0; i < n; i++) {
    const py = P[i * 3 + 1];
    if (py < y - 0.01 || py >= y + 0.01) continue;
    const px = P[i * 3];
    const pz = P[i * 3 + 2];
    if (px > -0.15) continue;
    if (!isOutsideTrunk(px, py, pz)) continue;
    pts.push([px, pz]);
  }
  if (pts.length < 5) continue;
  let sx = 0, sz = 0, zmin = Infinity, zmax = -Infinity;
  for (const [px, pz] of pts) {
    sx += px; sz += pz;
    zmin = Math.min(zmin, pz); zmax = Math.max(zmax, pz);
  }
  const cx = sx / pts.length;
  const cz = sz / pts.length;
  let r = 0;
  for (const [px, pz] of pts) r += Math.hypot(px - cx, pz - cz);
  console.log(
    `${f(y, 3)} | ${String(pts.length).padStart(5)} | ${f(cx)} ${f(cz)} | ${f(r / pts.length, 3)} | ${f(zmin)} ${f(zmax)}`,
  );
}

console.log("\n=== RIGHT LEG CENTRELINE (x < -0.03, y < 0.86) ===");
console.log("  y      | count |    cx        cz     | rad   | xmin     xmax     zmin     zmax");
for (let y = 0.85; y >= 0.0; y -= 0.025) {
  const pts = [];
  for (let i = 0; i < n; i++) {
    const py = P[i * 3 + 1];
    if (py < y - 0.0125 || py >= y + 0.0125) continue;
    const px = P[i * 3];
    if (px > -0.03) continue;
    pts.push([px, P[i * 3 + 2]]);
  }
  if (pts.length < 5) continue;
  let sx = 0, sz = 0, xmin = Infinity, xmax = -Infinity, zmin = Infinity, zmax = -Infinity;
  for (const [px, pz] of pts) {
    sx += px; sz += pz;
    xmin = Math.min(xmin, px); xmax = Math.max(xmax, px);
    zmin = Math.min(zmin, pz); zmax = Math.max(zmax, pz);
  }
  const cx = sx / pts.length;
  const cz = sz / pts.length;
  let r = 0;
  for (const [px, pz] of pts) r += Math.hypot(px - cx, pz - cz);
  console.log(
    `${f(y, 3)} | ${String(pts.length).padStart(5)} | ${f(cx)} ${f(cz)} | ${f(r / pts.length, 3)} | ` +
      `${f(xmin)} ${f(xmax)} ${f(zmin)} ${f(zmax)}`,
  );
}

console.log("\n=== TRUNK AXIS + RADIUS SAMPLES ===");
console.log("  y     | axisZ   | r(0)   r(45)  r(90)  r(135) r(180)");
for (let y = 0.8; y <= 1.5; y += 0.04) {
  const row = [0, 45, 90, 135, 180]
    .map((t) => f(axialRadius(y, t), 3))
    .join(" ");
  console.log(`${f(y, 3)} | ${f(axisZ(y), 4)} | ${row}`);
}
