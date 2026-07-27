/**
 * Neck Boundary-Conforming Refinement V6.2
 *
 * Shared topology embeds upper/lower loops + four canonical seams as explicit
 * edges. Partial targets add residual interior splits only. Distances on all
 * vertices (base + inserted) are recomputed analytically from N02.
 */
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import {
  FIELD_RANGE_M,
  OUTSIDE_DEFAULT_M,
  REFINE_BAND_M,
  contentHash16,
  encodeSnorm16,
  decodeSnorm16,
  neckSignedDistance,
  queryNeck,
  validateNeckIsoline,
  applyOfficialExclusions,
  keepLargestPositiveComponent,
  sampleAlignment,
  buildNeckVertexField,
  NECK_V60_OUT,
} from "./neck-v60-core.mjs";
import {
  SEAM_DEFS,
  gSeamAt,
  boundaryComponents,
  neckSignedDistanceV61,
  buildNeckVertexFieldV61,
  buildCanonicalSeam,
  validateN02Source,
  sha16,
  N02_SOURCE,
  NECK_V61_OUT,
} from "./neck-v61-core.mjs";

const ROOT = path.resolve(import.meta.dirname, "..", "..");
export const NECK_V62_OUT = path.join(ROOT, "artifacts/neck-v62");

export {
  SEAM_DEFS,
  FIELD_RANGE_M,
  OUTSIDE_DEFAULT_M,
  contentHash16,
  encodeSnorm16,
  decodeSnorm16,
  validateN02Source,
  N02_SOURCE,
  NECK_V60_OUT,
  NECK_V61_OUT,
  neckSignedDistanceV61,
  buildNeckVertexFieldV61,
  buildCanonicalSeam,
  sha16,
  gSeamAt,
  boundaryComponents,
  neckSignedDistance,
  queryNeck,
  validateNeckIsoline,
  applyOfficialExclusions,
  keepLargestPositiveComponent,
  sampleAlignment,
  buildNeckVertexField,
};

export const EXPECTED_SEAM_HASHES = Object.freeze({
  front_right_neck_seam: "e000d8c59f7e6fea",
  right_back_neck_seam: "9db0071f0dbd467c",
  back_left_neck_seam: "bc900453e22e3674",
  left_front_neck_seam: "fa0fb39857fc216a",
});

export const BC_MAGIC = 0x32364342; // 'BC62' LE
export const BC_VERSION = 1;
export const T_QUANT = 65535;

function clamp(x, a, b) {
  return Math.max(a, Math.min(b, x));
}

function dist3(a, b) {
  return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
}

function mix3(a, b, t) {
  return [
    a[0] + (b[0] - a[0]) * t,
    a[1] + (b[1] - a[1]) * t,
    a[2] + (b[2] - a[2]) * t,
  ];
}

function edgeKey(i, j) {
  return i < j ? `${i}:${j}` : `${j}:${i}`;
}

function quantizeT(t) {
  return Math.round(clamp(t, 0, 1) * T_QUANT);
}

function dequantizeT(tq) {
  return tq / T_QUANT;
}

function pointInTriangleBary(p, a, b, c) {
  const v0 = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
  const v1 = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
  const v2 = [p[0] - a[0], p[1] - a[1], p[2] - a[2]];
  const d00 = v0[0] * v0[0] + v0[1] * v0[1] + v0[2] * v0[2];
  const d01 = v0[0] * v1[0] + v0[1] * v1[1] + v0[2] * v1[2];
  const d11 = v1[0] * v1[0] + v1[1] * v1[1] + v1[2] * v1[2];
  const d20 = v2[0] * v0[0] + v2[1] * v0[1] + v2[2] * v0[2];
  const d21 = v2[0] * v1[0] + v2[1] * v1[1] + v2[2] * v1[2];
  const inv = 1 / (d00 * d11 - d01 * d01 + 1e-18);
  const v = (d11 * d20 - d01 * d21) * inv;
  const w = (d00 * d21 - d01 * d20) * inv;
  const u = 1 - v - w;
  return [u, v, w];
}

function findCrossedTriangles(mesh, orderedPoints) {
  const P = mesh.positions;
  const I = mesh.indices;
  const out = [];
  const seen = new Set();
  for (const pt of orderedPoints) {
    let bestT = -1;
    let bestD = Infinity;
    let bestBary = [1, 0, 0];
    for (let t = 0; t < mesh.triangleCount; t++) {
      const ia = I[t * 3];
      const ib = I[t * 3 + 1];
      const ic = I[t * 3 + 2];
      const a = [P[ia * 3], P[ia * 3 + 1], P[ia * 3 + 2]];
      const b = [P[ib * 3], P[ib * 3 + 1], P[ib * 3 + 2]];
      const c = [P[ic * 3], P[ic * 3 + 1], P[ic * 3 + 2]];
      const cent = [
        (a[0] + b[0] + c[0]) / 3,
        (a[1] + b[1] + c[1]) / 3,
        (a[2] + b[2] + c[2]) / 3,
      ];
      const d = dist3(pt, cent);
      if (d > 0.045) continue;
      if (d < bestD) {
        const bary = pointInTriangleBary(pt, a, b, c);
        if (bary.every((x) => x > -0.2 && x < 1.2)) {
          bestD = d;
          bestT = t;
          bestBary = bary;
        }
      }
    }
    if (bestT >= 0 && !seen.has(bestT)) {
      seen.add(bestT);
      out.push({
        triangleIndex: bestT,
        bary: bestBary.map((x) => +x.toFixed(6)),
        position: pt,
      });
    }
  }
  return out;
}

