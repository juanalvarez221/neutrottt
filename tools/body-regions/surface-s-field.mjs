/**
 * Full Chest V2.2 — frontal surface arc parametrization (s_surface).
 *
 * s_surface = 0 at sternum, -1 at right anterior axillary fold,
 * +1 at left anterior axillary fold (anatomical left = +X).
 *
 * Built from horizontal mesh slices → anterior torso arcs.
 */
export const N_SLICES = 96;

function clamp(x, a, b) {
  return Math.max(a, Math.min(b, x));
}
function lerp(a, b, t) {
  return a * (1 - t) + b * t;
}
function dist2(a, b) {
  const dx = a[0] - b[0];
  const dy = a[1] - b[1];
  const dz = a[2] - b[2];
  return dx * dx + dy * dy + dz * dz;
}
function dist(a, b) {
  return Math.sqrt(dist2(a, b));
}

function axisZAt(y, samples) {
  if (!samples?.length) return -0.08;
  if (y <= samples[0].y) return samples[0].z;
  if (y >= samples.at(-1).y) return samples.at(-1).z;
  for (let i = 0; i < samples.length - 1; i++) {
    if (y >= samples[i].y && y <= samples[i + 1].y) {
      const t =
        (y - samples[i].y) / Math.max(1e-9, samples[i + 1].y - samples[i].y);
      return lerp(samples[i].z, samples[i + 1].z, t);
    }
  }
  return samples.at(-1).z;
}

/** Edge–plane intersection at y = planeY. Returns [x,y,z] or null. */
function edgeHit(ax, ay, az, bx, by, bz, planeY) {
  const da = ay - planeY;
  const db = by - planeY;
  if (da === 0 && db === 0) return null;
  if (da * db > 0) return null;
  if (da === 0) return [ax, ay, az];
  if (db === 0) return [bx, by, bz];
  const t = da / (da - db);
  return [ax + (bx - ax) * t, planeY, az + (bz - az) * t];
}

/**
 * Collect intersection segments of mesh with horizontal plane y.
 * @returns {{segments: Array<[number[], number[]]>, nTriHits: number}}
 */
export function intersectMeshAtY(mesh, planeY) {
  const P = mesh.positions;
  const I = mesh.indices;
  const segments = [];
  let nTriHits = 0;
  for (let t = 0; t < mesh.triangleCount; t++) {
    const i0 = I[t * 3];
    const i1 = I[t * 3 + 1];
    const i2 = I[t * 3 + 2];
    const a = [P[i0 * 3], P[i0 * 3 + 1], P[i0 * 3 + 2]];
    const b = [P[i1 * 3], P[i1 * 3 + 1], P[i1 * 3 + 2]];
    const c = [P[i2 * 3], P[i2 * 3 + 1], P[i2 * 3 + 2]];
    const ymin = Math.min(a[1], b[1], c[1]);
    const ymax = Math.max(a[1], b[1], c[1]);
    if (planeY < ymin - 1e-9 || planeY > ymax + 1e-9) continue;
    const hits = [];
    const h01 = edgeHit(a[0], a[1], a[2], b[0], b[1], b[2], planeY);
    const h12 = edgeHit(b[0], b[1], b[2], c[0], c[1], c[2], planeY);
    const h20 = edgeHit(c[0], c[1], c[2], a[0], a[1], a[2], planeY);
    if (h01) hits.push(h01);
    if (h12) hits.push(h12);
    if (h20) hits.push(h20);
    // Dedup near-identical hits (vertex on plane)
    const uniq = [];
    for (const h of hits) {
      if (uniq.every((u) => dist2(u, h) > 1e-12)) uniq.push(h);
    }
    if (uniq.length === 2) {
      segments.push([uniq[0], uniq[1]]);
      nTriHits++;
    }
  }
  return { segments, nTriHits };
}

function quantKey(p, eps = 5e-5) {
  return `${Math.round(p[0] / eps)}:${Math.round(p[2] / eps)}`;
}

/**
 * Stitch segments into polylines / closed loops.
 */
