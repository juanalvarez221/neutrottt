import path from "node:path";
import { loadMeshData } from "./glb.mjs";

const ROOT = path.resolve(import.meta.dirname, "..", "..");
const BODY_VISUAL = path.join(ROOT, "public/models/production/neutro_body_v1.glb");

const mesh = loadMeshData(BODY_VISUAL);
const n = mesh.vertexCount;
const P = mesh.positions;

function f(v, d = 4) {
  return v.toFixed(d).padStart(8);
}

let minX = Infinity, maxX = -Infinity;
let minY = Infinity, maxY = -Infinity;
let minZ = Infinity, maxZ = -Infinity;
for (let i = 0; i < n; i++) {
  minX = Math.min(minX, P[i * 3]); maxX = Math.max(maxX, P[i * 3]);
  minY = Math.min(minY, P[i * 3 + 1]); maxY = Math.max(maxY, P[i * 3 + 1]);
  minZ = Math.min(minZ, P[i * 3 + 2]); maxZ = Math.max(maxZ, P[i * 3 + 2]);
}

console.log("=== BOUNDS (runtime world) ===");
console.log(`x: ${f(minX)} .. ${f(maxX)}   width  ${f(maxX - minX)}`);
console.log(`y: ${f(minY)} .. ${f(maxY)}   height ${f(maxY - minY)}`);
console.log(`z: ${f(minZ)} .. ${f(maxZ)}   depth  ${f(maxZ - minZ)}`);

// Horizontal slice profile: for each height band, report torso-only extents
// (|x| < 0.16 filters arms out) plus global extents.
console.log("\n=== HEIGHT SLICES (0.02 steps) ===");
console.log("  y      |  count | torso |x|max  torso zmin  torso zmax | global |x|max");
const step = 0.02;
for (let y = minY; y <= maxY; y += step) {
  let count = 0;
  let torsoAbsX = 0;
  let torsoZmin = Infinity;
  let torsoZmax = -Infinity;
  let globalAbsX = 0;
  for (let i = 0; i < n; i++) {
    const py = P[i * 3 + 1];
    if (py < y || py >= y + step) continue;
    const px = P[i * 3];
    const pz = P[i * 3 + 2];
    count += 1;
    globalAbsX = Math.max(globalAbsX, Math.abs(px));
    if (Math.abs(px) < 0.16) {
      torsoAbsX = Math.max(torsoAbsX, Math.abs(px));
      torsoZmin = Math.min(torsoZmin, pz);
      torsoZmax = Math.max(torsoZmax, pz);
    }
  }
  if (!count) continue;
  console.log(
    `${f(y, 3)} | ${String(count).padStart(6)} | ${f(torsoAbsX)}  ${f(torsoZmin)}  ${f(torsoZmax)} | ${f(globalAbsX)}`,
  );
}

// Front-surface profile on the right side of the chest: find the breast apex
// and the inframammary fold by scanning the frontmost z per (y, x) cell.
console.log("\n=== FRONT CHEST SURFACE (right side, x<0) ===");
console.log("  y      | x=-0.02  x=-0.05  x=-0.08  x=-0.11  x=-0.14");
const xProbes = [-0.02, -0.05, -0.08, -0.11, -0.14];
for (let y = 1.05; y <= 1.45; y += 0.02) {
  const cells = xProbes.map(() => -Infinity);
  for (let i = 0; i < n; i++) {
    const py = P[i * 3 + 1];
    if (py < y || py >= y + 0.02) continue;
    const px = P[i * 3];
    const pz = P[i * 3 + 2];
    for (let k = 0; k < xProbes.length; k++) {
      if (Math.abs(px - xProbes[k]) < 0.018) {
        cells[k] = Math.max(cells[k], pz);
      }
    }
  }
  console.log(
    `${f(y, 3)} | ` + cells.map((c) => (c === -Infinity ? "     ---" : f(c))).join("  "),
  );
}

// Arm axis: sample the right arm (x < -0.16) centroid per height.
console.log("\n=== RIGHT ARM CENTROID PER HEIGHT (x < -0.16) ===");
console.log("  y      | count |    cx       cz    | radius");
for (let y = 0.85; y <= 1.45; y += 0.025) {
  let count = 0, sx = 0, sz = 0;
  const pts = [];
  for (let i = 0; i < n; i++) {
    const py = P[i * 3 + 1];
    if (py < y || py >= y + 0.025) continue;
    const px = P[i * 3];
    if (px > -0.16) continue;
    const pz = P[i * 3 + 2];
    count += 1; sx += px; sz += pz;
    pts.push([px, pz]);
  }
  if (count < 4) continue;
  const cx = sx / count, cz = sz / count;
  let r = 0;
  for (const [px, pz] of pts) r += Math.hypot(px - cx, pz - cz);
  console.log(`${f(y, 3)} | ${String(count).padStart(5)} | ${f(cx)} ${f(cz)} | ${f(r / count)}`);
}

// Leg axis: sample the right leg (x < -0.02, y < 0.95) centroid per height.
console.log("\n=== RIGHT LEG CENTROID PER HEIGHT (x < -0.02, y < 1.0) ===");
console.log("  y      | count |    cx       cz    | radius");
for (let y = 0.0; y <= 1.0; y += 0.05) {
  let count = 0, sx = 0, sz = 0;
  const pts = [];
  for (let i = 0; i < n; i++) {
    const py = P[i * 3 + 1];
    if (py < y || py >= y + 0.05) continue;
    const px = P[i * 3];
    if (px > -0.02) continue;
    const pz = P[i * 3 + 2];
    count += 1; sx += px; sz += pz;
    pts.push([px, pz]);
  }
  if (count < 4) continue;
  const cx = sx / count, cz = sz / count;
  let r = 0;
  for (const [px, pz] of pts) r += Math.hypot(px - cx, pz - cz);
  console.log(`${f(y, 3)} | ${String(count).padStart(5)} | ${f(cx)} ${f(cz)} | ${f(r / count)}`);
}