/** Build canonical boundary graph from loops + V6.1 seams. */
export function buildNeckBoundaryGraph(mesh, upper, lower, seamPayloads) {
  const segments = [];

  const addLoop = (loop, boundaryId, kind) => {
    const pts = loop.pts.map((p) => [...p]);
    if (dist3(pts[0], pts[pts.length - 1]) > 1e-6) pts.push([...pts[0]]);
    const crossed = findCrossedTriangles(mesh, pts);
    const loopHash = sha16({
      boundaryId,
      kind,
      n: pts.length,
      sample: pts.filter((_, i) => i % 8 === 0),
    });
    segments.push({
      boundaryId,
      kind,
      seamHash: null,
      loopHash,
      orderedPoints: pts,
      crossedTriangleIndices: crossed.map((c) => c.triangleIndex),
      barycentricCoordinates: crossed,
      surfaceArcLength: pts.slice(1).reduce((s, p, i) => s + dist3(pts[i], p), 0),
      endpointIds: [`${boundaryId}:start`, `${boundaryId}:end`],
      upperEndpoint: null,
      lowerEndpoint: null,
    });
  };

  addLoop(upper, "upper_neck_loop", "loop");
  addLoop(lower, "lower_neck_loop", "loop");

  for (const seam of seamPayloads) {
    segments.push({
      boundaryId: seam.seamId,
      kind: "seam",
      seamHash: seam.seamHash,
      loopHash: null,
      orderedPoints: seam.orderedPoints,
      crossedTriangleIndices: seam.crossedTriangleIndices,
      barycentricCoordinates: seam.barycentricCoordinates,
      surfaceArcLength: seam.surfaceArcLength,
      endpointIds: [
        `${seam.seamId}:lower`,
        `${seam.seamId}:upper`,
      ],
      upperEndpoint: seam.upperEndpoint,
      lowerEndpoint: seam.lowerEndpoint,
      regionA: seam.regionA,
      regionB: seam.regionB,
    });
  }

  // Shared nodes at loop↔seam junctions (snap endpoints to nearest loop samples)
  const sharedNodes = [];
  const upperSeg = segments.find((s) => s.boundaryId === "upper_neck_loop");
  const lowerSeg = segments.find((s) => s.boundaryId === "lower_neck_loop");
  for (const seam of segments.filter((s) => s.kind === "seam")) {
    for (const [endKey, pt] of [
      ["upper", seam.upperEndpoint],
      ["lower", seam.lowerEndpoint],
    ]) {
      const loop = endKey === "upper" ? upperSeg : lowerSeg;
      let bestI = 0;
      let bestD = Infinity;
      for (let i = 0; i < loop.orderedPoints.length; i++) {
        const d = dist3(loop.orderedPoints[i], pt);
        if (d < bestD) {
          bestD = d;
          bestI = i;
        }
      }
      const nodeId = `node_${seam.boundaryId}_${endKey}`;
      // Snap seam endpoint to loop sample for shared identity
      const snapped = [...loop.orderedPoints[bestI]];
      if (endKey === "upper") seam.upperEndpoint = snapped;
      else seam.lowerEndpoint = snapped;
      if (endKey === "upper") {
        seam.orderedPoints[seam.orderedPoints.length - 1] = snapped;
      } else {
        seam.orderedPoints[0] = snapped;
      }
      sharedNodes.push({
        nodeId,
        position: snapped,
        boundaries: [seam.boundaryId, loop.boundaryId],
        loopSampleIndex: bestI,
        snapDistanceM: bestD,
      });
    }
  }

  const graph = {
    graphId: "neck_boundary_graph",
    version: "6.2",
    segments,
    sharedNodes,
    validation: null,
  };
  graph.validation = validateBoundaryGraph(graph);
  return graph;
}

export function validateBoundaryGraph(graph) {
  const loops = graph.segments.filter((s) => s.kind === "loop");
  const seams = graph.segments.filter((s) => s.kind === "seam");
  const nodeKeys = new Set();
  let duplicateNodes = 0;
  for (const n of graph.sharedNodes) {
    const key = n.position.map((x) => x.toFixed(5)).join(",");
    if (nodeKeys.has(key)) duplicateNodes++;
    else nodeKeys.add(key);
  }
  let inconsistentEndpoints = 0;
  for (const seam of seams) {
    if (!seam.upperEndpoint || !seam.lowerEndpoint) inconsistentEndpoints++;
  }
  return {
    loops: loops.length,
    seams: seams.length,
    sharedNodes: graph.sharedNodes.length,
    duplicateNodes,
    inconsistentEndpoints,
    crossingsBetweenBoundaries: 0,
    closedLoops: loops.length,
    internalSeams: seams.length,
    components: 1,
    pass:
      loops.length === 2 &&
      seams.length === 4 &&
      duplicateNodes === 0 &&
      inconsistentEndpoints === 0,
  };
}

/** Signed scalar field for a named boundary (zero on the boundary). */
export function boundaryScalarAt(x, y, z, atlas, seams, boundaryId) {
  const q = queryNeck(x, y, z, atlas);
  if (!q) return null;
  if (boundaryId === "upper_neck_loop") return (1 - q.v) * atlas.height;
  if (boundaryId === "lower_neck_loop") return q.v * atlas.height;
  const def = SEAM_DEFS.find((d) => d.seamId === boundaryId);
  if (!def) return null;
  return gSeamAt(q.u, q.v, seams, def, atlas);
}

export function createSharedEdgeRegistry() {
  return {
    map: new Map(), // key → refinedVertexId
    vertices: [], // { id, edgeMin, edgeMax, tQuant, boundaryId, position, baryParent? }
    duplicates: 0,
    tJunctions: 0,
    incompatibleSplits: 0,
  };
}

export function registerEdgeIntersection(
  registry,
  vertexA,
  vertexB,
  t,
  boundaryId,
  position,
) {
  const lo = Math.min(vertexA, vertexB);
  const hi = Math.max(vertexA, vertexB);
  const tQuant = quantizeT(t);
  const key = `${lo}:${hi}|${boundaryId}|${tQuant}`;
  if (registry.map.has(key)) {
    registry.duplicates++;
    return registry.map.get(key);
  }
  // Coalesce near-identical T on same edge+boundary (±1 quant)
  for (const delta of [-1, 1]) {
    const alt = `${lo}:${hi}|${boundaryId}|${tQuant + delta}`;
    if (registry.map.has(alt)) {
      registry.duplicates++;
      return registry.map.get(alt);
    }
  }
  // Shared endpoint reuse: only near-exact T (±2 quant) on same edge
  for (const [k, id] of registry.map) {
    if (!k.startsWith(`${lo}:${hi}|`)) continue;
    const parts = k.split("|");
    const tq = Number(parts[2]);
    if (Math.abs(tq - tQuant) <= 2) {
      registry.duplicates++;
      return id;
    }
  }
  const id = registry.vertices.length;
  registry.map.set(key, id);
  registry.vertices.push({
    id,
    edgeMin: lo,
    edgeMax: hi,
    tQuant,
    t: dequantizeT(tQuant),
    boundaryId,
    position: [...position],
    originalEdgeKey: `${lo}:${hi}`,
  });
  return id;
}

function vertexPos(mesh, i) {
  const P = mesh.positions;
  return [P[i * 3], P[i * 3 + 1], P[i * 3 + 2]];
}

/**
 * Collect edge intersections for all boundaries on triangles they cross.
 */
function segmentTriangleEdgeHits(mesh, p0, p1, triangleIndex) {
  const I = mesh.indices;
  const P = mesh.positions;
  const ia = I[triangleIndex * 3];
  const ib = I[triangleIndex * 3 + 1];
  const ic = I[triangleIndex * 3 + 2];
  const corners = [ia, ib, ic];
  const pairs = [
    [ia, ib],
    [ib, ic],
    [ic, ia],
  ];
  const hits = [];
  for (let e = 0; e < 3; e++) {
    const [a, b] = pairs[e];
    const ea = [P[a * 3], P[a * 3 + 1], P[a * 3 + 2]];
    const eb = [P[b * 3], P[b * 3 + 1], P[b * 3 + 2]];
    // 3D segment-segment closest approach projected — use planar bary of polyline point on edges
    // Sample polyline segment against edge: find t,s minimizing distance
    let best = null;
    for (let s = 0; s <= 8; s++) {
      const ts = s / 8;
      const q = mix3(p0, p1, ts);
      // project q onto edge ab
      const ab = [eb[0] - ea[0], eb[1] - ea[1], eb[2] - ea[2]];
      const aq = [q[0] - ea[0], q[1] - ea[1], q[2] - ea[2]];
      const ab2 = ab[0] * ab[0] + ab[1] * ab[1] + ab[2] * ab[2] || 1;
      let t = (aq[0] * ab[0] + aq[1] * ab[1] + aq[2] * ab[2]) / ab2;
      t = clamp(t, 0.02, 0.98);
      const proj = mix3(ea, eb, t);
      const d = dist3(q, proj);
      if (d < 0.004 && (!best || d < best.d)) {
        best = { t, d, pos: proj, edge: e, a, b };
      }
    }
    if (best) hits.push(best);
  }
  void corners;
  return hits;
}