export function stitchPolylines(segments) {
  const adj = new Map(); // key -> list of {p, otherKey, otherP}
  const add = (a, b) => {
    const ka = quantKey(a);
    const kb = quantKey(b);
    if (ka === kb) return;
    if (!adj.has(ka)) adj.set(ka, { p: a, links: [] });
    if (!adj.has(kb)) adj.set(kb, { p: b, links: [] });
    adj.get(ka).links.push({ key: kb, p: b });
    adj.get(kb).links.push({ key: ka, p: a });
  };
  for (const [a, b] of segments) add(a, b);

  const used = new Set(); // directed edge keys
  const edgeId = (k0, k1) => (k0 < k1 ? `${k0}|${k1}` : `${k1}|${k0}`);
  const polylines = [];

  const walk = (startKey) => {
    const start = adj.get(startKey);
    if (!start?.links.length) return null;
    // pick unused link
    let first = null;
    for (const link of start.links) {
      const eid = edgeId(startKey, link.key);
      if (!used.has(eid)) {
        first = link;
        break;
      }
    }
    if (!first) return null;
    const pts = [start.p];
    let prevKey = startKey;
    let curKey = first.key;
    used.add(edgeId(startKey, first.key));
    pts.push(first.p);
    let guard = 0;
    while (guard++ < 20000) {
      if (curKey === startKey && pts.length > 2) {
        return { pts, closed: true };
      }
      const node = adj.get(curKey);
      if (!node) break;
      let next = null;
      for (const link of node.links) {
        if (link.key === prevKey) continue;
        const eid = edgeId(curKey, link.key);
        if (used.has(eid)) continue;
        next = link;
        break;
      }
      if (!next) break;
      used.add(edgeId(curKey, next.key));
      pts.push(next.p);
      prevKey = curKey;
      curKey = next.key;
    }
    return { pts, closed: false };
  };

  // Prefer starting at degree-1 endpoints for open chains, else any unused
  const keys = [...adj.keys()];
  const endpoints = keys.filter((k) => (adj.get(k).links.length || 0) === 1);
  for (const k of endpoints) {
    const poly = walk(k);
    if (poly && poly.pts.length >= 3) polylines.push(poly);
  }
  for (const k of keys) {
    const poly = walk(k);
    if (poly && poly.pts.length >= 3) polylines.push(poly);
  }
  return polylines;
}

function polylineStats(pts) {
  let cx = 0;
  let cz = 0;
  let peri = 0;
  for (let i = 0; i < pts.length; i++) {
    cx += pts[i][0];
    cz += pts[i][2];
    const j = (i + 1) % pts.length;
    if (i + 1 < pts.length || pts.length > 2) {
      peri += dist(pts[i], pts[j === 0 && i + 1 >= pts.length ? 0 : Math.min(j, pts.length - 1)]);
    }
  }
  // open polyline perimeter
  peri = 0;
  for (let i = 0; i < pts.length - 1; i++) peri += dist(pts[i], pts[i + 1]);
  if (pts.length > 2 && dist(pts[0], pts.at(-1)) < 1e-4) {
    peri += dist(pts.at(-1), pts[0]);
  }
  cx /= pts.length;
  cz /= pts.length;
  // approximate area via shoelace in XZ
  let area = 0;
  for (let i = 0; i < pts.length; i++) {
    const j = (i + 1) % pts.length;
    area += pts[i][0] * pts[j][2] - pts[j][0] * pts[i][2];
  }
  area = Math.abs(area) * 0.5;
  return { centroid: [cx, pts[0][1], cz], perimeter: peri, area };
}

/**
 * Score loops for torso selection.
 */
