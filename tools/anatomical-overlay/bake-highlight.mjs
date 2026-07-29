/**
 * Bake high-res anatomical highlight overlay GLB from curated 3D boundaries.
 *
 * BodyVisual → midpoint subdivision → classify by curated curves → GLB meshes.
 */
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { loadMeshData, readJson, triangleCentroid } from "../body-mask/glb.mjs";
import {
  makeAxisZLookup,
  mirrorX,
  pointInPolyThetaY,
  projectPolylineToThetaY,
  sampleBezierChain,
  toThetaY,
} from "./curves.mjs";
import { subdivideLevels } from "./subdivide.mjs";
import { writeHighlightGlb } from "./write-glb.mjs";

const ROOT = path.resolve(import.meta.dirname, "..", "..");
const BODY = path.join(ROOT, "public/models/production/neutro_body_v1.glb");
const LANDMARKS = path.join(ROOT, "assets/body-regions/neutro_body_v1_landmarks.json");
const BOUNDARIES = path.join(
  ROOT,
  "assets/body-regions/neutro_body_v1_anatomical_boundaries.json",
);
const OUT_GLB = path.join(
  ROOT,
  "public/models/interaction/neutro_body_v1_anatomical_highlight.glb",
);
const OUT_REPORT = path.join(ROOT, "artifacts/anatomical-highlight-gate-1/bake-report.json");

const SUBDIV_LEVELS = Number(process.env.OVERLAY_SUBDIV ?? 2);
const DEG = 180 / Math.PI;

const TORSO_IDS = [
  "right_pectoral_region",
  "left_pectoral_region",
  "full_abdomen_region",
  "right_ribs_region",
  "left_ribs_region",
  "upper_back_region",
  "lower_back_region",
];

function hashFile(p) {
  return createHash("sha256").update(readFileSync(p)).digest("hex").slice(0, 16);
}

function curveYAtTheta(polyThetaY, theta) {
  const abs = Math.abs(theta);
  // poly may span negative and positive; use |theta| against mirrored right-side curve.
  const pts = polyThetaY
    .map((p) => ({ theta: Math.abs(p.theta), y: p.y }))
    .sort((a, b) => a.theta - b.theta);
  if (!pts.length) return 0;
  if (abs <= pts[0].theta) return pts[0].y;
  if (abs >= pts[pts.length - 1].theta) return pts[pts.length - 1].y;
  for (let i = 0; i < pts.length - 1; i++) {
    if (abs >= pts[i].theta && abs <= pts[i + 1].theta) {
      const t =
        (abs - pts[i].theta) / (pts[i + 1].theta - pts[i].theta + 1e-12);
      return pts[i].y + (pts[i + 1].y - pts[i].y) * t;
    }
  }
  return pts[pts.length - 1].y;
}

function curveThetaAtY(poly3, axisZ, yTarget, preferNegative) {
  const samples = sampleBezierChain(poly3, 32).map((p) => toThetaY(p, axisZ));
  let best = null;
  for (const s of samples) {
    if (preferNegative && s.theta > 0) continue;
    if (!preferNegative && s.theta < 0) continue;
    const err = Math.abs(s.y - yTarget);
    if (!best || err < best.err) best = { ...s, err };
  }
  return best?.theta ?? (preferNegative ? -90 : 90);
}

function buildClosedPoly(controlPoints, axisZ) {
  const samples = sampleBezierChain(controlPoints, 28);
  return projectPolylineToThetaY(samples, axisZ);
}

function makeLimbCharts(L) {
  const arm = (side) => {
    const sign = side === "left" ? 1 : -1;
    const a = L.points.shoulderRight.map((v, i) => (i === 0 ? sign * Math.abs(v) * (sign < 0 ? -1 : 1) : v));
    // Use mirrored right-side joints.
    const shoulder = [
      sign * Math.abs(L.points.shoulderRight[0]),
      L.points.shoulderRight[1],
      L.points.shoulderRight[2],
    ];
    const elbow = [
      sign * Math.abs(L.points.elbowRight[0]),
      L.points.elbowRight[1],
      L.points.elbowRight[2],
    ];
    const wrist = [
      sign * Math.abs(L.points.wristRight[0]),
      L.points.wristRight[1],
      L.points.wristRight[2],
    ];
    return { shoulder, elbow, wrist };
  };
  const leg = (side) => {
    const sign = side === "left" ? 1 : -1;
    return {
      hip: [
        sign * Math.abs(L.points.hipRight[0]),
        L.points.hipRight[1],
        L.points.hipRight[2],
      ],
      knee: [
        sign * Math.abs(L.points.kneeRight[0]),
        L.points.kneeRight[1],
        L.points.kneeRight[2],
      ],
      ankle: [
        sign * Math.abs(L.points.ankleRight[0]),
        L.points.ankleRight[1],
        L.points.ankleRight[2],
      ],
    };
  };
  return { arm, leg };
}