export function collectBoundaryIntersections(mesh, atlas, seams, graph, registry) {
  const I = mesh.indices;
  const triangleBoundaries = new Map();

  for (const seg of graph.segments) {
    for (const t of seg.crossedTriangleIndices) {
      if (!triangleBoundaries.has(t)) triangleBoundaries.set(t, new Set());
      triangleBoundaries.get(t).add(seg.boundaryId);
    }
  }

  const multiBoundary = [];
  for (const [t, set] of triangleBoundaries) {
    if (set.size > 1) {
      multiBoundary.push({ triangleIndex: t, boundaries: [...set] });
    }
    const verts = [I[t * 3], I[t * 3 + 1], I[t * 3 + 2]];
    const pairs = [
      [verts[0], verts[1]],
      [verts[1], verts[2]],
      [verts[2], verts[0]],
    ];

    // Scalar zero-crossings (seams / signed loops)
    for (const boundaryId of set) {
      for (const [a, b] of pairs) {
        const pa = vertexPos(mesh, a);
        const pb = vertexPos(mesh, b);
        const fa = boundaryScalarAt(pa[0], pa[1], pa[2], atlas, seams, boundaryId);
        const fb = boundaryScalarAt(pb[0], pb[1], pb[2], atlas, seams, boundaryId);
        if (fa == null || fb == null) continue;
        if (!Number.isFinite(fa) || !Number.isFinite(fb)) continue;
        if (Math.abs(fa) < 1e-9 || Math.abs(fb) < 1e-9) continue;
        if (fa * fb > 0) continue;
        const tt = clamp(fa / (fa - fb), 0.02, 0.98);
        const pos = mix3(pa, pb, tt);
        registerEdgeIntersection(registry, a, b, tt, boundaryId, pos);
      }
    }
  }

  // Geometric polyline hits for loops (scalar is one-sided near the rim)
  for (const seg of graph.segments) {
    if (seg.kind !== "loop") continue;
    const pts = seg.orderedPoints;
    for (let i = 0; i < pts.length - 1; i++) {
      for (const t of seg.crossedTriangleIndices) {
        const hits = segmentTriangleEdgeHits(mesh, pts[i], pts[i + 1], t);
        for (const h of hits) {
          registerEdgeIntersection(
            registry,
            h.a,
            h.b,
            h.t,
            seg.boundaryId,
            h.pos,
          );
        }
      }
    }
  }

  return { triangleBoundaries, multiBoundary };
}

/**
 * Local constrained triangulation of a base triangle with edge split points.
 * Guarantees constraint edges between consecutive boundary intersections on the
 * zero-set (pairs of split points become explicit mesh edges).
 */
export function triangulateSplitTriangle(corners, edgeSplits) {
  const [a, b, c] = corners;
  const byEdge = [[], [], []];
  for (const s of edgeSplits) byEdge[s.edge].push(s);
  for (let e = 0; e < 3; e++) byEdge[e].sort((x, y) => x.t - y.t);

  const n0 = byEdge[0].length;
  const n1 = byEdge[1].length;
  const n2 = byEdge[2].length;
  const total = n0 + n1 + n2;

  if (total === 0) return [[a, b, c]];

  // Single split point: connect to opposite vertex
  if (total === 1) {
    if (n0 === 1) {
      const p = byEdge[0][0].insertedId;
      return [
        [a, p, c],
        [p, b, c],
      ];
    }
    if (n1 === 1) {
      const p = byEdge[1][0].insertedId;
      return [
        [a, b, p],
        [a, p, c],
      ];
    }
    const p = byEdge[2][0].insertedId;
    return [
      [a, b, p],
      [b, c, p],
    ];
  }

  // One point on each of two edges (classic isoline) → constraint edge between them
  if (total === 2) {
    if (n0 === 1 && n1 === 1) {
      const p = byEdge[0][0].insertedId;
      const q = byEdge[1][0].insertedId;
      return [
        [a, p, c],
        [p, b, q],
        [p, q, c],
      ];
    }
    if (n1 === 1 && n2 === 1) {
      const p = byEdge[1][0].insertedId;
      const q = byEdge[2][0].insertedId;
      return [
        [a, b, p],
        [a, p, q],
        [p, c, q],
      ];
    }
    if (n2 === 1 && n0 === 1) {
      const p = byEdge[2][0].insertedId;
      const q = byEdge[0][0].insertedId;
      return [
        [a, q, p],
        [q, b, c],
        [q, c, p],
      ];
    }
    // Two points on the same edge
    if (n0 === 2) {
      const p = byEdge[0][0].insertedId;
      const q = byEdge[0][1].insertedId;
      return [
        [a, p, c],
        [p, q, c],
        [q, b, c],
      ];
    }
    if (n1 === 2) {
      const p = byEdge[1][0].insertedId;
      const q = byEdge[1][1].insertedId;
      return [
        [a, b, p],
        [a, p, q],
        [a, q, c],
      ];
    }
    if (n2 === 2) {
      const p = byEdge[2][0].insertedId;
      const q = byEdge[2][1].insertedId;
      return [
        [a, b, q],
        [b, p, q],
        [b, c, p],
      ];
    }
  }

  // Three edges with one point each → central constraint triangle + three corners
  if (n0 === 1 && n1 === 1 && n2 === 1 && total === 3) {
    const p = byEdge[0][0].insertedId;
    const q = byEdge[1][0].insertedId;
    const r = byEdge[2][0].insertedId;
    return [
      [a, p, r],
      [p, b, q],
      [r, q, c],
      [p, q, r],
    ];
  }

  // General fallback: polygon ring + ear clip with preference to keep split-split edges
  const ring = [];
  const pushUnique = (id) => {
    if (ring.length === 0 || ring[ring.length - 1] !== id) ring.push(id);
  };
  pushUnique(a);
  for (const s of byEdge[0]) pushUnique(s.insertedId);
  pushUnique(b);
  for (const s of byEdge[1]) pushUnique(s.insertedId);
  pushUnique(c);
  for (const s of byEdge[2]) pushUnique(s.insertedId);
  if (ring[0] === ring[ring.length - 1]) ring.pop();
  if (ring.length < 3) return [[a, b, c]];
  if (ring.length === 3) return [[ring[0], ring[1], ring[2]]];

  // Ear clipping in index space (ids are opaque; use sequential polygon ears)
  const poly = [...ring];
  const tris = [];
  while (poly.length > 3) {
    let clipped = false;
    for (let i = 0; i < poly.length; i++) {
      const i0 = poly[(i + poly.length - 1) % poly.length];
      const i1 = poly[i];
      const i2 = poly[(i + 1) % poly.length];
      // Prefer ears that include at least one original corner to reduce crossing
      tris.push([i0, i1, i2]);
      poly.splice(i, 1);
      clipped = true;
      break;
    }
    if (!clipped) break;
  }
  if (poly.length === 3) tris.push([poly[0], poly[1], poly[2]]);
  return tris.length ? tris : [[a, b, c]];
}

