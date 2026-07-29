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
const axialRadius = measureAxialRadiusField(mesh, axisZ, makeLimbPrefilter(anatomy));
const resolvePart = makePartResolver(anatomy, axisZ, axialRadius);
const classify = makeClassifier(anatomy, axisZ, resolvePart);

const counts = new Map();
const midFaceCuts = { total: 0, mixed: 0 };
for (let t = 0; t < mesh.triangleCount; t++) {
  const labels = new Set();
  const samples = [];
  for (let k = 0; k < 3; k++) {
    const vi = mesh.indices[t * 3 + k];
    const p = [
      mesh.positions[vi * 3],
      mesh.positions[vi * 3 + 1],
      mesh.positions[vi * 3 + 2],
    ];
    samples.push(p);
  }
  // centroid + 3 edge midpoints
  const c = [
    (samples[0][0] + samples[1][0] + samples[2][0]) / 3,
    (samples[0][1] + samples[1][1] + samples[2][1]) / 3,
    (samples[0][2] + samples[1][2] + samples[2][2]) / 3,
  ];
  for (const p of [...samples, c]) {
    const label = classify(p) ?? "none";
    labels.add(label);
    counts.set(label, (counts.get(label) ?? 0) + 1);
  }
  midFaceCuts.total += 1;
  if (labels.size > 1) midFaceCuts.mixed += 1;
}

console.log(
  `triangles with mixed labels: ${midFaceCuts.mixed}/${midFaceCuts.total} (${(
    (100 * midFaceCuts.mixed) /
    midFaceCuts.total
  ).toFixed(1)}%)`,
);

const interesting = [
  "right_pectoral_region",
  "left_pectoral_region",
  "full_abdomen_region",
  "right_ribs_region",
  "left_ribs_region",
  "upper_back_region",
  "lower_back_region",
  "right_shoulder_surface",
  "left_shoulder_surface",
];
for (const id of interesting) {
  console.log(String(counts.get(id) ?? 0).padStart(7), id);
}

// Lateral torso ownership at mid-rib height
const bands = { arm: 0, axial_ribs: 0, axial_other: 0 };
for (let i = 0; i < mesh.vertexCount; i++) {
  const p = [
    mesh.positions[i * 3],
    mesh.positions[i * 3 + 1],
    mesh.positions[i * 3 + 2],
  ];
  if (p[1] < 1.05 || p[1] > 1.32) continue;
  const absX = Math.abs(p[0]);
  if (absX < 0.12 || absX > 0.28) continue;
  const resolved = resolvePart(p);
  const label = classify(p);
  if (resolved.part === "arm") bands.arm += 1;
  else if (label && label.includes("ribs")) bands.axial_ribs += 1;
  else bands.axial_other += 1;
}
console.log("lateral mid-torso ownership:", bands);