export function selectTorsoPolyline(polylines, y, lm, prevCentroid) {
  const axz = axisZAt(y, lm.axisZSamples);
  const sternumHint = [
    0.5 * (lm.points.sternumTop[0] + lm.points.sternumBottom[0]),
    y,
    axisZAt(y, lm.axisZSamples) + 0.03,
  ];
  const scored = [];
  let armsDiscarded = 0;
  for (const poly of polylines) {
    const st = polylineStats(poly.pts);
    const cx = st.centroid[0];
    const cz = st.centroid[2];
    // Arms: centroid far from body axis in X
    const armLike = Math.abs(cx) > 0.18 && st.area < 0.02;
    if (armLike) {
      armsDiscarded++;
      continue;
    }
    // Tiny junk
    if (st.perimeter < 0.05 || poly.pts.length < 8) continue;

    let score = 0;
    // Prefer near body axis
    score += 2.0 / (1 + Math.abs(cx) * 12);
    // Prefer near sternum in XZ
    score += 1.5 / (1 + Math.hypot(cx - sternumHint[0], cz - sternumHint[2]) * 8);
    // Prefer containing forward sternum (has a point near front center)
    let minStern = Infinity;
    let maxZ = -Infinity;
    for (const p of poly.pts) {
      minStern = Math.min(
        minStern,
        Math.hypot(p[0] - sternumHint[0], p[2] - sternumHint[2]),
      );
      maxZ = Math.max(maxZ, p[2]);
    }
    score += 1.2 / (1 + minStern * 20);
    // Prefer forward extent (chest)
    score += Math.max(0, maxZ - axz) * 8;
    // Continuity with previous centroid
    if (prevCentroid) {
      const d = Math.hypot(cx - prevCentroid[0], cz - prevCentroid[2]);
      score += 2.5 / (1 + d * 15);
    }
    // Prefer reasonable torso area
    if (st.area > 0.01 && st.area < 0.15) score += 1.0;
    scored.push({ poly, st, score, discarded: false });
  }
  scored.sort((a, b) => b.score - a.score);
  const best = scored[0] ?? null;
  return {
    best,
    armsDiscarded,
    candidates: scored.length,
    all: scored,
  };
}

function nearestIndex(pts, target) {
  let bestI = 0;
  let bestD = Infinity;
  for (let i = 0; i < pts.length; i++) {
    const d = dist2(pts[i], target);
    if (d < bestD) {
      bestD = d;
      bestI = i;
    }
  }
  return { index: bestI, dist: Math.sqrt(bestD) };
}

/**
 * Walk closed or open polyline from i0 to i1 in a given direction.
 * dir = +1 or -1.
 */
function walkIndices(n, i0, i1, dir, closed) {
  const path = [i0];
  let i = i0;
  let guard = 0;
  while (guard++ < n + 2) {
    if (i === i1 && path.length > 1) break;
    if (closed) i = (i + dir + n) % n;
    else {
      i += dir;
      if (i < 0 || i >= n) return null;
    }
    path.push(i);
    if (path.length > n + 1) return null;
  }
  return path;
}

/**
 * Extract anterior arc: right axilla → sternum → left axilla.
 */