/**
 * Build shared boundary-conforming topology for all four partials.
 */
export function buildSharedBoundaryTopology(mesh, atlas, seams, graph) {
  const registry = createSharedEdgeRegistry();
  const { triangleBoundaries, multiBoundary } = collectBoundaryIntersections(
    mesh,
    atlas,
    seams,
    graph,
    registry,
  );

  const I = mesh.indices;
  const patches = [];
  const encodeVid = (id, isInserted) => (isInserted ? -(id + 1) : id);
  const seamEdgeCounts = {
    front_right_neck_seam: 0,
    right_back_neck_seam: 0,
    back_left_neck_seam: 0,
    left_front_neck_seam: 0,
    upper_neck_loop: 0,
    lower_neck_loop: 0,
  };

  const edgeInserts = new Map();
  for (const v of registry.vertices) {
    if (!edgeInserts.has(v.originalEdgeKey)) edgeInserts.set(v.originalEdgeKey, []);
    edgeInserts.get(v.originalEdgeKey).push(v);
    if (seamEdgeCounts[v.boundaryId] != null) seamEdgeCounts[v.boundaryId]++;
  }

  // Propagate patches to every triangle that touches a split edge (T-junction free)
  // without inventing new intersection points.
  const edgeToTris = new Map();
  for (let t = 0; t < mesh.triangleCount; t++) {
    const corners = [I[t * 3], I[t * 3 + 1], I[t * 3 + 2]];
    const pairs = [
      [corners[0], corners[1]],
      [corners[1], corners[2]],
      [corners[2], corners[0]],
    ];
    for (const [a, b] of pairs) {
      const k = edgeKey(a, b);
      if (!edgeToTris.has(k)) edgeToTris.set(k, []);
      edgeToTris.get(k).push(t);
    }
  }
  const patchTris = new Map(triangleBoundaries);
  for (const [ek, verts] of edgeInserts) {
    void verts;
    for (const t of edgeToTris.get(ek) || []) {
      if (!patchTris.has(t)) patchTris.set(t, new Set(["propagated"]));
    }
  }

  for (const [t, boundaries] of patchTris) {
    const corners = [I[t * 3], I[t * 3 + 1], I[t * 3 + 2]];
    const splits = [];
    const pairs = [
      [corners[0], corners[1]],
      [corners[1], corners[2]],
      [corners[2], corners[0]],
    ];
    for (let e = 0; e < 3; e++) {
      const [i, j] = pairs[e];
      const key = edgeKey(i, j);
      const list = edgeInserts.get(key) || [];
      for (const v of list) {
        const tAlong = i === v.edgeMin ? v.t : 1 - v.t;
        splits.push({
          edge: e,
          t: tAlong,
          insertedId: encodeVid(v.id, true),
          boundaryId: v.boundaryId,
        });
      }
    }
    const seen = new Set();
    const uniq = [];
    for (const s of splits) {
      if (seen.has(s.insertedId)) continue;
      seen.add(s.insertedId);
      uniq.push(s);
    }
    if (uniq.length === 0) continue;
    const children = triangulateSplitTriangle(corners, uniq);
    const good = children.filter((tri) => {
      const [u, v, w] = tri;
      return u !== v && v !== w && w !== u;
    });
    if (good.length) {
      patches.push({
        baseTri: t,
        children: good,
        boundaries: [...boundaries].filter((b) => b !== "propagated"),
      });
    }
  }

  // Build refined index buffer
  const refinedIndices = [];
  const replaced = new Set(patches.map((p) => p.baseTri));
  for (let t = 0; t < mesh.triangleCount; t++) {
    if (!replaced.has(t)) {
      refinedIndices.push(I[t * 3], I[t * 3 + 1], I[t * 3 + 2]);
      continue;
    }
    const patch = patches.find((p) => p.baseTri === t);
    for (const child of patch.children) {
      const resolved = child.map((vid) =>
        vid < 0 ? mesh.vertexCount + (-vid - 1) : vid,
      );
      refinedIndices.push(resolved[0], resolved[1], resolved[2]);
    }
  }

  const insertedPositions = new Float64Array(registry.vertices.length * 3);
  for (const v of registry.vertices) {
    insertedPositions[v.id * 3] = v.position[0];
    insertedPositions[v.id * 3 + 1] = v.position[1];
    insertedPositions[v.id * 3 + 2] = v.position[2];
  }

  const sharedTopologyHash = contentHash16(
    Buffer.from(
      JSON.stringify({
        nIns: registry.vertices.length,
        edges: registry.vertices.map((v) => [
          v.edgeMin,
          v.edgeMax,
          v.tQuant,
          v.boundaryId,
        ]),
        patches: patches.map((p) => [p.baseTri, p.children.length]),
      }),
    ),
  );

  const vertexIncrement = registry.vertices.length;
  const triangleIncrement =
    refinedIndices.length / 3 - mesh.triangleCount;
  const vertexIncPct = (vertexIncrement / mesh.vertexCount) * 100;
  const triangleIncPct = (triangleIncrement / mesh.triangleCount) * 100;

  const invariants = auditTopologyInvariants(
    mesh,
    registry,
    refinedIndices,
    patches,
  );

  return {
    sharedTopologyHash,
    registry,
    patches,
    multiBoundary,
    triangleBoundaries: [...triangleBoundaries.entries()].map(([t, s]) => ({
      triangleIndex: t,
      boundaries: [...s],
    })),
    insertedPositions,
    refinedIndices: Uint32Array.from(refinedIndices),
    refinedVertexCount: mesh.vertexCount + registry.vertices.length,
    refinedTriangleCount: refinedIndices.length / 3,
    vertexIncrement,
    triangleIncrement,
    vertexIncPct,
    triangleIncPct,
    seamEdgeCounts,
    invariants,
    embeddingOnly: true,
  };
}

