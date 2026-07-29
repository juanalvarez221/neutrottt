/** Cubic Bezier helpers and torso (theta,y) projection utilities. */

const DEG = 180 / Math.PI;

export function bezierCubic(p0, p1, p2, p3, t) {
  const u = 1 - t;
  const uu = u * u;
  const tt = t * t;
  return [
    uu * u * p0[0] + 3 * uu * t * p1[0] + 3 * u * tt * p2[0] + tt * t * p3[0],
    uu * u * p0[1] + 3 * uu * t * p1[1] + 3 * u * tt * p2[1] + tt * t * p3[1],
    uu * u * p0[2] + 3 * uu * t * p1[2] + 3 * u * tt * p2[2] + tt * t * p3[2],
  ];
}

export function sampleBezierChain(controlPoints, samplesPerSegment = 24) {
  if (controlPoints.length < 2) return controlPoints.slice();
  // Interpret as open polyline of cubic segments if length = 3k+1, else Catmull-like
  // uniform sampling through successive cubic windows of 4 points, or linear if sparse.
  const out = [];
  if (controlPoints.length === 2) {
    for (let i = 0; i <= samplesPerSegment; i++) {
      const t = i / samplesPerSegment;
      out.push([
        controlPoints[0][0] * (1 - t) + controlPoints[1][0] * t,
        controlPoints[0][1] * (1 - t) + controlPoints[1][1] * t,
        controlPoints[0][2] * (1 - t) + controlPoints[1][2] * t,
      ]);
    }
    return out;
  }

  // Chord-length polyline with smoothstep densify between consecutive points.
  for (let i = 0; i < controlPoints.length - 1; i++) {
    const a = controlPoints[i];
    const b = controlPoints[i + 1];
    const prev = controlPoints[Math.max(0, i - 1)];
    const next = controlPoints[Math.min(controlPoints.length - 1, i + 2)];
    // Hermite-ish cubic using neighbour tangents.
    const t1 = [
      (b[0] - prev[0]) / 2,
      (b[1] - prev[1]) / 2,
      (b[2] - prev[2]) / 2,
    ];
    const t2 = [
      (next[0] - a[0]) / 2,
      (next[1] - a[1]) / 2,
      (next[2] - a[2]) / 2,
    ];
    const c1 = [a[0] + t1[0] / 3, a[1] + t1[1] / 3, a[2] + t1[2] / 3];
    const c2 = [b[0] - t2[0] / 3, b[1] - t2[1] / 3, b[2] - t2[2] / 3];
    const n = i === controlPoints.length - 2 ? samplesPerSegment : samplesPerSegment;
    for (let s = 0; s < n; s++) {
      out.push(bezierCubic(a, c1, c2, b, s / n));
    }
  }
  out.push(controlPoints[controlPoints.length - 1]);
  return out;
}

export function makeAxisZLookup(samples) {
  const pts = [...samples].sort((a, b) => a.y - b.y);
  return (y) => {
    if (y <= pts[0].y) return pts[0].z;
    const last = pts[pts.length - 1];
    if (y >= last.y) return last.z;
    let i = 0;
    while (i < pts.length - 2 && y > pts[i + 1].y) i += 1;
    const a = pts[i];
    const b = pts[i + 1];
    const t = (y - a.y) / (b.y - a.y);
    return a.z + (b.z - a.z) * t;
  };
}

export function toThetaY(p, axisZ) {
  const z0 = typeof axisZ === "function" ? axisZ(p[1]) : axisZ;
  return {
    theta: Math.atan2(p[0], p[2] - z0) * DEG,
    y: p[1],
  };
}

export function mirrorX(p) {
  return [-p[0], p[1], p[2]];
}

/** Point-in-polygon for (theta, y). Polygon is list of {theta,y}. */
export function pointInPolyThetaY(theta, y, poly) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const yi = poly[i].y;
    const yj = poly[j].y;
    const ti = poly[i].theta;
    const tj = poly[j].theta;
    const intersect =
      yi > y !== yj > y &&
      theta < ((tj - ti) * (y - yi)) / (yj - yi + 1e-12) + ti;
    if (intersect) inside = !inside;
  }
  return inside;
}

export function projectPolylineToThetaY(points3, axisZ) {
  return points3.map((p) => toThetaY(p, axisZ));
}
