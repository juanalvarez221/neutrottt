import { loadMeshData } from "./glb.mjs";
import { loadAnatomy } from "./anatomy.mjs";
import {
  makeLimbPrefilter,
  measureAxialRadiusField,
  measureAxisZ,
  makePartResolver,
  makeClassifier,
} from "./segmentation.mjs";

const mesh = loadMeshData("public/models/production/neutro_body_v1.glb");
const anatomy = loadAnatomy();
const axisZ = measureAxisZ(mesh);
const isLimb = makeLimbPrefilter(anatomy);
const axialRadius = measureAxialRadiusField(mesh, axisZ, isLimb);
const resolvePart = makePartResolver(anatomy, axisZ, axialRadius);
const classify = makeClassifier(anatomy, axisZ, resolvePart);

// Any point classified as abdomen but far from the trunk laterally is a leak.
let leaks = 0;
const samples = [];
for (let i = 0; i < mesh.vertexCount; i++) {
  const p = [
    mesh.positions[i * 3],
    mesh.positions[i * 3 + 1],
    mesh.positions[i * 3 + 2],
  ];
  if (Math.abs(p[0]) < 0.2) continue;
  const label = classify(p);
  if (label === "full_abdomen_region" || label === "lower_back_region") {
    leaks += 1;
    if (samples.length < 12) {
      const resolved = resolvePart(p);
      samples.push({ p: p.map((v) => v.toFixed(3)), label, resolved });
    }
  }
}
console.log("classifier leaks (|x|>0.2 -> abdomen/lowerback):", leaks);
for (const s of samples) console.log(JSON.stringify(s));

// Check UV overlap: do hand triangles and torso triangles share texels?
// Rasterise coarsely at 512 and count collisions between different labels.
const SIZE = 512;
const owner = new Map();
let collisions = 0;
const collisionPairs = new Map();
const { indices, positions, uvs } = mesh;
const triCount = indices.length / 3;
for (let t = 0; t < triCount; t++) {
  const ia = indices[t * 3];
  const ib = indices[t * 3 + 1];
  const ic = indices[t * 3 + 2];
  const cx = (positions[ia * 3] + positions[ib * 3] + positions[ic * 3]) / 3;
  const cy =
    (positions[ia * 3 + 1] + positions[ib * 3 + 1] + positions[ic * 3 + 1]) / 3;
  const cz =
    (positions[ia * 3 + 2] + positions[ib * 3 + 2] + positions[ic * 3 + 2]) / 3;
  const label = classify([cx, cy, cz]) ?? "none";
  const us = [ia, ib, ic].map((i) => uvs[i * 2] * SIZE);
  const vs = [ia, ib, ic].map((i) => uvs[i * 2 + 1] * SIZE);
  const minU = Math.max(0, Math.floor(Math.min(...us)));
  const maxU = Math.min(SIZE - 1, Math.ceil(Math.max(...us)));
  const minV = Math.max(0, Math.floor(Math.min(...vs)));
  const maxV = Math.min(SIZE - 1, Math.ceil(Math.max(...vs)));
  for (let v = minV; v <= maxV; v++) {
    for (let u = minU; u <= maxU; u++) {
      const k = v * SIZE + u;
      const prev = owner.get(k);
      if (prev === undefined) {
        owner.set(k, label);
      } else if (prev !== label) {
        collisions += 1;
        const pair = [prev, label].sort().join(" <-> ");
        collisionPairs.set(pair, (collisionPairs.get(pair) ?? 0) + 1);
      }
    }
  }
}
console.log("coarse texel collisions:", collisions);
const top = [...collisionPairs.entries()].sort((a, b) => b[1] - a[1]).slice(0, 15);
for (const [pair, n] of top) console.log(String(n).padStart(7), pair);