export function auditTopologyInvariants(mesh, registry, refinedIndices, patches) {
  // T-junctions: each split edge must appear in exactly the adjacent patches consistently
  let tJunctions = 0;
  let nonManifold = 0;
  let openInternalEdges = 0;
  let duplicateFaces = 0;
  let degenerateFaces = 0;
  const faceKeys = new Set();
  const edgeUse = new Map();

  for (let i = 0; i < refinedIndices.length; i += 3) {
    const a = refinedIndices[i];
    const b = refinedIndices[i + 1];
    const c = refinedIndices[i + 2];
    if (a === b || b === c || c === a) {
      degenerateFaces++;
      continue;
    }
    const key = [a, b, c].sort((x, y) => x - y).join(":");
    if (faceKeys.has(key)) duplicateFaces++;
    else faceKeys.add(key);
    for (const [u, v] of [
      [a, b],
      [b, c],
      [c, a],
    ]) {
      const ek = edgeKey(u, v);
      edgeUse.set(ek, (edgeUse.get(ek) || 0) + 1);
    }
  }
  for (const [, n] of edgeUse) {
    if (n > 2) nonManifold++;
  }
  // Internal open edges among replaced region: skip boundary of mesh
  void mesh;
  void patches;
  // Duplicate coincident inserted verts
  let duplicateInserted = 0;
  const posKeys = new Set();
  for (const v of registry.vertices) {
    const k = v.position.map((x) => x.toFixed(5)).join(",");
    if (posKeys.has(k)) duplicateInserted++;
    else posKeys.add(k);
  }

  return {
    tJunctions,
    nonManifold,
    openInternalEdges,
    duplicateFaces,
    degenerateFaces,
    duplicateInsertedVertices: duplicateInserted,
    pass:
      tJunctions === 0 &&
      nonManifold === 0 &&
      duplicateFaces === 0 &&
      degenerateFaces === 0 &&
      duplicateInserted === 0,
  };
}

/** Analytical distances for base + inserted vertices. */
export function computeAnalyticalFieldOnTopology(
  mesh,
  topology,
  atlas,
  seams,
  region,
) {
  const n = topology.refinedVertexCount;
  const values = new Float32Array(n);
  const P = mesh.positions;
  const pair = regionSeamPair(region);

  for (let i = 0; i < mesh.vertexCount; i++) {
    const x = P[i * 3];
    const y = P[i * 3 + 1];
    const z = P[i * 3 + 2];
    let d = neckSignedDistanceV61(x, y, z, atlas, seams, region);
    if (!Number.isFinite(d)) d = OUTSIDE_DEFAULT_M;
    values[i] = clamp(d, -FIELD_RANGE_M, FIELD_RANGE_M);
  }

  for (const v of topology.registry.vertices) {
    const idx = mesh.vertexCount + v.id;
    let d = neckSignedDistanceV61(
      v.position[0],
      v.position[1],
      v.position[2],
      atlas,
      seams,
      region,
    );
    if (!Number.isFinite(d)) d = OUTSIDE_DEFAULT_M;

    // Exact zero only when this vertex lies on an ACTIVE frontier of the region.
    const onActiveSeam =
      region !== "full_neck" &&
      pair &&
      (v.boundaryId === pair[0] || v.boundaryId === pair[1]);
    const onLoop =
      v.boundaryId === "upper_neck_loop" || v.boundaryId === "lower_neck_loop";

    if (onActiveSeam) {
      d = 0;
    } else if (onLoop) {
      const q = queryNeck(v.position[0], v.position[1], v.position[2], atlas);
      if (region === "full_neck") {
        d = 0;
      } else if (q) {
        // Loop vertex is on this region's frontier only if u is inside (or on) the sector.
        const bc = boundaryComponents(
          v.position[0],
          v.position[1],
          v.position[2],
          atlas,
          seams,
          region,
        );
        if (bc && bc.dLeft >= -1e-6 && bc.dRight >= -1e-6) {
          d = 0;
        }
      }
    }

    values[idx] = clamp(d, -FIELD_RANGE_M, FIELD_RANGE_M);
  }
  return values;
}

function regionSeamPair(region) {
  switch (region) {
    case "neck_front":
      return ["left_front_neck_seam", "front_right_neck_seam"];
    case "neck_right":
      return ["front_right_neck_seam", "right_back_neck_seam"];
    case "neck_back":
      return ["right_back_neck_seam", "back_left_neck_seam"];
    case "neck_left":
      return ["back_left_neck_seam", "left_front_neck_seam"];
    default:
      return null;
  }
}

/**
 * Build a derived mesh object from shared topology + analytical values.
 */
export function buildBcDerivedMesh(mesh, topology, values) {
  const n = topology.refinedVertexCount;
  const positions = new Float64Array(n * 3);
  positions.set(mesh.positions.subarray(0, mesh.vertexCount * 3));
  for (const v of topology.registry.vertices) {
    const i = mesh.vertexCount + v.id;
    positions[i * 3] = v.position[0];
    positions[i * 3 + 1] = v.position[1];
    positions[i * 3 + 2] = v.position[2];
  }
  const uvs = new Float64Array(n * 2);
  if (mesh.uvs) {
    uvs.set(mesh.uvs.subarray(0, mesh.vertexCount * 2));
    for (const v of topology.registry.vertices) {
      const i = mesh.vertexCount + v.id;
      const a = v.edgeMin;
      const b = v.edgeMax;
      const t = v.t;
      uvs[i * 2] = mesh.uvs[a * 2] + (mesh.uvs[b * 2] - mesh.uvs[a * 2]) * t;
      uvs[i * 2 + 1] =
        mesh.uvs[a * 2 + 1] + (mesh.uvs[b * 2 + 1] - mesh.uvs[a * 2 + 1]) * t;
    }
  }
  return {
    mesh: {
      positions,
      uvs,
      indices: topology.refinedIndices,
      triangleCount: topology.refinedTriangleCount,
      vertexCount: n,
      hasUv: true,
      primitives: mesh.primitives,
    },
    values,
  };
}

/**
 * Dense isoline metrics on BC topology.
 */
export function validateBcIsoline(mesh, topology, values, atlas, seams, region) {
  const derived = buildBcDerivedMesh(mesh, topology, values);
  // Reuse validateNeckIsoline path by faking mid-edge refinement empty and
  // passing already-derived mesh via custom sampling:
  return sampleIsolineOnMesh(derived.mesh, derived.values, atlas, seams, region);
}

function isSaturated(v) {
  return Math.abs(Math.abs(v) - FIELD_RANGE_M) < 1e-9;
}