function projectToSegment(p, a, b) {
  const ab = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
  const len = Math.hypot(...ab) || 1;
  const dir = [ab[0] / len, ab[1] / len, ab[2] / len];
  const ap = [p[0] - a[0], p[1] - a[1], p[2] - a[2]];
  const t = Math.max(0, Math.min(len, ap[0] * dir[0] + ap[1] * dir[1] + ap[2] * dir[2]));
  const closest = [a[0] + dir[0] * t, a[1] + dir[1] * t, a[2] + dir[2] * t];
  const radial = [p[0] - closest[0], p[1] - closest[1], p[2] - closest[2]];
  const dist = Math.hypot(...radial);
  // Azimuth around bone: 0 = +Z anterior-ish
  const ref = [0, 0, 1];
  const refDot = ref[0] * dir[0] + ref[1] * dir[1] + ref[2] * dir[2];
  let r0 = [ref[0] - dir[0] * refDot, ref[1] - dir[1] * refDot, ref[2] - dir[2] * refDot];
  const r0n = Math.hypot(...r0) || 1;
  r0 = [r0[0] / r0n, r0[1] / r0n, r0[2] / r0n];
  const lat = [
    dir[1] * r0[2] - dir[2] * r0[1],
    dir[2] * r0[0] - dir[0] * r0[2],
    dir[0] * r0[1] - dir[1] * r0[0],
  ];
  const phi =
    Math.atan2(
      radial[0] * lat[0] + radial[1] * lat[1] + radial[2] * lat[2],
      radial[0] * r0[0] + radial[1] * r0[1] + radial[2] * r0[2],
    ) * DEG;
  return { t: t / len, dist, phi };
}

function classifyLimb(p, charts) {
  const side = p[0] >= 0 ? "left" : "right";
  const arm = charts.arm(side);
  const leg = charts.leg(side);

  const upper = projectToSegment(p, arm.shoulder, arm.elbow);
  const fore = projectToSegment(p, arm.elbow, arm.wrist);
  const thigh = projectToSegment(p, leg.hip, leg.knee);
  const shin = projectToSegment(p, leg.knee, leg.ankle);

  const armScore = Math.min(upper.dist, fore.dist);
  const legScore = Math.min(thigh.dist, shin.dist);

  // Hands / feet
  if (p[1] < 0.08) return `${side}_foot_surface`;
  if (fore.t > 0.95 && fore.dist < 0.09) return `${side}_hand_surface`;

  if (armScore < legScore && armScore < 0.11) {
    if (upper.dist <= fore.dist) {
      if (upper.t < 0.18) return `${side}_shoulder_surface`;
      if (upper.t > 0.88) return `${side}_elbow_transition`;
      return Math.abs(upper.phi) < 95
        ? `${side}_biceps_surface`
        : `${side}_triceps_surface`;
    }
    if (fore.t < 0.12) return `${side}_elbow_transition`;
    if (fore.t > 0.88) return `${side}_wrist_transition`;
    return Math.abs(fore.phi) < 95
      ? `${side}_forearm_inner_surface`
      : `${side}_forearm_outer_surface`;
  }

  if (legScore < 0.14) {
    if (thigh.dist <= shin.dist) {
      if (thigh.t > 0.9) return `${side}_knee_transition`;
      const phi = side === "left" ? thigh.phi : -thigh.phi;
      if (phi >= -45 && phi <= 45) return `${side}_thigh_front_surface`;
      if (phi > 45 && phi <= 135) return `${side}_thigh_outer_surface`;
      if (phi < -45 && phi >= -135) return `${side}_thigh_inner_surface`;
      return `${side}_thigh_back_surface`;
    }
    if (shin.t < 0.1) return `${side}_knee_transition`;
    if (shin.t > 0.9) return `${side}_ankle_transition`;
    return Math.abs(shin.phi) < 95
      ? `${side}_shin_surface`
      : `${side}_calf_surface`;
  }

  return null;
}

function classifyHeadNeck(p, axisZ, L) {
  const { theta, y } = toThetaY(p, axisZ);
  const abs = Math.abs(theta);
  if (y >= 1.66) return "head_top_surface";
  if (y >= L.levels.neckBase + 0.05) {
    if (abs > 125) return "head_back_surface";
    if (abs < 55) return null; // face
    return theta >= 0 ? "head_left_surface" : "head_right_surface";
  }
  if (y >= L.levels.neckBase - 0.02) {
    if (abs < 55) return "neck_front_surface";
    if (abs > 125) return "neck_back_surface";
    return theta >= 0 ? "neck_left_surface" : "neck_right_surface";
  }
  return null;
}