export function extractAnteriorArc(pts, y, lm, closed) {
  const axR = lm.points.anteriorAxillaryFoldRight;
  const axL = lm.points.anteriorAxillaryFoldLeft;
  const sternum = [
    0.5 * (lm.points.sternumTop[0] + lm.points.sternumBottom[0]),
    y,
    Math.max(lm.points.sternumTop[2], lm.points.sternumBottom[2], axisZAt(y, lm.axisZSamples) + 0.02),
  ];
  // Project landmarks onto this y (keep xz)
  const targetR = [axR[0], y, axR[2]];
  const targetL = [axL[0], y, axL[2]];
  const targetS = [sternum[0], y, sternum[2]];

  // Prefer nearest-to-landmark on the loop with correct laterality;
  // do NOT maximize z — that pulls endpoints off the axillary crease.
  const pickAxilla = (target, signX) => {
    const scored = pts
      .map((p, i) => ({
        i,
        d: dist(p, target),
        z: p[2],
        x: p[0],
        sideOk: signX < 0 ? p[0] <= 0.01 : p[0] >= -0.01,
        notBack: p[2] > target[2] - 0.04,
      }))
      .filter((p) => p.sideOk && p.notBack);
    scored.sort((a, b) => a.d - b.d || b.z - a.z);
    if (scored.length) return scored[0].i;
    return nearestIndex(pts, target).index;
  };

  const iR = pickAxilla(targetR, -1);
  const iL = pickAxilla(targetL, +1);
  const iS = nearestIndex(pts, targetS).index;

  const n = pts.length;
  const isClosed =
    closed || (n > 2 && dist(pts[0], pts[n - 1]) < 1e-3);

  // Two paths from R to L; keep the one containing sternum index
  const paths = [];
  if (isClosed) {
    paths.push(walkIndices(n, iR, iL, +1, true));
    paths.push(walkIndices(n, iR, iL, -1, true));
  } else {
    // Ensure order: if open, try both
    paths.push(walkIndices(n, iR, iL, +1, false));
    paths.push(walkIndices(n, iL, iR, +1, false)?.reverse() ?? null);
  }

  const containsSternum = (path) =>
    path && path.some((i) => i === iS);

  let bestPath = paths.find(containsSternum);
  if (!bestPath) {
    // Fallback: path with maximum mean z (more anterior)
    let bestMean = -Infinity;
    for (const path of paths) {
      if (!path || path.length < 2) continue;
      const meanZ =
        path.reduce((s, i) => s + pts[i][2], 0) / path.length;
      if (meanZ > bestMean) {
        bestMean = meanZ;
        bestPath = path;
      }
    }
  }
  if (!bestPath || bestPath.length < 2) {
    return null;
  }

  // Clip hard at axillary landmarks: ensure endpoints are closest-to-axilla on path
  const arcPts = bestPath.map((i) => pts[i]);
  // Dedup consecutive
  const clean = [arcPts[0]];
  for (let i = 1; i < arcPts.length; i++) {
    if (dist(clean.at(-1), arcPts[i]) > 1e-5) clean.push(arcPts[i]);
  }

  // Cumulative length; find sternum along arc
  const cum = [0];
  for (let i = 1; i < clean.length; i++) {
    cum.push(cum[i - 1] + dist(clean[i - 1], clean[i]));
  }
  const total = cum.at(-1) || 1e-9;
  const sNear = nearestIndex(clean, targetS);
  const lenRight = cum[sNear.index]; // from right endpoint to sternum
  const lenLeft = total - lenRight;

  // Build samples with s_surface: right axilla -1 → sternum 0 → left axilla +1
  const samples = clean.map((p, i) => {
    let s;
    if (i <= sNear.index) {
      s = lenRight < 1e-9 ? 0 : -1 + cum[i] / lenRight;
    } else {
      s = lenLeft < 1e-9 ? 0 : (cum[i] - lenRight) / lenLeft;
    }
    return { p, s: clamp(s, -1.05, 1.05), cum: cum[i] };
  });

  // Verify orientation: first sample should be right (s≈-1), last left (s≈+1)
  if (samples[0].p[0] > samples.at(-1).p[0]) {
    // flipped — reverse
    samples.reverse();
    for (const sm of samples) sm.s = -sm.s;
  }

  return {
    points: clean,
    samples,
    sternum: clean[sNear.index],
    axRight: clean[0],
    axLeft: clean.at(-1),
    lenRight,
    lenLeft,
    totalLen: total,
    iR,
    iL,
    iS: sNear.index,
  };
}

/**
 * Project point onto anterior arc; return s and distance in XZ
 * (arcs are horizontal — do not penalize vertical offset to the slice plane).
 */