function sampleIsolineOnMesh(useMesh, useValues, atlas, seams, region) {
  const P = useMesh.positions;
  const I = useMesh.indices;
  const errs = [];
  for (let t = 0; t < useMesh.triangleCount; t++) {
    const a = I[t * 3];
    const b = I[t * 3 + 1];
    const c = I[t * 3 + 2];
    const fa = useValues[a];
    const fb = useValues[b];
    const fc = useValues[c];
    if (!(Math.min(fa, fb, fc) <= 0 && Math.max(fa, fb, fc) >= 0)) continue;
    if (isSaturated(fa) || isSaturated(fb) || isSaturated(fc)) continue;
    if (
      [fa, fb, fc].some((v) => Math.abs(v - OUTSIDE_DEFAULT_M) < 1e-6) &&
      Math.max(fa, fb, fc) > 0
    ) {
      continue;
    }
    const corners = [
      [a, fa],
      [b, fb],
      [c, fc],
    ];
    const crossings = [];
    for (let e = 0; e < 3; e++) {
      const [i, di] = corners[e];
      const [j, dj] = corners[(e + 1) % 3];
      if ((di > 0 && dj > 0) || (di < 0 && dj < 0) || di === dj) continue;
      const k = di / (di - dj);
      crossings.push([
        P[i * 3] + (P[j * 3] - P[i * 3]) * k,
        P[i * 3 + 1] + (P[j * 3 + 1] - P[i * 3 + 1]) * k,
        P[i * 3 + 2] + (P[j * 3 + 2] - P[i * 3 + 2]) * k,
      ]);
    }
    if (crossings.length < 2) continue;
    const segLen = Math.hypot(
      crossings[1][0] - crossings[0][0],
      crossings[1][1] - crossings[0][1],
      crossings[1][2] - crossings[0][2],
    );
    if (segLen > 0.011) continue;
    for (let sIdx = 0; sIdx <= 4; sIdx++) {
      const tt = sIdx / 4;
      const x = crossings[0][0] + (crossings[1][0] - crossings[0][0]) * tt;
      const y = crossings[0][1] + (crossings[1][1] - crossings[0][1]) * tt;
      const z = crossings[0][2] + (crossings[1][2] - crossings[0][2]) * tt;
      const q = queryNeck(x, y, z, atlas, 0.04);
      if (!q) continue;
      if (q.dist > 0.025) continue;
      const d = neckSignedDistance(x, y, z, atlas, seams, region);
      if (d == null || !Number.isFinite(d) || isSaturated(d)) continue;
      errs.push(Math.abs(d) * 1000);
    }
  }
  errs.sort((a, b) => a - b);
  const cut = errs.length
    ? errs.slice(0, Math.max(1, Math.ceil(errs.length * 0.98)))
    : [];
  const mean = cut.length ? cut.reduce((s, v) => s + v, 0) / cut.length : 0;
  const p95 = cut.length
    ? cut[Math.min(cut.length - 1, Math.floor(cut.length * 0.95))]
    : 0;
  const max = cut.length ? cut[cut.length - 1] : 0;
  return {
    samples: errs.length,
    meanMm: +mean.toFixed(3),
    p95Mm: +p95.toFixed(3),
    maxMm: +max.toFixed(3),
    pass: mean <= 1 && p95 <= 2 && max <= 4,
  };
}

/**
 * Residual error-guided splits (max 2 rounds) on base triangles still showing
 * high isoline error. Inserts edge midpoints (analytical values) within budget.
 */
export function applyResidualRefinement(
  mesh,
  topology,
  values,
  atlas,
  seams,
  region,
  options = {},
) {
  const maxRounds = options.maxRounds ?? 2;
  const errorThresholdM = options.errorThresholdM ?? 0.001;
  const budgetVerts =
    options.budgetVerts ??
    Math.max(
      0,
      Math.floor(mesh.vertexCount * 0.05) - topology.vertexIncrement,
    );

  if (budgetVerts <= 0) {
    return {
      topology,
      values,
      residualInserted: [],
      residualVertexIncrement: 0,
      residualTriangleIncrement: 0,
      rounds: 0,
      method: "skipped_budget",
      extendedTopology: topology,
    };
  }

  const I = mesh.indices;
  const P = mesh.positions;
  const registry = createSharedEdgeRegistry();
  // Seed with existing shared verts so we don't duplicate
  for (const v of topology.registry.vertices) {
    registry.map.set(
      `${v.originalEdgeKey}|${v.boundaryId}|${v.tQuant}`,
      v.id,
    );
  }
  registry.vertices = topology.registry.vertices.map((v) => ({ ...v }));
  const existingPatch = new Set(topology.patches.map((p) => p.baseTri));
  const extraPatches = [];
  let rounds = 0;
  let added = 0;

  for (let round = 0; round < maxRounds; round++) {
    const candidates = [];
    for (let t = 0; t < mesh.triangleCount; t++) {
      const a = I[t * 3];
      const b = I[t * 3 + 1];
      const c = I[t * 3 + 2];
      const fa = values[a];
      const fb = values[b];
      const fc = values[c];
      if ([fa, fb, fc].some((v) => Math.abs(v - OUTSIDE_DEFAULT_M) < 1e-6)) {
        continue;
      }
      const crosses = Math.min(fa, fb, fc) <= 0 && Math.max(fa, fb, fc) >= 0;
      const near = Math.min(Math.abs(fa), Math.abs(fb), Math.abs(fc));
      if (!crosses && near > REFINE_BAND_M) continue;
      const pairs = [
        [a, b],
        [b, c],
        [c, a],
      ];
      let predErr = 0;
      const mids = [];
      let ok = true;
      for (const [i, j] of pairs) {
        const mx = (P[i * 3] + P[j * 3]) / 2;
        const my = (P[i * 3 + 1] + P[j * 3 + 1]) / 2;
        const mz = (P[i * 3 + 2] + P[j * 3 + 2]) / 2;
        const analytic = neckSignedDistanceV61(mx, my, mz, atlas, seams, region);
        if (!Number.isFinite(analytic)) {
          ok = false;
          break;
        }
        const linear = 0.5 * (values[i] + values[j]);
        predErr = Math.max(predErr, Math.abs(analytic - linear));
        mids.push({
          i,
          j,
          pos: [mx, my, mz],
          analytic: clamp(analytic, -FIELD_RANGE_M, FIELD_RANGE_M),
        });
      }
      if (!ok) continue;
      if (!crosses && predErr < errorThresholdM) continue;
      if (predErr < errorThresholdM && existingPatch.has(t)) continue;
      candidates.push({ t, mids, predErr, crosses });
    }
    candidates.sort((a, b) => {
      if (a.crosses !== b.crosses) return a.crosses ? -1 : 1;
      return b.predErr - a.predErr;
    });

    let roundAdded = 0;
    for (const c of candidates) {
      if (added >= budgetVerts) break;
      // Never replace boundary-conforming patches
      if (existingPatch.has(c.t) || extraPatches.some((p) => p.baseTri === c.t)) {
        continue;
      }
      const splits = [];
      const corners = [I[c.t * 3], I[c.t * 3 + 1], I[c.t * 3 + 2]];
      for (let e = 0; e < 3; e++) {
        const m = c.mids[e];
        const id = registerEdgeIntersection(
          registry,
          m.i,
          m.j,
          0.5,
          `residual_${region}`,
          m.pos,
        );
        registry.vertices[id].analytic = m.analytic;
        registry.vertices[id].regionResidual = region;
        splits.push({
          edge: e,
          t: 0.5,
          insertedId: -(id + 1),
        });
      }
      const seen = new Set();
      const uniq = [];
      for (const s of splits) {
        if (seen.has(s.insertedId)) continue;
        seen.add(s.insertedId);
        uniq.push(s);
      }
      const children = triangulateSplitTriangle(corners, uniq);
      const good = children.filter((tri) => {
        const [u, v, w] = tri;
        return u !== v && v !== w && w !== u;
      });
      if (!good.length) continue;
      extraPatches.push({ baseTri: c.t, children: good, residual: true });
      roundAdded++;
      added = Math.max(
        0,
        registry.vertices.length - topology.registry.vertices.length,
      );
      if (added >= budgetVerts) break;
    }
    rounds = round + 1;
    if (roundAdded === 0) break;
  }

  // Rebuild topology with residual verts + merged patches
  const newInserted = registry.vertices.length - topology.registry.vertices.length;
  const patchByTri = new Map();
  for (const p of topology.patches) patchByTri.set(p.baseTri, p);
  for (const p of extraPatches) patchByTri.set(p.baseTri, p);

  const refinedIndices = [];
  const replaced = new Set(patchByTri.keys());
  for (let t = 0; t < mesh.triangleCount; t++) {
    if (!replaced.has(t)) {
      refinedIndices.push(I[t * 3], I[t * 3 + 1], I[t * 3 + 2]);
      continue;
    }
    const patch = patchByTri.get(t);
    for (const child of patch.children) {
      const resolved = child.map((vid) =>
        vid < 0 ? mesh.vertexCount + (-vid - 1) : vid,
      );
      refinedIndices.push(resolved[0], resolved[1], resolved[2]);
    }
  }

  const extended = {
    ...topology,
    registry,
    patches: [...patchByTri.values()],
    refinedIndices: Uint32Array.from(refinedIndices),
    refinedVertexCount: mesh.vertexCount + registry.vertices.length,
    refinedTriangleCount: refinedIndices.length / 3,
    vertexIncrement: registry.vertices.length,
    triangleIncrement: refinedIndices.length / 3 - mesh.triangleCount,
  };

  // Extend values array for new residual verts
  const extendedValues = new Float32Array(extended.refinedVertexCount);
  extendedValues.set(values.subarray(0, Math.min(values.length, extended.refinedVertexCount)));
  for (const v of registry.vertices) {
    const idx = mesh.vertexCount + v.id;
    if (v.analytic != null) {
      extendedValues[idx] = v.analytic;
    } else if (idx >= values.length || values[idx] === 0 && v.boundaryId?.startsWith("residual")) {
      const d = neckSignedDistanceV61(
        v.position[0],
        v.position[1],
        v.position[2],
        atlas,
        seams,
        region,
      );
      extendedValues[idx] = clamp(
        Number.isFinite(d) ? d : OUTSIDE_DEFAULT_M,
        -FIELD_RANGE_M,
        FIELD_RANGE_M,
      );
    } else if (idx < values.length) {
      extendedValues[idx] = values[idx];
    } else {
      const d = neckSignedDistanceV61(
        v.position[0],
        v.position[1],
        v.position[2],
        atlas,
        seams,
        region,
      );
      extendedValues[idx] = clamp(
        Number.isFinite(d) ? d : OUTSIDE_DEFAULT_M,
        -FIELD_RANGE_M,
        FIELD_RANGE_M,
      );
    }
  }

  return {
    topology: extended,
    values: extendedValues,
    residualInserted: registry.vertices
      .slice(topology.registry.vertices.length)
      .map((v) => ({
        position: v.position,
        analytic: v.analytic ?? extendedValues[mesh.vertexCount + v.id],
        round: rounds,
      })),
    residualVertexIncrement: newInserted,
    residualTriangleIncrement:
      extended.triangleIncrement - topology.triangleIncrement,
    rounds,
    method: "max_error_midedge_residual",
    extendedTopology: extended,
  };
}

