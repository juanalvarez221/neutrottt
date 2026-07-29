import path from "node:path";
import { readJson } from "./glb.mjs";

const ROOT = path.resolve(import.meta.dirname, "..", "..");
export const ANATOMY_SOURCE = path.join(
  ROOT,
  "assets/body-regions/neutro_body_v1_anatomical_regions.json",
);

const DEG = Math.PI / 180;

/** Monotone-safe piecewise interpolation with a smoothstep blend (C1 at samples). */
export function makeCurve(points) {
  const pts = [...points].sort((a, b) => a[0] - b[0]);
  return (x) => {
    if (x <= pts[0][0]) return pts[0][1];
    const last = pts[pts.length - 1];
    if (x >= last[0]) return last[1];
    let i = 0;
    while (i < pts.length - 2 && x > pts[i + 1][0]) i += 1;
    const [x0, y0] = pts[i];
    const [x1, y1] = pts[i + 1];
    const t = (x - x0) / (x1 - x0);
    const s = t * t * (3 - 2 * t);
    return y0 + (y1 - y0) * s;
  };
}

function sub(a, b) {
  return [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
}

function dot(a, b) {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

function cross(a, b) {
  return [
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0],
  ];
}

function norm(a) {
  return Math.hypot(a[0], a[1], a[2]);
}

function scale(a, s) {
  return [a[0] * s, a[1] * s, a[2] * s];
}

function normalize(a) {
  const l = norm(a) || 1;
  return scale(a, 1 / l);
}

function mirrorX(p) {
  return [-p[0], p[1], p[2]];
}

/**
 * Polyline with arc-length parametrisation plus a stable per-segment frame.
 * `project` returns the normalised arc position, the radial distance and the
 * azimuth around the axis (0 = anterior, +/-180 = posterior, sign = lateral).
 */
function makeLimbChart(joints, radii, side) {
  const pts = side === "left" ? joints.map(mirrorX) : joints;
  const segments = [];
  let total = 0;
  for (let i = 0; i < pts.length - 1; i++) {
    const dir = sub(pts[i + 1], pts[i]);
    const len = norm(dir);
    segments.push({ a: pts[i], b: pts[i + 1], dir: normalize(dir), len, start: total });
    total += len;
  }

  // Reference axis for azimuth: world anterior (+Z) made perpendicular to the bone.
  for (const seg of segments) {
    const anterior = [0, 0, 1];
    let ref = sub(anterior, scale(seg.dir, dot(anterior, seg.dir)));
    if (norm(ref) < 1e-4) {
      const up = [0, 1, 0];
      ref = sub(up, scale(seg.dir, dot(up, seg.dir)));
    }
    seg.ref = normalize(ref);
    // Lateral reference: positive towards the body's outside for this side.
    const lateral = cross(seg.dir, seg.ref);
    seg.lat = normalize(lateral);
  }

  const project = (p) => {
    let best = null;
    for (const seg of segments) {
      const rel = sub(p, seg.a);
      let t = dot(rel, seg.dir);
      const clamped = Math.max(0, Math.min(seg.len, t));
      const onAxis = [
        seg.a[0] + seg.dir[0] * clamped,
        seg.a[1] + seg.dir[1] * clamped,
        seg.a[2] + seg.dir[2] * clamped,
      ];
      const radial = sub(p, onAxis);
      const dist = norm(radial);
      if (!best || dist < best.dist) {
        best = { seg, arc: seg.start + clamped, dist, radial };
      }
    }
    const { seg, radial } = best;
    const a = dot(radial, seg.ref);
    const b = dot(radial, seg.lat);
    let phi = Math.atan2(b, a) / DEG;
    // Normalise so +phi is always the anatomical outside of the limb.
    if (side === "left") phi = -phi;
    return { t: best.arc / total, dist: best.dist, phi };
  };

  const radiusAt = makeCurve(
    radii.map((r, i) => [
      i === 0 ? 0 : segments.slice(0, i).reduce((s, x) => s + x.len, 0) / total,
      r,
    ]),
  );

  return { project, total, radiusAt, points: pts };
}

export function loadAnatomy(sourcePath = ANATOMY_SOURCE) {
  const src = readJson(sourcePath);

  const torsoCurves = {};
  for (const [key, value] of Object.entries(src.torsoChart.curves)) {
    if (!Array.isArray(value)) continue;
    torsoCurves[key] = makeCurve(value);
  }
  const bandFrontLateral = makeCurve(src.torsoChart.bands.frontLateral);
  const bandLateralBack = makeCurve(src.torsoChart.bands.lateralBack);

  const armChart = {
    right: makeLimbChart(
      [
        src.skeleton.rightArm.acromion,
        src.skeleton.rightArm.elbow,
        src.skeleton.rightArm.wrist,
        src.skeleton.rightArm.handEnd,
      ],
      [
        src.skeleton.rightArm.radii.acromion,
        src.skeleton.rightArm.radii.elbow,
        src.skeleton.rightArm.radii.wrist,
        src.skeleton.rightArm.radii.handEnd,
      ],
      "right",
    ),
    left: makeLimbChart(
      [
        src.skeleton.rightArm.acromion,
        src.skeleton.rightArm.elbow,
        src.skeleton.rightArm.wrist,
        src.skeleton.rightArm.handEnd,
      ],
      [
        src.skeleton.rightArm.radii.acromion,
        src.skeleton.rightArm.radii.elbow,
        src.skeleton.rightArm.radii.wrist,
        src.skeleton.rightArm.radii.handEnd,
      ],
      "left",
    ),
  };

  const legChart = {
    right: makeLimbChart(
      [
        src.skeleton.rightLeg.hip,
        src.skeleton.rightLeg.knee,
        src.skeleton.rightLeg.ankle,
        src.skeleton.rightLeg.toe,
      ],
      [
        src.skeleton.rightLeg.radii.hip,
        src.skeleton.rightLeg.radii.knee,
        src.skeleton.rightLeg.radii.ankle,
        src.skeleton.rightLeg.radii.toe,
      ],
      "right",
    ),
    left: makeLimbChart(
      [
        src.skeleton.rightLeg.hip,
        src.skeleton.rightLeg.knee,
        src.skeleton.rightLeg.ankle,
        src.skeleton.rightLeg.toe,
      ],
      [
        src.skeleton.rightLeg.radii.hip,
        src.skeleton.rightLeg.radii.knee,
        src.skeleton.rightLeg.radii.ankle,
        src.skeleton.rightLeg.radii.toe,
      ],
      "left",
    ),
  };

  const upperArmSplit = makeCurve(src.armChart.upperArmSplit);
  const forearmSplit = makeCurve(src.armChart.forearmSplit);
  const lowerLegSplit = makeCurve(src.legChart.lowerLegSplit);
  const thighFrontOuter = makeCurve(src.legChart.thighQuadrants.frontOuter);
  const thighOuterBack = makeCurve(src.legChart.thighQuadrants.outerBack);
  const thighFrontInner = makeCurve(src.legChart.thighQuadrants.frontInner);
  const thighInnerBack = makeCurve(src.legChart.thighQuadrants.innerBack);

  return {
    src,
    torsoCurves,
    bandFrontLateral,
    bandLateralBack,
    armChart,
    legChart,
    armSegments: src.armChart.segments,
    legSegments: src.legChart.segments,
    upperArmSplit,
    forearmSplit,
    lowerLegSplit,
    thighFrontOuter,
    thighOuterBack,
    thighFrontInner,
    thighInnerBack,
  };
}

function within(range, t) {
  return t >= range[0] && t < range[1];
}

/** Classifies a point already known to belong to an arm. */
export function classifyArm(anatomy, side, p) {
  const { t, phi } = anatomy.armChart[side].project(p);
  const S = anatomy.armSegments;
  const abs = Math.abs(phi);
  if (t < S.shoulder[1]) return `${side}_shoulder_surface`;
  if (within(S.upperArm, t)) {
    return abs < anatomy.upperArmSplit(t)
      ? `${side}_biceps_surface`
      : `${side}_triceps_surface`;
  }
  if (within(S.elbow, t)) return `${side}_elbow_transition`;
  if (within(S.forearm, t)) {
    return abs < anatomy.forearmSplit(t)
      ? `${side}_forearm_inner_surface`
      : `${side}_forearm_outer_surface`;
  }
  if (within(S.wrist, t)) return `${side}_wrist_transition`;
  return `${side}_hand_surface`;
}

/** Classifies a point already known to belong to a leg. */
export function classifyLeg(anatomy, side, p) {
  const { t, phi } = anatomy.legChart[side].project(p);
  const S = anatomy.legSegments;
  if (t < S.thigh[1]) {
    if (phi >= anatomy.thighFrontInner(t) && phi <= anatomy.thighFrontOuter(t)) {
      return `${side}_thigh_front_surface`;
    }
    if (phi > anatomy.thighFrontOuter(t) && phi <= anatomy.thighOuterBack(t)) {
      return `${side}_thigh_outer_surface`;
    }
    if (phi < anatomy.thighFrontInner(t) && phi >= anatomy.thighInnerBack(t)) {
      return `${side}_thigh_inner_surface`;
    }
    return `${side}_thigh_back_surface`;
  }
  if (within(S.knee, t)) return `${side}_knee_transition`;
  if (within(S.lowerLeg, t)) {
    return Math.abs(phi) < anatomy.lowerLegSplit(t)
      ? `${side}_shin_surface`
      : `${side}_calf_surface`;
  }
  if (within(S.ankle, t)) return `${side}_ankle_transition`;
  return `${side}_foot_surface`;
}

/**
 * Classifies a torso / neck / head point.
 * `theta` is the signed azimuth in degrees, `y` the runtime height.
 */
export function classifyAxial(anatomy, y, theta) {
  const L = anatomy.src.landmarks;
  const C = anatomy.torsoCurves;
  const abs = Math.abs(theta);
  const side = theta >= 0 ? "left" : "right";

  if (y >= L.neckTop) {
    const H = anatomy.src.headChart.head;
    if (y >= H.topLevel) return "head_top_surface";
    if (abs >= H.backHalfAngle) return "head_back_surface";
    if (abs < H.face.halfAngle) return null;
    return `head_${side}_surface`;
  }

  if (y >= L.neckBase) {
    const N = anatomy.src.headChart.neck;
    if (abs < N.frontHalfAngle) return "neck_front_surface";
    if (abs >= N.backHalfAngle) return "neck_back_surface";
    return `neck_${side}_surface`;
  }

  const P = anatomy.src.torsoChart.pelvis;
  const thetaFL = anatomy.bandFrontLateral(y);
  const thetaLB = anatomy.bandLateralBack(y);

  if (abs < thetaFL) {
    if (y >= C.chestTop(abs)) {
      const UF = anatomy.src.torsoChart.upperFront;
      return abs < UF.neckFrontHalfAngle
        ? "neck_front_surface"
        : `${side}_shoulder_surface`;
    }
    if (y >= C.chestBottom(abs)) return `${side}_pectoral_region`;
    if (y >= C.abdomenBottom(abs)) return "full_abdomen_region";
    if (y >= P.bottom) {
      return abs < P.pubicHalfAngle ? null : `${side}_hip_surface`;
    }
    return null;
  }

  if (abs < thetaLB) {
    if (y >= C.ribsTop(abs)) return `${side}_shoulder_surface`;
    if (y >= C.ribsBottom(abs)) return `${side}_ribs_region`;
    if (y >= C.abdomenBottom(abs)) {
      // Waist strip under the ribs: front half joins the abdomen, back half the lumbar region.
      return abs < anatomy.src.torsoChart.waistFrontBackSplit
        ? "full_abdomen_region"
        : "lower_back_region";
    }
    if (y >= P.bottom) {
      return abs < P.hipGluteBoundary
        ? `${side}_hip_surface`
        : `${side}_glute_surface`;
    }
    return null;
  }

  if (y >= C.backTop(abs)) {
    return abs >= 150 ? "neck_back_surface" : `${side}_shoulder_surface`;
  }
  if (y >= C.backSplit(abs)) return "upper_back_region";
  if (y >= C.backBottom(abs)) return "lower_back_region";
  if (y >= P.bottom) {
    return abs < P.hipGluteBoundary
      ? `${side}_hip_surface`
      : `${side}_glute_surface`;
  }
  return null;
}
