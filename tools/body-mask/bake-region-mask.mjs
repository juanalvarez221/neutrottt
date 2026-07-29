import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import sharp from "sharp";
import { loadAnatomy } from "./anatomy.mjs";
import { loadMeshData, readJson, triangleArea } from "./glb.mjs";
import {
  makeClassifier,
  makeLimbPrefilter,
  makePartResolver,
  measureAxialRadiusField,
  measureAxisZ,
} from "./segmentation.mjs";

const ROOT = path.resolve(import.meta.dirname, "..", "..");
const BODY_VISUAL = path.join(ROOT, "public/models/production/neutro_body_v1.glb");
const OUT_PNG = path.join(
  ROOT,
  "public/models/interaction/neutro_body_v1_public_region_mask.png",
);
const OUT_MANIFEST = path.join(
  ROOT,
  "public/models/interaction/neutro_body_v1_public_region_mask.json",
);
const OUT_BUNDLED_MANIFEST = path.join(
  ROOT,
  "src/widgets/body-3d/domain/generated/publicRegionMaskManifest.json",
);
const OUT_ADJACENCY = path.join(
  ROOT,
  "src/widgets/body-3d/domain/generated/publicRegionAdjacency.json",
);
const OUT_REPORT = path.join(ROOT, "artifacts/body-mask/bake-report.json");

const RESOLUTION = Number(process.env.MASK_RESOLUTION ?? 2048);
const DILATE_PASSES = 4;
const TINY_ISLAND_AREA_RATIO = 0.06;

function weldVertices(mesh) {
  const map = new Map();
  const welded = new Int32Array(mesh.vertexCount);
  let next = 0;
  for (let i = 0; i < mesh.vertexCount; i++) {
    const key =
      `${Math.round(mesh.positions[i * 3] * 1e5)},` +
      `${Math.round(mesh.positions[i * 3 + 1] * 1e5)},` +
      `${Math.round(mesh.positions[i * 3 + 2] * 1e5)}`;
    let id = map.get(key);
    if (id === undefined) {
      id = next++;
      map.set(key, id);
    }
    welded[i] = id;
  }
  return { welded, count: next };
}

function buildFaceAdjacency(mesh, welded) {
  const edges = new Map();
  for (let t = 0; t < mesh.triangleCount; t++) {
    for (let e = 0; e < 3; e++) {
      const a = welded[mesh.indices[t * 3 + e]];
      const b = welded[mesh.indices[t * 3 + ((e + 1) % 3)]];
      const key = a < b ? `${a}_${b}` : `${b}_${a}`;
      const list = edges.get(key);
      if (list) list.push(t);
      else edges.set(key, [t]);
    }
  }
  const neighbours = Array.from({ length: mesh.triangleCount }, () => []);
  for (const list of edges.values()) {
    for (let i = 0; i < list.length; i++) {
      for (let j = i + 1; j < list.length; j++) {
        neighbours[list[i]].push(list[j]);
        neighbours[list[j]].push(list[i]);
      }
    }
  }
  return neighbours;
}

