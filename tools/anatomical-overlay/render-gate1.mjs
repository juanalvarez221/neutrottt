import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { loadMeshData, parseGlb, readAccessor } from "../body-mask/glb.mjs";
import {
  computeVertexNormals,
  renderView,
} from "../body-mask/renderer.mjs";

const ROOT = path.resolve(import.meta.dirname, "..", "..");
const OUT = path.join(ROOT, "artifacts/anatomical-highlight-gate-1");
const HIGHLIGHT_GLB = path.join(
  ROOT,
  "public/models/interaction/neutro_body_v1_anatomical_highlight.glb",
);

const SHOTS = [
  ["01-pectoral-right-front", [0, 0, 1], ["right_pectoral_region"]],
  ["02-pectoral-right-oblique", [-0.55, 0.05, 0.85], ["right_pectoral_region"]],
  ["03-pectoral-left-front", [0, 0, 1], ["left_pectoral_region"]],
  ["04-pectoral-left-oblique", [0.55, 0.05, 0.85], ["left_pectoral_region"]],
  ["05-full-chest-front", [0, 0, 1], ["right_pectoral_region", "left_pectoral_region"]],
  ["06-full-chest-oblique", [-0.45, 0.05, 0.9], ["right_pectoral_region", "left_pectoral_region"]],
  ["07-abdomen-front", [0, 0, 1], ["full_abdomen_region"]],
  ["08-ribs-right-front-oblique", [-0.7, 0.05, 0.7], ["right_ribs_region"]],
  ["09-ribs-right-side", [-1, 0, 0], ["right_ribs_region"]],
  ["10-ribs-right-back-oblique", [-0.7, 0.05, -0.7], ["right_ribs_region"]],
  ["11-ribs-left-front-oblique", [0.7, 0.05, 0.7], ["left_ribs_region"]],
  ["12-ribs-left-side", [1, 0, 0], ["left_ribs_region"]],
  ["13-ribs-left-back-oblique", [0.7, 0.05, -0.7], ["left_ribs_region"]],
  ["14-upper-back-back", [0, 0, -1], ["upper_back_region"]],
  ["15-upper-back-oblique", [0.45, 0.05, -0.9], ["upper_back_region"]],
  ["16-lower-back-back", [0, 0, -1], ["lower_back_region"]],
  ["17-lower-back-oblique", [0.45, 0.05, -0.9], ["lower_back_region"]],
  ["18-full-back-back", [0, 0, -1], ["upper_back_region", "lower_back_region"]],
  ["19-full-back-oblique", [0.45, 0.05, -0.9], ["upper_back_region", "lower_back_region"]],
];

function loadHighlightRegions(glbPath) {
  const gltf = parseGlb(glbPath);
  const { json } = gltf;
  const regions = new Map();
  for (const node of json.nodes || []) {
    if (node.mesh === undefined || !node.name?.startsWith("public_")) continue;
    const id = node.name.slice("public_".length);
    const prim = json.meshes[node.mesh].primitives[0];
    const pos = readAccessor(gltf, prim.attributes.POSITION);
    const idx = readAccessor(gltf, prim.indices);
    const positions = new Float64Array(pos.data);
    const indices = new Uint32Array(idx.data);
    const uvs = new Float64Array((positions.length / 3) * 2);
    regions.set(id, {
      positions,
      uvs,
      indices,
      triangleCount: indices.length / 3,
      vertexCount: positions.length / 3,
    });
  }
  return regions;
}

function mergeRegions(regions, ids) {
  const positions = [];
  const indices = [];
  let base = 0;
  for (const id of ids) {
    const m = regions.get(id);
    if (!m) continue;
    for (let i = 0; i < m.positions.length; i++) positions.push(m.positions[i]);
    for (let i = 0; i < m.indices.length; i++) indices.push(m.indices[i] + base);
    base += m.vertexCount;
  }
  const n = positions.length / 3;
  const uvs = new Float64Array(n * 2);
  for (let i = 0; i < n; i++) {
    uvs[i * 2] = ((i % 255) + 1) / 256;
    uvs[i * 2 + 1] = (Math.floor(i / 255) + 1) / 256;
  }
  return {
    positions: Float64Array.from(positions),
    uvs,
    indices: Uint32Array.from(indices),
    triangleCount: indices.length / 3,
    vertexCount: n,
  };
}

function cameraFromMesh(mesh, direction, options = {}) {
  const padding = options.padding ?? 1.85;
  const fov = options.fov ?? 32;
  let min = [Infinity, Infinity, Infinity];
  let max = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < mesh.vertexCount; i++) {
    for (let k = 0; k < 3; k++) {
      const v = mesh.positions[i * 3 + k];
      min[k] = Math.min(min[k], v);
      max[k] = Math.max(max[k], v);
    }
  }
  const target = [
    (min[0] + max[0]) / 2,
    (min[1] + max[1]) / 2,
    (min[2] + max[2]) / 2,
  ];
  const extent = Math.max(max[0] - min[0], max[1] - min[1], max[2] - min[2], 0.05);
  const distance = (extent * padding) / 2 / Math.tan((fov * Math.PI) / 360) + extent * 0.35;
  const len = Math.hypot(...direction) || 1;
  const dir = direction.map((v) => v / len);
  return {
    target,
    position: [
      target[0] + dir[0] * distance,
      target[1] + dir[1] * distance,
      target[2] + dir[2] * distance,
    ],
    fov,
  };
}

async function main() {
  const body = loadMeshData(
    path.join(ROOT, "public/models/production/neutro_body_v1.glb"),
  );
  const regions = loadHighlightRegions(HIGHLIGHT_GLB);
  mkdirSync(OUT, { recursive: true });

  for (const [name, direction, ids] of SHOTS) {
    const highlightMesh = mergeRegions(regions, ids);
    if (!highlightMesh.triangleCount) {
      console.log("SKIP empty", name);
      continue;
    }
    const union = {
      positions: Float64Array.from([...body.positions, ...highlightMesh.positions]),
      uvs: Float64Array.from([
        ...new Float64Array(body.vertexCount * 2),
        ...highlightMesh.uvs,
      ]),
      indices: Uint32Array.from([
        ...body.indices,
        ...Array.from(highlightMesh.indices, (i) => i + body.vertexCount),
      ]),
      triangleCount: body.triangleCount + highlightMesh.triangleCount,
      vertexCount: body.vertexCount + highlightMesh.vertexCount,
    };
    const normals = computeVertexNormals(union);
    const camera = cameraFromMesh(highlightMesh, direction, { padding: 1.9 });
    const maskSampler = {
      at: (u, v) => (u > 0.001 || v > 0.001 ? 1 : 0),
      membership: (u, v, set) => {
        const id = u > 0.001 || v > 0.001 ? 1 : 0;
        return set.has(id) ? 1 : 0;
      },
    };
    await renderView({
      mesh: union,
      normals,
      maskSampler,
      camera,
      highlightIndices: [1],
      width: 720,
      height: 900,
    }).toFile(path.join(OUT, `${name}.png`));
    console.log(name, highlightMesh.triangleCount);
  }
}

main();
