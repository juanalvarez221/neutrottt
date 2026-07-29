import { classifyArm, classifyAxial, classifyLeg } from "./anatomy.mjs";

const DEG = 180 / Math.PI;

const Y_BINS = 0.02;
const T_BINS = 6;
const T_STEPS = 60;

/**
 * Rejects vertices that clearly sit on a limb, so the trunk radius field is
 * measured from trunk surface only. Uses a generous capsule around each bone.
 */
export function makeLimbPrefilter(anatomy) {
  // Points that clamp to a proximal joint (t ~ 0) straddle the trunk, so they
  // must stay in the measurement or the shoulder girdle and pelvis vanish.
  const T_MIN = 0.05;
  return (p) => {
    for (const side of ["right", "left"]) {
      const arm = anatomy.armChart[side].project(p);
      if (arm.t > T_MIN && arm.dist < anatomy.armChart[side].radiusAt(arm.t) * 1.9) {
        return true;
      }
      const leg = anatomy.legChart[side].project(p);
      if (leg.t > T_MIN && leg.dist < anatomy.legChart[side].radiusAt(leg.t) * 1.35) {
        return true;
      }
    }
    return false;
  };
}

/**
 * Measures the axial (torso + head + neck) surface radius field straight from
 * the mesh, binned by height and azimuth.
 */
export function measureAxialRadiusField(mesh, axisZ, isLimb) {
  const bins = new Map();
  const key = (yi, ti) => `${yi}|${ti}`;

  for (let i = 0; i < mesh.vertexCount; i++) {
    const x = mesh.positions[i * 3];
    const y = mesh.positions[i * 3 + 1];
    const z = mesh.positions[i * 3 + 2];
    if (isLimb && isLimb([x, y, z])) continue;
    const dz = z - axisZ(y);
    const r = Math.hypot(x, dz);
    const theta = Math.atan2(x, dz) * DEG;
    const yi = Math.round(y / Y_BINS);
    const ti = Math.round(((theta + 360) % 360) / T_BINS) % T_STEPS;
    const k = key(yi, ti);
    if (!bins.has(k)) bins.set(k, []);
    bins.get(k).push(r);
  }

  const field = new Map();
  for (const [k, values] of bins) {
    values.sort((a, b) => a - b);
    field.set(k, values[Math.floor(values.length * 0.5)]);
  }

  // Fill empty azimuth bins by angular interpolation within each height ring.
  const heights = new Set([...field.keys()].map((k) => Number(k.split("|")[0])));
  for (const yi of heights) {
    const present = [];
    for (let ti = 0; ti < T_STEPS; ti++) {
      if (field.has(key(yi, ti))) present.push(ti);
    }
    if (!present.length) continue;
    for (let ti = 0; ti < T_STEPS; ti++) {
      if (field.has(key(yi, ti))) continue;
      let before = present[present.length - 1];
      let after = present[0];
      for (const p of present) {
        if (p < ti) before = p;
      }
      for (let i = present.length - 1; i >= 0; i--) {
        if (present[i] > ti) after = present[i];
      }
      const a = field.get(key(yi, before));
      const b = field.get(key(yi, after));
      field.set(key(yi, ti), (a + b) / 2);
    }
  }

  // Two smoothing passes over the (y, theta) grid fill holes and remove spikes.
  for (let pass = 0; pass < 2; pass++) {
    const next = new Map();
    for (const [k] of field) {
      const [yiRaw, tiRaw] = k.split("|").map(Number);
      let sum = 0;
      let count = 0;
      for (let dy = -1; dy <= 1; dy++) {
        for (let dt = -1; dt <= 1; dt++) {
          const nk = key(yiRaw + dy, (tiRaw + dt + T_STEPS) % T_STEPS);
          const v = field.get(nk);
          if (v !== undefined) {
            const w = dy === 0 && dt === 0 ? 3 : 1;
            sum += v * w;
            count += w;
          }
        }
      }
      next.set(k, count ? sum / count : field.get(k));
    }
    for (const [k, v] of next) field.set(k, v);
  }

  const lookup = (yi, ti) => {
    const wrapped = ((ti % T_STEPS) + T_STEPS) % T_STEPS;
    for (let spread = 0; spread <= 4; spread++) {
      for (const dy of spread === 0 ? [0] : [-spread, spread]) {
        const v = field.get(key(yi + dy, wrapped));
        if (v !== undefined) return v;
      }
    }
    return 0.14;
  };

  // Bilinear interpolation keeps part boundaries free of bin-shaped steps.
  return (y, theta) => {
    const fy = y / Y_BINS;
    const ft = ((theta + 360) % 360) / T_BINS;
    const y0 = Math.floor(fy);
    const t0 = Math.floor(ft);
    const wy = fy - y0;
    const wt = ft - t0;
    const v00 = lookup(y0, t0);
    const v10 = lookup(y0 + 1, t0);
    const v01 = lookup(y0, t0 + 1);
    const v11 = lookup(y0 + 1, t0 + 1);
    return (
      v00 * (1 - wy) * (1 - wt) +
      v10 * wy * (1 - wt) +
      v01 * (1 - wy) * wt +
      v11 * wy * wt
    );
  };
}