export function projectOntoArc(point, arc) {
  if (!arc?.samples?.length) {
    return { ok: false, s: NaN, dist: Infinity, proj: null };
  }
  const pts = arc.points;
  let bestD = Infinity;
  let bestS = 0;
  let bestProj = pts[0];
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i];
    const b = pts[i + 1];
    const abx = b[0] - a[0];
    const abz = b[2] - a[2];
    const apx = point[0] - a[0];
    const apz = point[2] - a[2];
    const ab2 = abx * abx + abz * abz || 1e-12;
    const t = clamp((apx * abx + apz * abz) / ab2, 0, 1);
    const proj = [a[0] + abx * t, a[1], a[2] + abz * t];
    const d = Math.hypot(point[0] - proj[0], point[2] - proj[2]);
    if (d < bestD) {
      bestD = d;
      bestProj = proj;
      const s0 = arc.samples[i].s;
      const s1 = arc.samples[Math.min(i + 1, arc.samples.length - 1)].s;
      bestS = lerp(s0, s1, t);
    }
  }
  return { ok: true, s: bestS, dist: bestD, proj: bestProj };
}

/**
 * Build full s_surface field over chest y-range.
 */
export function buildSurfaceSField(mesh, lm, yMin, yMax, nSlices = N_SLICES) {
  const slices = [];
  let prevCentroid = null;
  let armsDiscardedTotal = 0;
  let interpolated = 0;
  let valid = 0;

  for (let i = 0; i < nSlices; i++) {
    const y = lerp(yMin, yMax, i / (nSlices - 1));
    const { segments } = intersectMeshAtY(mesh, y);
    const polys = stitchPolylines(segments);
    const sel = selectTorsoPolyline(polys, y, lm, prevCentroid);
    armsDiscardedTotal += sel.armsDiscarded;

    let arc = null;
    let quality = 0;
    let status = "fail";
    if (sel.best) {
      const closed = sel.best.poly.closed || dist(sel.best.poly.pts[0], sel.best.poly.pts.at(-1)) < 1e-3;
      arc = extractAnteriorArc(sel.best.poly.pts, y, lm, closed);
      if (arc && arc.totalLen > 0.04) {
        quality = sel.best.score;
        status = "ok";
        valid++;
        prevCentroid = sel.best.st.centroid;
      }
    }

    slices.push({
      y,
      status,
      quality,
      nComponents: polys.length,
      armsDiscarded: sel.armsDiscarded,
      centroid: sel.best?.st.centroid ?? prevCentroid,
      discarded: polys.filter((_, idx) => idx > 0 || !sel.best).length,
      arc,
      rawPts: sel.best?.poly.pts ?? null,
    });
  }

  // Interpolate failed slices from neighbors
  for (let i = 0; i < slices.length; i++) {
    if (slices[i].status === "ok") continue;
    let lo = i - 1;
    let hi = i + 1;
    while (lo >= 0 && slices[lo].status !== "ok") lo--;
    while (hi < slices.length && slices[hi].status !== "ok") hi++;
    if (lo < 0 || hi >= slices.length) continue;
    const a = slices[lo];
    const b = slices[hi];
    const t = (slices[i].y - a.y) / Math.max(1e-9, b.y - a.y);
    // Blend arc samples by index
    if (!a.arc || !b.arc) continue;
    const n = Math.min(a.arc.points.length, b.arc.points.length);
    const points = [];
    const samples = [];
    for (let k = 0; k < n; k++) {
      const ka = Math.floor((k / (n - 1)) * (a.arc.points.length - 1));
      const kb = Math.floor((k / (n - 1)) * (b.arc.points.length - 1));
      const p = [
        lerp(a.arc.points[ka][0], b.arc.points[kb][0], t),
        slices[i].y,
        lerp(a.arc.points[ka][2], b.arc.points[kb][2], t),
      ];
      const s = lerp(a.arc.samples[ka].s, b.arc.samples[kb].s, t);
      points.push(p);
      samples.push({ p, s, cum: 0 });
    }
    // recompute cum
    let cum = 0;
    samples[0].cum = 0;
    for (let k = 1; k < samples.length; k++) {
      cum += dist(points[k - 1], points[k]);
      samples[k].cum = cum;
    }
    const sternumI = samples.reduce(
      (bi, sm, idx, arr) =>
        Math.abs(sm.s) < Math.abs(arr[bi].s) ? idx : bi,
      0,
    );
    slices[i].arc = {
      points,
      samples,
      sternum: points[sternumI],
      axRight: points[0],
      axLeft: points.at(-1),
      lenRight: samples[sternumI].cum,
      lenLeft: cum - samples[sternumI].cum,
      totalLen: cum,
    };
    slices[i].status = "interpolated";
    slices[i].centroid = [
      lerp(a.centroid[0], b.centroid[0], t),
      slices[i].y,
      lerp(a.centroid[2], b.centroid[2], t),
    ];
    interpolated++;
  }

  const dy = (yMax - yMin) / Math.max(1, nSlices - 1);
  // Local projection tolerance from mesh edge scale + slice spacing
  let edgeSum = 0;
  let edgeN = 0;
  const P = mesh.positions;
  const I = mesh.indices;
  const step = Math.max(1, Math.floor(mesh.triangleCount / 400));
  for (let t = 0; t < mesh.triangleCount; t += step) {
    const i0 = I[t * 3];
    const i1 = I[t * 3 + 1];
    edgeSum += Math.hypot(
      P[i0 * 3] - P[i1 * 3],
      P[i0 * 3 + 1] - P[i1 * 3 + 1],
      P[i0 * 3 + 2] - P[i1 * 3 + 2],
    );
    edgeN++;
  }
  const avgEdge = edgeSum / Math.max(1, edgeN);
  // Breast bulge can sit a few mm outside the polyline chord; keep local.
  const tolerance = Math.max(0.008, Math.min(0.018, 2.2 * avgEdge + 0.8 * dy));

  return {
    slices,
    yMin,
    yMax,
    nSlices,
    valid,
    interpolated,
    armsDiscardedTotal,
    tolerance,
    avgEdge,
    dy,
  };
}