function main() {
  const landmarks = readJson(LANDMARKS);
  const boundaries = readJson(BOUNDARIES);
  const sourceHash = hashFile(BODY);
  const base = loadMeshData(BODY);
  console.log(
    `BodyVisual tris=${base.triangleCount} → subdiv x${SUBDIV_LEVELS}...`,
  );
  const mesh = subdivideLevels(base, SUBDIV_LEVELS);
  console.log(`overlay tris=${mesh.triangleCount} verts=${mesh.vertexCount}`);

  const axisZ = makeAxisZLookup(landmarks.axisZSamples);
  const rightPecPoly = buildClosedPoly(
    boundaries.boundaries.right_pectoral_closed.controlPoints,
    axisZ,
  );
  const leftPecPoly = rightPecPoly.map((p) => ({ theta: -p.theta, y: p.y }));

  const abdomenTop = projectPolylineToThetaY(
    sampleBezierChain(boundaries.boundaries.abdomen_top_shared.controlPoints, 24),
    axisZ,
  );
  const abdomenBottom = projectPolylineToThetaY(
    sampleBezierChain(boundaries.boundaries.abdomen_bottom.controlPoints, 16),
    axisZ,
  );
  const ribsFrontR = sampleBezierChain(
    boundaries.boundaries.right_ribs_front.controlPoints,
    20,
  );
  const ribsBackR = sampleBezierChain(
    boundaries.boundaries.right_ribs_back.controlPoints,
    20,
  );
  const upperBackBottom = projectPolylineToThetaY(
    sampleBezierChain(boundaries.boundaries.upper_back_bottom.controlPoints, 16),
    axisZ,
  );
  const lowerBackBottom = projectPolylineToThetaY(
    sampleBezierChain(boundaries.boundaries.lower_back_bottom.controlPoints, 16),
    axisZ,
  );
  const backTop = projectPolylineToThetaY(
    sampleBezierChain(boundaries.boundaries.back_top.controlPoints, 16),
    axisZ,
  );

  const charts = makeLimbCharts(landmarks);

  const faceRegion = new Array(mesh.triangleCount);
  const counts = new Map();

  for (let t = 0; t < mesh.triangleCount; t++) {
    const c = triangleCentroid(mesh, t);
    const { theta, y } = toThetaY(c, axisZ);
    const abs = Math.abs(theta);
    const side = theta >= 0 ? "left" : "right";

    let region = null;

    // Head / neck first.
    if (y >= landmarks.levels.neckBase - 0.03) {
      region = classifyHeadNeck(c, axisZ, landmarks);
    }

    // Curated pectorals (Gate 1 authority).
    if (!region) {
      if (pointInPolyThetaY(theta, y, rightPecPoly)) {
        region = "right_pectoral_region";
      } else if (pointInPolyThetaY(theta, y, leftPecPoly)) {
        region = "left_pectoral_region";
      }
    }

    // Limbs (outside trunk radius heuristic).
    if (!region) {
      const r = Math.hypot(c[0], c[2] - axisZ(y));
      const trunk = y > 0.85 && y < 1.48 ? 0.13 + 0.04 * Math.sin((y - 0.9) * 3) : 0.1;
      const limb = classifyLimb(c, charts);
      if (limb) {
        const armish = /shoulder|biceps|triceps|forearm|hand|elbow|wrist/.test(limb);
        if (armish) {
          const sideArm = c[0] >= 0 ? "left" : "right";
          const arm = charts.arm(sideArm);
          const upper = projectToSegment(c, arm.shoulder, arm.elbow);
          if (upper.dist < 0.1 && upper.t >= 0.02 && upper.t < 0.95) {
            region = limb;
          } else if (r > trunk + 0.035 || y < 0.88) {
            region = limb;
          }
        } else if (r > trunk + 0.035 || y < 0.88) {
          region = limb;
        }
      }
    }

    if (!region && y < landmarks.levels.neckBase) {
      const topAbd = curveYAtTheta(abdomenTop, theta);
      const botAbd = curveYAtTheta(abdomenBottom, theta);
      const frontRibTheta = Math.abs(
        curveThetaAtY(ribsFrontR, axisZ, y, true),
      );
      const backRibTheta = Math.abs(curveThetaAtY(ribsBackR, axisZ, y, true));
      const backTopY = curveYAtTheta(backTop, theta);
      const upperBotY = curveYAtTheta(upperBackBottom, theta);
      const lowerBotY = curveYAtTheta(lowerBackBottom, theta);

      const frontLimit = Math.max(frontRibTheta, 58);
      if (abs < frontLimit) {
        if (y < topAbd && y >= botAbd) region = "full_abdomen_region";
        else if (y < botAbd && y >= 0.82) {
          region = abs < 40 ? null : `${side}_hip_surface`;
        }
      } else if (abs < backRibTheta) {
        // Ribs wrap
        if (y <= 1.34 && y >= 0.97) region = `${side}_ribs_region`;
        else if (y < 0.97 && y >= 0.85) region = `${side}_hip_surface`;
      } else {
        // Back
        if (y <= backTopY && y >= upperBotY) region = "upper_back_region";
        else if (y < upperBotY && y >= lowerBotY) region = "lower_back_region";
        else if (y < lowerBotY && y >= 0.82) region = `${side}_glute_surface`;
      }
    }

    faceRegion[t] = region;
    if (region) counts.set(region, (counts.get(region) ?? 0) + 1);
  }

  const normals = (() => {
  const n = new Float64Array(mesh.vertexCount * 3);
  for (let t = 0; t < mesh.triangleCount; t++) {
    const i0 = mesh.indices[t * 3];
    const i1 = mesh.indices[t * 3 + 1];
    const i2 = mesh.indices[t * 3 + 2];
    const ax = mesh.positions[i0 * 3];
    const ay = mesh.positions[i0 * 3 + 1];
    const az = mesh.positions[i0 * 3 + 2];
    const bx = mesh.positions[i1 * 3] - ax;
    const by = mesh.positions[i1 * 3 + 1] - ay;
    const bz = mesh.positions[i1 * 3 + 2] - az;
    const cx = mesh.positions[i2 * 3] - ax;
    const cy = mesh.positions[i2 * 3 + 1] - ay;
    const cz = mesh.positions[i2 * 3 + 2] - az;
    const nx = by * cz - bz * cy;
    const ny = bz * cx - bx * cz;
    const nz = bx * cy - by * cx;
    for (const i of [i0, i1, i2]) {
      n[i * 3] += nx;
      n[i * 3 + 1] += ny;
      n[i * 3 + 2] += nz;
    }
  }
  for (let i = 0; i < mesh.vertexCount; i++) {
    const l = Math.hypot(n[i * 3], n[i * 3 + 1], n[i * 3 + 2]) || 1;
    n[i * 3] /= l;
    n[i * 3 + 1] /= l;
    n[i * 3 + 2] /= l;
  }
  return n;
})();

// Extract per-region meshes (unique vertices per region).
  const byRegion = new Map();
  for (let t = 0; t < mesh.triangleCount; t++) {
    const id = faceRegion[t];
    if (!id) continue;
    if (!byRegion.has(id)) byRegion.set(id, []);
    byRegion.get(id).push(t);
  }

  const glbMeshes = [];
  for (const [id, tris] of [...byRegion.entries()].sort((a, b) =>
    a[0].localeCompare(b[0]),
  )) {
    const remap = new Map();
    const positions = [];
    const indices = [];
    const add = (vi) => {
      if (remap.has(vi)) return remap.get(vi);
      const ni = positions.length / 3;
      remap.set(vi, ni);
      // Slight inflate along normal approx via radial from axis — keep coincident;
      // runtime uses polygonOffset. Keep exact positions.
      const nx = normals[vi * 3];
      const ny = normals[vi * 3 + 1];
      const nz = normals[vi * 3 + 2];
      const inflate = 0.0018;
      positions.push(
        mesh.positions[vi * 3] + nx * inflate,
        mesh.positions[vi * 3 + 1] + ny * inflate,
        mesh.positions[vi * 3 + 2] + nz * inflate,
      );
      return ni;
    };
    for (const t of tris) {
      indices.push(
        add(mesh.indices[t * 3]),
        add(mesh.indices[t * 3 + 1]),
        add(mesh.indices[t * 3 + 2]),
      );
    }
    glbMeshes.push({
      name: `public_${id}`,
      positions: Float32Array.from(positions),
      indices: Uint32Array.from(indices),
    });
  }

  mkdirSync(path.dirname(OUT_GLB), { recursive: true });
  mkdirSync(path.dirname(OUT_REPORT), { recursive: true });
  writeHighlightGlb(OUT_GLB, glbMeshes);

  const report = {
    sourceHash,
    subdivLevels: SUBDIV_LEVELS,
    overlayTriangles: mesh.triangleCount,
    overlayVertices: mesh.vertexCount,
    regionTriangleCounts: Object.fromEntries(counts),
    torso: Object.fromEntries(
      TORSO_IDS.map((id) => [id, counts.get(id) ?? 0]),
    ),
    meshCount: glbMeshes.length,
    outGlb: path.relative(ROOT, OUT_GLB),
  };
  writeFileSync(OUT_REPORT, `${JSON.stringify(report, null, 2)}\n`);

  console.log("\nTorso triangle counts:");
  for (const id of TORSO_IDS) {
    console.log(String(counts.get(id) ?? 0).padStart(7), id);
  }
  console.log("\nwrote", path.relative(ROOT, OUT_GLB));
  console.log("regions", glbMeshes.length);
}

main();