/** Height-dependent centre of the trunk cross-section, measured from the mesh. */
export function measureAxisZ(mesh) {
  const bins = new Map();
  for (let i = 0; i < mesh.vertexCount; i++) {
    const x = mesh.positions[i * 3];
    if (Math.abs(x) > 0.17) continue;
    const y = mesh.positions[i * 3 + 1];
    if (y < 0.78) continue;
    const z = mesh.positions[i * 3 + 2];
    const yi = Math.round(y / 0.02);
    const b = bins.get(yi) ?? { min: Infinity, max: -Infinity };
    b.min = Math.min(b.min, z);
    b.max = Math.max(b.max, z);
    bins.set(yi, b);
  }

  const keys = [...bins.keys()].sort((a, b) => a - b);
  const raw = keys.map((k) => [k * 0.02, (bins.get(k).min + bins.get(k).max) / 2]);

  // Moving average keeps the axis smooth so azimuths never jitter.
  const smooth = raw.map(([y], i) => {
    let sum = 0;
    let count = 0;
    for (let d = -2; d <= 2; d++) {
      const r = raw[i + d];
      if (!r) continue;
      sum += r[1];
      count += 1;
    }
    return [y, sum / count];
  });

  return (y) => {
    if (y <= smooth[0][0]) return smooth[0][1];
    const last = smooth[smooth.length - 1];
    if (y >= last[0]) return last[1];
    let i = 0;
    while (i < smooth.length - 2 && y > smooth[i + 1][0]) i += 1;
    const [y0, z0] = smooth[i];
    const [y1, z1] = smooth[i + 1];
    return z0 + ((z1 - z0) * (y - y0)) / (y1 - y0);
  };
}

const ARM_TOLERANCE = 1.45;
const LEG_TOLERANCE = 1.5;
const AXIAL_MARGIN = 0.018;

/**
 * Decides which body part owns a surface point. Limbs win only when the point
 * sits clearly outside the measured trunk surface, which keeps the armpit and
 * the hip from leaking into the torso.
 */
export function makePartResolver(anatomy, axisZ, axialRadius) {
  const pelvisBottom = anatomy.src.torsoChart.pelvis.bottom;
  const neckBase = anatomy.src.landmarks.neckBase;

  return (p) => {
    const [x, y] = p;
    if (y >= neckBase) return { part: "axial" };

    if (y < pelvisBottom) {
      const side = x >= 0 ? "left" : "right";
      return { part: "leg", side };
    }

    const dz = p[2] - axisZ(y);
    const r = Math.hypot(x, dz);
    const theta = Math.atan2(x, dz) * DEG;
    const trunk = axialRadius(y, theta);
    const outside = r - trunk;

    let bestArm = null;
    for (const side of ["right", "left"]) {
      const proj = anatomy.armChart[side].project(p);
      const radius = anatomy.armChart[side].radiusAt(proj.t);
      const score = proj.dist / (radius * ARM_TOLERANCE);
      if (!bestArm || score < bestArm.score) {
        bestArm = { part: "arm", side, score, t: proj.t };
      }
    }
    let best = bestArm;
    for (const side of ["right", "left"]) {
      const proj = anatomy.legChart[side].project(p);
      const radius = anatomy.legChart[side].radiusAt(proj.t);
      const score = proj.dist / (radius * LEG_TOLERANCE);
      if (score < best.score) best = { part: "leg", side, score, t: proj.t };
    }

    // Proximal arm lives against the lateral torso wall. Demand a larger
    // outside-of-trunk margin there so ribs/pectoral keep the body wall.
    let outsideNeed = AXIAL_MARGIN;
    if (best.part === "arm") {
      const proximal = Math.max(0, 1 - best.t / 0.42);
      outsideNeed = AXIAL_MARGIN + 0.11 * proximal * proximal;
      // Near the armpit, also reject arm claims that sit on the torso azimuth.
      if (best.t < 0.22 && Math.abs(theta) < 145 && outside < 0.08) {
        return { part: "axial" };
      }
    }

    if (best.score < 1 && outside > outsideNeed) return best;

    // Spread fingers and thumbs poke out of the wrist/hand capsule, yet nothing
    // else lives that far from the trunk axis: keep them on the arm.
    if (
      bestArm.t >= anatomy.armSegments.forearm[1] &&
      bestArm.score < 2.4 &&
      outside > 0.05
    ) {
      return bestArm;
    }
    return { part: "axial" };
  };
}

export function makeClassifier(anatomy, axisZ, resolvePart) {
  return (p) => {
    const resolved = resolvePart(p);
    if (resolved.part === "arm") return classifyArm(anatomy, resolved.side, p);
    if (resolved.part === "leg") return classifyLeg(anatomy, resolved.side, p);
    const y = p[1];
    const theta = Math.atan2(p[0], p[2] - axisZ(y)) * DEG;
    return classifyAxial(anatomy, y, theta);
  };
}