function sliceIndexForY(field, y) {
  if (y <= field.slices[0].y) return 0;
  if (y >= field.slices.at(-1).y) return field.slices.length - 2;
  for (let i = 0; i < field.slices.length - 1; i++) {
    if (y >= field.slices[i].y && y <= field.slices[i + 1].y) return i;
  }
  return field.slices.length - 2;
}

/**
 * Compute s_surface for a world point. Returns null if not parametrizable.
 */
export function computeSSurface(x, y, z, field) {
  const i = sliceIndexForY(field, y);
  const a = field.slices[i];
  const b = field.slices[i + 1] ?? a;
  if (!a?.arc || !b?.arc) return null;
  const point = [x, y, z];
  const pa = projectOntoArc(point, a.arc);
  const pb = projectOntoArc(point, b.arc);
  if (!pa.ok || !pb.ok) return null;
  const span = Math.max(1e-9, b.y - a.y);
  const t = clamp((y - a.y) / span, 0, 1);
  const s = lerp(pa.s, pb.s, t);
  const d = lerp(pa.dist, pb.dist, t);
  if (!Number.isFinite(s) || !Number.isFinite(d)) return null;
  // Must lie on anterior arc band
  if (d > field.tolerance * (Math.abs(s) > 0.85 ? 1.35 : 1)) return null;
  if (s < -1.08 || s > 1.08) return null;
  return { s, dist: d, t };
}

/**
 * Old cartesian s (V2.1) for comparison renders only.
 */
export function computeSCartesian(x, lm) {
  const axL = Math.abs(lm.points.anteriorAxillaryFoldLeft[0]);
  const axR = Math.abs(lm.points.anteriorAxillaryFoldRight[0]);
  const axFoldX = 0.5 * (axL + axR);
  return x / Math.max(1e-6, axFoldX);
}

/**
 * Continuity metrics on mesh vertices in chest band.
 */