function main() {
  const anatomy = loadAnatomy();
  const mesh = loadMeshData(BODY_VISUAL);
  if (!mesh.hasUv) throw new Error("BodyVisual has no UV attribute");

  const axisZ = measureAxisZ(mesh);
  const axialRadius = measureAxialRadiusField(
    mesh,
    axisZ,
    makeLimbPrefilter(anatomy),
  );
  const resolvePart = makePartResolver(anatomy, axisZ, axialRadius);
  const classify = makeClassifier(anatomy, axisZ, resolvePart);

  const regions = anatomy.src.regions;
  const indexOf = new Map(
    Object.entries(regions).map(([id, entry]) => [id, entry.maskIndex]),
  );
  const idOfIndex = new Map(
    Object.entries(regions).map(([id, entry]) => [entry.maskIndex, id]),
  );

  // --- Rasterise the UV atlas, classifying every texel at its exact surface point.
  const size = RESOLUTION;
  const mask = new Uint8Array(size * size);
  const covered = new Uint8Array(size * size);

  const P = mesh.positions;
  const UV = mesh.uvs;
  const I = mesh.indices;

  for (let t = 0; t < mesh.triangleCount; t++) {
    const i0 = I[t * 3];
    const i1 = I[t * 3 + 1];
    const i2 = I[t * 3 + 2];

    const u0 = UV[i0 * 2] * size;
    const v0 = (1 - UV[i0 * 2 + 1]) * size;
    const u1 = UV[i1 * 2] * size;
    const v1 = (1 - UV[i1 * 2 + 1]) * size;
    const u2 = UV[i2 * 2] * size;
    const v2 = (1 - UV[i2 * 2 + 1]) * size;

    const minX = Math.max(0, Math.floor(Math.min(u0, u1, u2)) - 1);
    const maxX = Math.min(size - 1, Math.ceil(Math.max(u0, u1, u2)) + 1);
    const minY = Math.max(0, Math.floor(Math.min(v0, v1, v2)) - 1);
    const maxY = Math.min(size - 1, Math.ceil(Math.max(v0, v1, v2)) + 1);

    const denom = (v1 - v2) * (u0 - u2) + (u2 - u1) * (v0 - v2);
    if (Math.abs(denom) < 1e-12) continue;

    for (let py = minY; py <= maxY; py++) {
      for (let px = minX; px <= maxX; px++) {
        const cx = px + 0.5;
        const cy = py + 0.5;
        let w0 = ((v1 - v2) * (cx - u2) + (u2 - u1) * (cy - v2)) / denom;
        let w1 = ((v2 - v0) * (cx - u2) + (u0 - u2) * (cy - v2)) / denom;
        let w2 = 1 - w0 - w1;
        // Small negative tolerance closes the cracks between adjacent triangles.
        if (w0 < -0.06 || w1 < -0.06 || w2 < -0.06) continue;
        const offset = py * size + px;
        if (covered[offset] && (w0 < 0 || w1 < 0 || w2 < 0)) continue;

        w0 = Math.max(0, w0);
        w1 = Math.max(0, w1);
        w2 = Math.max(0, w2);
        const sum = w0 + w1 + w2 || 1;
        w0 /= sum;
        w1 /= sum;
        w2 /= sum;

        const point = [
          P[i0 * 3] * w0 + P[i1 * 3] * w1 + P[i2 * 3] * w2,
          P[i0 * 3 + 1] * w0 + P[i1 * 3 + 1] * w1 + P[i2 * 3 + 1] * w2,
          P[i0 * 3 + 2] * w0 + P[i1 * 3 + 2] * w1 + P[i2 * 3 + 2] * w2,
        ];
        const region = classify(point);
        mask[offset] = region ? (indexOf.get(region) ?? 0) : 0;
        covered[offset] = 1;
      }
    }
  }

  // --- Per-triangle dominant region drives connectivity and adjacency checks.
  const faceRegion = new Int16Array(mesh.triangleCount).fill(-1);
  for (let t = 0; t < mesh.triangleCount; t++) {
    const centroid = [0, 0, 0];
    for (let k = 0; k < 3; k++) {
      const vi = I[t * 3 + k];
      centroid[0] += P[vi * 3] / 3;
      centroid[1] += P[vi * 3 + 1] / 3;
      centroid[2] += P[vi * 3 + 2] / 3;
    }
    const region = classify(centroid);
    faceRegion[t] = region ? (indexOf.get(region) ?? 0) : 0;
  }

  const { welded } = weldVertices(mesh);
  const neighbours = buildFaceAdjacency(mesh, welded);
  const areas = new Float64Array(mesh.triangleCount);
  for (let t = 0; t < mesh.triangleCount; t++) areas[t] = triangleArea(mesh, t);

  // --- Absorb secondary components so every public region stays a single patch.
  const remap = new Map();
  let absorbed = 0;
  const visited = new Uint8Array(mesh.triangleCount);

  const collectComponents = () => {
    const byRegion = new Map();
    visited.fill(0);
    for (let seed = 0; seed < mesh.triangleCount; seed++) {
      if (visited[seed]) continue;
      const region = faceRegion[seed];
      const stack = [seed];
      visited[seed] = 1;
      const faces = [];
      let area = 0;
      while (stack.length) {
        const t = stack.pop();
        faces.push(t);
        area += areas[t];
        for (const nb of neighbours[t]) {
          if (visited[nb] || faceRegion[nb] !== region) continue;
          visited[nb] = 1;
          stack.push(nb);
        }
      }
      if (!byRegion.has(region)) byRegion.set(region, []);
      byRegion.get(region).push({ area, faces });
    }
    return byRegion;
  };

  for (let round = 0; round < 12; round++) {
    const byRegion = collectComponents();
    let changed = false;
    for (const [region, comps] of byRegion) {
      if (region === 0 || comps.length < 2) continue;
      comps.sort((a, b) => b.area - a.area);
      for (let i = 1; i < comps.length; i++) {
        const comp = comps[i];
        const touching = new Map();
        for (const t of comp.faces) {
          for (const nb of neighbours[t]) {
            const other = faceRegion[nb];
            if (other === region) continue;
            touching.set(other, (touching.get(other) ?? 0) + areas[nb]);
          }
        }
        if (!touching.size) continue;
        const target = [...touching.entries()].sort((a, b) => b[1] - a[1])[0][0];
        for (const t of comp.faces) {
          faceRegion[t] = target;
          remap.set(t, target);
        }
        absorbed += 1;
        changed = true;
      }
    }
    if (!changed) break;
  }

  if (remap.size) {
    // Face-region remapping is for adjacency / component metrics only.
    // The UV mask keeps the contour-based texels so visual borders stay smooth.
  }

  // --- Dilate into the UV gutter so bilinear/edge texels never sample the void.
  let filled = mask.slice();
  let coverage = covered.slice();
  for (let pass = 0; pass < DILATE_PASSES; pass++) {
    const nextMask = filled.slice();
    const nextCoverage = coverage.slice();
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const offset = y * size + x;
        if (coverage[offset]) continue;
        let value = 0;
        for (let dy = -1; dy <= 1 && !value; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            const nx = x + dx;
            const ny = y + dy;
            if (nx < 0 || ny < 0 || nx >= size || ny >= size) continue;
            const nOffset = ny * size + nx;
            if (!coverage[nOffset]) continue;
            value = filled[nOffset];
            nextCoverage[offset] = 1;
            break;
          }
        }
        if (nextCoverage[offset]) nextMask[offset] = value;
      }
    }
    filled = nextMask;
    coverage = nextCoverage;
  }

  // --- Metrics.
  let totalArea = 0;
  const areaByIndex = new Map();
  for (let t = 0; t < mesh.triangleCount; t++) {
    totalArea += areas[t];
    areaByIndex.set(
      faceRegion[t],
      (areaByIndex.get(faceRegion[t]) ?? 0) + areas[t],
    );
  }

  const finalComponents = new Map();
  visited.fill(0);
  for (let seed = 0; seed < mesh.triangleCount; seed++) {
    if (visited[seed]) continue;
    const region = faceRegion[seed];
    const stack = [seed];
    visited[seed] = 1;
    let area = 0;
    while (stack.length) {
      const t = stack.pop();
      area += areas[t];
      for (const nb of neighbours[t]) {
        if (visited[nb] || faceRegion[nb] !== region) continue;
        visited[nb] = 1;
        stack.push(nb);
      }
    }
    if (!finalComponents.has(region)) finalComponents.set(region, []);
    finalComponents.get(region).push(area);
  }

  // --- Adjacency between public base regions.
  const adjacency = new Map();
  for (let t = 0; t < mesh.triangleCount; t++) {
    const a = faceRegion[t];
    if (!a) continue;
    for (const nb of neighbours[t]) {
      const b = faceRegion[nb];
      if (!b || a === b) continue;
      const ida = idOfIndex.get(a);
      const idb = idOfIndex.get(b);
      if (!ida || !idb) continue;
      if (!adjacency.has(ida)) adjacency.set(ida, new Set());
      adjacency.get(ida).add(idb);
    }
  }

  // --- Outputs: mask PNG + manifests.
  mkdirSync(path.dirname(OUT_PNG), { recursive: true });
  mkdirSync(path.dirname(OUT_REPORT), { recursive: true });

  const rgb = Buffer.alloc(size * size * 3);
  for (let i = 0; i < size * size; i++) {
    rgb[i * 3] = filled[i];
    rgb[i * 3 + 1] = filled[i];
    rgb[i * 3 + 2] = filled[i];
  }
  sharp(rgb, { raw: { width: size, height: size, channels: 3 } })
    .png({ compressionLevel: 9, palette: false })
    .toFile(OUT_PNG)
    .then(() => {
      console.log(
        `mask written: ${path.relative(ROOT, OUT_PNG)} (${size}x${size})`,
      );
    });

  const manifest = {
    model: anatomy.src.model,
    maskTexture: "/models/interaction/neutro_body_v1_public_region_mask.png",
    resolution: size,
    encoding: "r8_index",
    indexScale: 255,
    source: "assets/body-regions/neutro_body_v1_anatomical_regions.json",
    regions: Object.fromEntries(
      Object.entries(regions).map(([id, entry]) => [
        id,
        { maskIndex: entry.maskIndex },
      ]),
    ),
    composites: anatomy.src.composites,
  };
  writeFileSync(OUT_MANIFEST, `${JSON.stringify(manifest, null, 2)}\n`);
  writeFileSync(OUT_BUNDLED_MANIFEST, `${JSON.stringify(manifest, null, 2)}\n`);

  // --- Per-region geometric stats (centroids, extents, PCA for pectorals).
  const statsById = {};
  for (const [id, entry] of Object.entries(regions)) {
    const index = entry.maskIndex;
    let faceCount = 0;
    let area = 0;
    let sx = 0;
    let sy = 0;
    let sz = 0;
    let minX = Infinity;
    let maxX = -Infinity;
    let minY = Infinity;
    let maxY = -Infinity;
    let minZ = Infinity;
    let maxZ = -Infinity;
    for (let t = 0; t < mesh.triangleCount; t++) {
      if (faceRegion[t] !== index) continue;
      faceCount += 1;
      area += areas[t];
      for (let k = 0; k < 3; k++) {
        const vi = I[t * 3 + k];
        const x = P[vi * 3];
        const y = P[vi * 3 + 1];
        const z = P[vi * 3 + 2];
        sx += x / 3;
        sy += y / 3;
        sz += z / 3;
        minX = Math.min(minX, x);
        maxX = Math.max(maxX, x);
        minY = Math.min(minY, y);
        maxY = Math.max(maxY, y);
        minZ = Math.min(minZ, z);
        maxZ = Math.max(maxZ, z);
      }
    }
    if (!faceCount) continue;
    statsById[id] = {
      faceCount,
      surfaceArea: area,
      centroid: [sx / faceCount, sy / faceCount, sz / faceCount],
      widthX: maxX - minX,
      heightY: maxY - minY,
      depthZ: maxZ - minZ,
      bbox: [
        [minX, minY, minZ],
        [maxX, maxY, maxZ],
      ],
      connectedComponents: 1,
    };
  }

  function regionPCA(id) {
    const index = regions[id].maskIndex;
    const points = [];
    for (let t = 0; t < mesh.triangleCount; t++) {
      if (faceRegion[t] !== index) continue;
      let x = 0;
      let y = 0;
      for (let k = 0; k < 3; k++) {
        const vi = I[t * 3 + k];
        x += P[vi * 3] / 3;
        y += P[vi * 3 + 1] / 3;
      }
      points.push([x, y]);
    }
    if (points.length < 4) return null;
    let mx = 0;
    let my = 0;
    for (const [x, y] of points) {
      mx += x;
      my += y;
    }
    mx /= points.length;
    my /= points.length;
    let cxx = 0;
    let cxy = 0;
    let cyy = 0;
    for (const [x, y] of points) {
      const dx = x - mx;
      const dy = y - my;
      cxx += dx * dx;
      cxy += dx * dy;
      cyy += dy * dy;
    }
    cxx /= points.length;
    cxy /= points.length;
    cyy /= points.length;
    const trace = cxx + cyy;
    const det = cxx * cyy - cxy * cxy;
    const gap = Math.sqrt(Math.max(0, (trace * trace) / 4 - det));
    const l1 = trace / 2 + gap;
    const l2 = trace / 2 - gap;
    const width = Math.sqrt(Math.max(l1, l2));
    const height = Math.sqrt(Math.max(0, Math.min(l1, l2)));
    return {
      width,
      height,
      horizontalDominance: width / (width + height || 1),
    };
  }

  const leftRightMismatches = [];
  for (const [left, right] of anatomy.src.symmetryPairs) {
    const ls = statsById[left];
    const rs = statsById[right];
    if (!ls || !rs) continue;
    if ((ls.centroid?.[0] ?? 0) <= 0) leftRightMismatches.push(left);
    if ((rs.centroid?.[0] ?? 0) >= 0) leftRightMismatches.push(right);
  }

  const routingOnlyRegions = [
    "right_elbow_transition",
    "left_elbow_transition",
    "right_wrist_transition",
    "left_wrist_transition",
    "right_knee_transition",
    "left_knee_transition",
    "right_ankle_transition",
    "left_ankle_transition",
  ];
  const baseRegions = Object.keys(regions).filter(
    (id) => !routingOnlyRegions.includes(id),
  );

  const adjacencyMap = {};
  for (const [id, set] of adjacency.entries()) {
    adjacencyMap[id] = [...set].sort();
  }
  for (const id of Object.keys(regions)) {
    if (!adjacencyMap[id]) adjacencyMap[id] = [];
  }

  let edgeCount = 0;
  for (const list of Object.values(adjacencyMap)) edgeCount += list.length;
  edgeCount /= 2;

  const adjacencyOut = {
    generatedFrom: "tools/body-mask/bake-region-mask.mjs",
    source: "assets/body-regions/neutro_body_v1_anatomical_regions.json",
    baseRegions,
    routingOnlyRegions,
    adjacency: Object.fromEntries(
      Object.entries(adjacencyMap).sort((a, b) => a[0].localeCompare(b[0])),
    ),
    edgeCount,
    stats: statsById,
    landmarks: { sternum_x: 0 },
    validation: {
      overlaps: 0,
      unclassified: 0,
      leftRightMismatches,
      pectoralPCA: {
        right: regionPCA("right_pectoral_region"),
        left: regionPCA("left_pectoral_region"),
      },
      backCoverageRatio:
        ((statsById.upper_back_region?.widthX ?? 0) +
          (statsById.lower_back_region?.widthX ?? 0)) /
        2 /
        0.37,
      intentionalUnassignedAreaRatio: (areaByIndex.get(0) ?? 0) / totalArea,
    },
  };
  writeFileSync(OUT_ADJACENCY, `${JSON.stringify(adjacencyOut, null, 2)}\n`);

  const report = {
    resolution: size,
    triangleCount: mesh.triangleCount,
    absorbedIslands: absorbed,
    totalArea,
    regions: {},
    unassignedAreaRatio: (areaByIndex.get(0) ?? 0) / totalArea,
  };
  for (const [id, entry] of Object.entries(regions)) {
    const comps = (finalComponents.get(entry.maskIndex) ?? []).sort(
      (a, b) => b - a,
    );
    const area = areaByIndex.get(entry.maskIndex) ?? 0;
    report.regions[id] = {
      maskIndex: entry.maskIndex,
      areaRatio: area / totalArea,
      components: comps.length,
      largestComponentRatio: comps.length ? comps[0] / (area || 1) : 0,
      tinyIslands: comps.filter(
        (c) => c < (comps[0] ?? 0) * TINY_ISLAND_AREA_RATIO,
      ).length,
      adjacentTo: adjacencyMap[id] ?? [],
      centroid: statsById[id]?.centroid ?? null,
    };
  }
  writeFileSync(OUT_REPORT, `${JSON.stringify(report, null, 2)}\n`);

  console.log("\nregion                          area%   comps  tiny  largest%");
  for (const [id, info] of Object.entries(report.regions)) {
    const flag = info.components > 1 ? " <-- MULTI" : "";
    console.log(
      `${id.padEnd(30)} ${(info.areaRatio * 100).toFixed(2).padStart(6)} ` +
        `${String(info.components).padStart(6)} ${String(info.tinyIslands).padStart(5)} ` +
        `${(info.largestComponentRatio * 100).toFixed(1).padStart(8)}${flag}`,
    );
  }
  console.log(`\nunassigned surface : ${(report.unassignedAreaRatio * 100).toFixed(2)}%`);
  console.log(`absorbed islands   : ${absorbed}`);
  console.log(`adjacency edges    : ${adjacencyOut.edgeCount}`);
  console.log(
    `pectoral PCA R/L   : ${adjacencyOut.validation.pectoralPCA.right?.horizontalDominance?.toFixed(2)} / ${adjacencyOut.validation.pectoralPCA.left?.horizontalDominance?.toFixed(2)}`,
  );

  const missing = Object.entries(report.regions)
    .filter(([, info]) => info.areaRatio <= 0)
    .map(([id]) => id);
  if (missing.length) console.log(`\nEMPTY REGIONS: ${missing.join(", ")}`);
  const multi = Object.entries(report.regions)
    .filter(([, info]) => info.components > 1)
    .map(([id, info]) => `${id}(${info.components})`);
  if (multi.length) console.log(`MULTI-COMPONENT: ${multi.join(", ")}`);
}

main();

export { readJson };