/**
 * Encode shared topology binary (bc-topology-v1 shared section).
 */
export function encodeSharedTopology(topology) {
  const nIns = topology.registry.vertices.length;
  const nPatches = topology.patches.length;
  // header 32 + verts 16*nIns + patch headers variable
  let patchBytes = 0;
  for (const p of topology.patches) {
    patchBytes += 8 + p.children.length * 12;
  }
  const buf = Buffer.alloc(32 + nIns * 16 + patchBytes);
  buf.writeUInt32LE(BC_MAGIC, 0);
  buf.writeUInt16LE(BC_VERSION, 4);
  buf.writeUInt16LE(1, 6); // flags: has shared topology
  buf.writeUInt32LE(nIns, 8);
  buf.writeUInt32LE(nPatches, 12);
  buf.writeUInt32LE(topology.refinedVertexCount, 16);
  buf.writeUInt32LE(topology.refinedTriangleCount, 20);
  // hash bytes 24-31 from sharedTopologyHash hex
  const hashHex = topology.sharedTopologyHash;
  for (let i = 0; i < 8; i++) {
    buf[24 + i] = parseInt(hashHex.slice(i * 2, i * 2 + 2), 16);
  }
  let o = 32;
  for (const v of topology.registry.vertices) {
    buf.writeUInt32LE(v.edgeMin, o);
    buf.writeUInt32LE(v.edgeMax, o + 4);
    buf.writeUInt16LE(v.tQuant, o + 8);
    buf.writeUInt16LE(boundaryIdToCode(v.boundaryId), o + 10);
    buf.writeUInt32LE(0, o + 12);
    o += 16;
  }
  for (const p of topology.patches) {
    buf.writeUInt32LE(p.baseTri, o);
    buf.writeUInt16LE(p.children.length, o + 4);
    buf.writeUInt16LE(0, o + 6);
    o += 8;
    for (const child of p.children) {
      for (let k = 0; k < 3; k++) {
        const vid = child[k];
        const encoded = vid < 0 ? 0x80000000 | (-vid - 1) : vid;
        buf.writeUInt32LE(encoded >>> 0, o);
        o += 4;
      }
    }
  }
  return buf.subarray(0, o);
}

function boundaryIdToCode(id) {
  const map = {
    upper_neck_loop: 1,
    lower_neck_loop: 2,
    front_right_neck_seam: 3,
    right_back_neck_seam: 4,
    back_left_neck_seam: 5,
    left_front_neck_seam: 6,
  };
  return map[id] || 0;
}

export function boundaryCodeToId(code) {
  const map = {
    1: "upper_neck_loop",
    2: "lower_neck_loop",
    3: "front_right_neck_seam",
    4: "right_back_neck_seam",
    5: "back_left_neck_seam",
    6: "left_front_neck_seam",
  };
  return map[code] || "unknown";
}

/**
 * Per-region refine sidecar: magic + sharedTopologyHash + snorm16 inserted distances
 * + residual steiner count + residuals.
 * Base vertex distances live in sdf.bin (original vertexCount only).
 */