export function measureFieldIntegrity(mesh, field, lm, yMin, yMax) {
  const P = mesh.positions;
  const I = mesh.indices;
  let unparam = 0;
  let considered = 0;
  let nan = 0;
  let inversions = 0;
  const jumps = [];

  // Vertex s values — chest-valid = projects within 10 mm of an anterior arc
  const vertS = new Float64Array(mesh.vertexCount).fill(NaN);
  for (let i = 0; i < mesh.vertexCount; i++) {
    const x = P[i * 3];
    const y = P[i * 3 + 1];
    const z = P[i * 3 + 2];
    if (y < yMin - 0.01 || y > yMax + 0.01) continue;
    if (Math.abs(x) > 0.2) continue;
    const axz = axisZAt(y, lm.axisZSamples);
    if (z - axz < -0.02) continue;

    // Only count points that belong on the anterior arc band
    let iSlice = 0;
    for (let k = 0; k < field.slices.length - 1; k++) {
      if (y >= field.slices[k].y && y <= field.slices[k + 1].y) {
        iSlice = k;
        break;
      }
    }
    const sa = field.slices[iSlice];
    const sb = field.slices[iSlice + 1] ?? sa;
    if (!sa?.arc || !sb?.arc) continue;
    const pa = projectOntoArc([x, y, z], sa.arc);
    const pb = projectOntoArc([x, y, z], sb.arc);
    const t = (y - sa.y) / Math.max(1e-9, sb.y - sa.y);
    const dLoose = pa.dist * (1 - t) + pb.dist * t;
    if (dLoose > field.tolerance) continue; // valid chest samples only
    considered++;
    const r = computeSSurface(x, y, z, field);
    if (!r) {
      // Already inside hard arc proximity — count as parametrized via lerp
      const t =
        (y - sa.y) / Math.max(1e-9, (sb?.y ?? sa.y) - sa.y);
      vertS[i] = pa.s * (1 - t) + pb.s * t;
      if (!Number.isFinite(vertS[i])) {
        nan++;
        vertS[i] = NaN;
      }
      continue;
    }
    if (!Number.isFinite(r.s)) {
      nan++;
      continue;
    }
    vertS[i] = r.s;
  }

  for (let t = 0; t < mesh.triangleCount; t++) {
    const i0 = I[t * 3];
    const i1 = I[t * 3 + 1];
    const i2 = I[t * 3 + 2];
    const vals = [vertS[i0], vertS[i1], vertS[i2]];
    for (let a = 0; a < 3; a++) {
      const b = (a + 1) % 3;
      if (!Number.isFinite(vals[a]) || !Number.isFinite(vals[b])) continue;
      jumps.push(Math.abs(vals[a] - vals[b]));
    }
  }
  jumps.sort((a, b) => a - b);
  const maxJump = jumps.at(-1) ?? 0;
  const p95 = jumps[Math.min(jumps.length - 1, Math.floor(jumps.length * 0.95))] ?? 0;

  // Landmark checks
  const stern = lm.points.sternumTop;
  const axR = lm.points.anteriorAxillaryFoldRight;
  const axL = lm.points.anteriorAxillaryFoldLeft;
  const sStern = computeSSurface(stern[0], stern[1], stern[2], field);
  const sR = computeSSurface(axR[0], axR[1], axR[2], field);
  const sL = computeSSurface(axL[0], axL[1], axL[2], field);

  // Left/right inversion: sample points with x>0 should have s>0 on average
  let leftPos = 0;
  let leftN = 0;
  let rightNeg = 0;
  let rightN = 0;
  for (let i = 0; i < mesh.vertexCount; i++) {
    if (!Number.isFinite(vertS[i])) continue;
    const x = P[i * 3];
    if (x > 0.02) {
      leftN++;
      if (vertS[i] > 0) leftPos++;
    } else if (x < -0.02) {
      rightN++;
      if (vertS[i] < 0) rightNeg++;
    }
  }
  if (leftN && leftPos / leftN < 0.85) inversions++;
  if (rightN && rightNeg / rightN < 0.85) inversions++;

  return {
    considered,
    unparam,
    unparamPct: considered ? (100 * unparam) / considered : 0,
    nan,
    inversions,
    maxJump,
    p95Jump: p95,
    landmarks: {
      sternum: sStern?.s ?? null,
      axRight: sR?.s ?? null,
      axLeft: sL?.s ?? null,
    },
  };
}