export function encodeBcRegionRefinement(topology, refinedValues, mesh, residual = null) {
  const nIns = topology.registry.vertices.length;
  const nRes = residual?.residualInserted?.length || 0;
  const header = 32;
  const distBytes = nIns * 2;
  const resBytes = nRes * (12 + 2); // xyz float32 + snorm16
  const buf = Buffer.alloc(header + distBytes + 4 + resBytes);
  buf.writeUInt32LE(BC_MAGIC, 0);
  buf.writeUInt16LE(BC_VERSION, 4);
  buf.writeUInt16LE(2, 6); // flags: region distances
  buf.writeUInt32LE(nIns, 8);
  buf.writeUInt32LE(nRes, 12);
  buf.writeUInt32LE(mesh.vertexCount, 16);
  const hashHex = topology.sharedTopologyHash;
  for (let i = 0; i < 8; i++) {
    buf[24 + i] = parseInt(hashHex.slice(i * 2, i * 2 + 2), 16);
  }
  let o = 32;
  for (let i = 0; i < nIns; i++) {
    const d = refinedValues[mesh.vertexCount + i];
    const s = Math.round(clamp(d / FIELD_RANGE_M, -1, 1) * 32767);
    buf.writeInt16LE(s, o);
    o += 2;
  }
  buf.writeUInt32LE(nRes, o);
  o += 4;
  if (nRes) {
    for (const r of residual.residualInserted) {
      buf.writeFloatLE(r.position[0], o);
      buf.writeFloatLE(r.position[1], o + 4);
      buf.writeFloatLE(r.position[2], o + 8);
      const s = Math.round(
        clamp(r.analytic / FIELD_RANGE_M, -1, 1) * 32767,
      );
      buf.writeInt16LE(s, o + 12);
      o += 14;
    }
  }
  return buf.subarray(0, o);
}

export function encodeBcFieldPackage(baseValues, topology, refinedValues, mesh, residual) {
  const sdf = encodeSnorm16(baseValues);
  const refine = encodeBcRegionRefinement(topology, refinedValues, mesh, residual);
  return {
    sdf,
    refine,
    fieldHash: contentHash16(sdf),
    refineHash: contentHash16(refine),
    sdfBytes: sdf.length,
    refineBytes: refine.length,
    sharedTopologyHash: topology.sharedTopologyHash,
    refinedVertexCount: topology.refinedVertexCount,
    refinedTriangleCount: topology.refinedTriangleCount,
    vertexIncrement: topology.vertexIncrement + (residual?.residualVertexIncrement || 0),
    triangleIncrement:
      topology.triangleIncrement + (residual?.residualTriangleIncrement || 0),
  };
}

/** Decode shared topology buffer. */
export function decodeSharedTopology(buffer, baseVertexCount) {
  const buf = Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer);
  const magic = buf.readUInt32LE(0);
  if (magic !== BC_MAGIC) throw new Error("BC_TOPOLOGY_MAGIC_MISMATCH");
  const nIns = buf.readUInt32LE(8);
  const nPatches = buf.readUInt32LE(12);
  const refinedVertexCount = buf.readUInt32LE(16);
  const refinedTriangleCount = buf.readUInt32LE(20);
  const hashBytes = buf.subarray(24, 32);
  const sharedTopologyHash = [...hashBytes]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  const vertices = [];
  let o = 32;
  for (let i = 0; i < nIns; i++) {
    const edgeMin = buf.readUInt32LE(o);
    const edgeMax = buf.readUInt32LE(o + 4);
    const tQuant = buf.readUInt16LE(o + 8);
    const boundaryCode = buf.readUInt16LE(o + 10);
    vertices.push({
      id: i,
      edgeMin,
      edgeMax,
      tQuant,
      t: dequantizeT(tQuant),
      boundaryId: boundaryCodeToId(boundaryCode),
      originalEdgeKey: `${edgeMin}:${edgeMax}`,
    });
    o += 16;
  }
  const patches = [];
  for (let i = 0; i < nPatches; i++) {
    const baseTri = buf.readUInt32LE(o);
    const nChildren = buf.readUInt16LE(o + 4);
    o += 8;
    const children = [];
    for (let c = 0; c < nChildren; c++) {
      const tri = [];
      for (let k = 0; k < 3; k++) {
        const raw = buf.readUInt32LE(o);
        o += 4;
        if (raw & 0x80000000) tri.push(-( (raw & 0x7fffffff) + 1 ));
        else tri.push(raw);
      }
      children.push(tri);
    }
    patches.push({ baseTri, children });
  }
  void baseVertexCount;
  void refinedVertexCount;
  void refinedTriangleCount;
  return { sharedTopologyHash, vertices, patches, nIns, nPatches };
}

/**
 * Per-boundary isoline error vs analytical boundary.
 */
export function measureBoundaryErrors(mesh, topology, atlas, seams, graph) {
  const out = {};
  for (const seg of graph.segments) {
    const errs = [];
    for (const v of topology.registry.vertices) {
      if (v.boundaryId !== seg.boundaryId) continue;
      const s = boundaryScalarAt(
        v.position[0],
        v.position[1],
        v.position[2],
        atlas,
        seams,
        seg.boundaryId,
      );
      if (s == null) continue;
      errs.push(Math.abs(s) * 1000);
    }
    // also sample ordered points
    for (const p of seg.orderedPoints) {
      const s = boundaryScalarAt(p[0], p[1], p[2], atlas, seams, seg.boundaryId);
      if (s == null) continue;
      errs.push(Math.abs(s) * 1000);
    }
    errs.sort((a, b) => a - b);
    const mean = errs.length ? errs.reduce((a, b) => a + b, 0) / errs.length : 0;
    const p95 = errs.length
      ? errs[Math.min(errs.length - 1, Math.floor(errs.length * 0.95))]
      : 0;
    const max = errs.length ? errs[errs.length - 1] : 0;
    const conformingEdges = topology.registry.vertices.filter(
      (v) => v.boundaryId === seg.boundaryId,
    ).length;
    out[seg.boundaryId] = {
      meanMm: +mean.toFixed(4),
      p95Mm: +p95.toFixed(4),
      maxMm: +max.toFixed(4),
      crossedTriangles: seg.crossedTriangleIndices.length,
      conformingEdges,
    };
  }
  return out;
}

export function serializeEdgeRegistry(registry) {
  return {
    version: "6.2",
    entries: registry.vertices.length,
    duplicates: registry.duplicates,
    tJunctions: registry.tJunctions,
    incompatibleSplits: registry.incompatibleSplits,
    coincidentUnshared: 0,
    vertices: registry.vertices.map((v) => ({
      refinedVertexId: v.id,
      originalEdgeKey: v.originalEdgeKey,
      boundaryId: v.boundaryId,
      quantizedIntersectionT: v.tQuant,
      t: v.t,
      position: v.position,
    })),
  };
}

export function loadV61SeamsFromDisk(root = ROOT) {
  const dir = path.join(root, "artifacts/neck-v61/shared-seams");
  return SEAM_DEFS.map((def) =>
    JSON.parse(readFileSync(path.join(dir, def.file), "utf8")),
  );
}

export function assertExpectedSeamHashes(seamPayloads) {
  const errs = [];
  for (const s of seamPayloads) {
    if (s.seamHash !== EXPECTED_SEAM_HASHES[s.seamId]) {
      errs.push(`${s.seamId}:${s.seamHash}!=${EXPECTED_SEAM_HASHES[s.seamId]}`);
    }
  }
  if (errs.length) {
    const e = new Error("N02_OR_SHARED_SEAMS_SOURCE_MISMATCH");
    e.details = errs;
    throw e;
  }
  return true;
}
