/**
 * Full Chest Generator V2.2 — Stage B surface arc parametrization.
 *
 * Freezes V2.1 Stage A boundaries. Replaces cartesian s=x/axFold with
 * s_surface from anterior torso cross-section arcs.
 * Reuses Stage C barycentric UV raster (4-sample binary vote).
 *
 * Does NOT overwrite official masks. No commit/push/merge.
 *
 *   node tools/body-regions/generate-full-chest-v22.mjs
 */
import { createHash } from "node:crypto";
import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import sharp from "sharp";
import { loadMeshData } from "../body-mask/glb.mjs";
import {
  computeVertexNormals,
  frameCamera,
  makeMaskSampler,
  renderView,
} from "../body-mask/renderer.mjs";
import {
  buildBoundaries,
  verifyLandmarkLaterality,
  validateBoundaries,
} from "./generate-full-chest-v21.mjs";
import {
  buildSurfaceSField,
  computeSCartesian,
  computeSSurface,
  measureFieldIntegrity,
  N_SLICES,
} from "./surface-s-field.mjs";

const ROOT = path.resolve(import.meta.dirname, "..", "..");
const GLB = path.join(ROOT, "public/models/production/neutro_body_v1.glb");
const LANDMARKS = path.join(
  ROOT,
  "assets/body-regions/neutro_body_v1_landmarks.json",
);
const RUNTIME_MASK = path.join(
  ROOT,
  "public/models/interaction/neutro_body_v1_anatomical_region_ids.png",
);
const OUT = path.join(ROOT, "artifacts/full-chest-v22");
const CHEST_INDEX = 9;

const VIEWS = {
  front: [0, 0, 1],
  front_right: [-0.5, 0, 0.866],
  front_left: [0.5, 0, 0.866],
  right: [-1, 0, 0],
  left: [1, 0, 0],
  top: [0, 1, 0.15],
};

function clamp(x, a, b) {
  return Math.max(a, Math.min(b, x));
}
function vlen(a) {
  return Math.hypot(a[0], a[1], a[2]);
}
function vsub(a, b) {
  return [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
}

function projectPoint(p, camera, width, height) {
  const forward = (() => {
    const d = vsub(camera.target, camera.position);
    const L = vlen(d) || 1;
    return [d[0] / L, d[1] / L, d[2] / L];
  })();
  const worldUp = [0, 1, 0];
  const right = (() => {
    const c = [
      forward[1] * worldUp[2] - forward[2] * worldUp[1],
      forward[2] * worldUp[0] - forward[0] * worldUp[2],
      forward[0] * worldUp[1] - forward[1] * worldUp[0],
    ];
    const L = vlen(c) || 1;
    return [c[0] / L, c[1] / L, c[2] / L];
  })();
  const up = [
    right[1] * forward[2] - right[2] * forward[1],
    right[2] * forward[0] - right[0] * forward[2],
    right[0] * forward[1] - right[1] * forward[0],
  ];
  const rel = vsub(p, camera.position);
  const zc = rel[0] * forward[0] + rel[1] * forward[1] + rel[2] * forward[2];
  if (zc <= 0.001) return null;
  const xc = rel[0] * right[0] + rel[1] * right[1] + rel[2] * right[2];
  const yc = rel[0] * up[0] + rel[1] * up[1] + rel[2] * up[2];
  const tanHalf = Math.tan((camera.fov * Math.PI) / 360);
  const aspect = width / height;
  return {
    x: ((xc / (zc * tanHalf * aspect)) * 0.5 + 0.5) * width,
    y: (0.5 - (yc / (zc * tanHalf)) * 0.5) * height,
  };
}

function paintDisk(buf, w, h, px, py, r, rgb) {
  const x0 = Math.max(0, Math.floor(px - r));
  const x1 = Math.min(w - 1, Math.ceil(px + r));
  const y0 = Math.max(0, Math.floor(py - r));
  const y1 = Math.min(h - 1, Math.ceil(py + r));
  const rr = r * r;
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      const dx = x - px;
      const dy = y - py;
      if (dx * dx + dy * dy > rr) continue;
      const o = (y * w + x) * 3;
      buf[o] = Math.round(rgb[0] * 255);
      buf[o + 1] = Math.round(rgb[1] * 255);
      buf[o + 2] = Math.round(rgb[2] * 255);
    }
  }
}

/** s ∈ [-1,1] → RGB gradient (right=magenta, sternum=cyan, left=lime). */
function sToRgb(s) {
  const t = clamp((s + 1) / 2, 0, 1);
  // magenta → cyan → lime
  if (t < 0.5) {
    const u = t * 2;
    return [0.95 * (1 - u) + 0.15 * u, 0.25 * (1 - u) + 0.75 * u, 0.55 * (1 - u) + 0.95 * u];
  }
  const u = (t - 0.5) * 2;
  return [0.15 * (1 - u) + 0.35 * u, 0.75 * (1 - u) + 0.9 * u, 0.95 * (1 - u) + 0.4 * u];
}

function makeBinaryMaskSampler(data, size) {
  const at = (u, v) => {
    let x = Math.floor(u * size);
    let y = Math.floor((1 - v) * size);
    x = Math.min(size - 1, Math.max(0, x));
    y = Math.min(size - 1, Math.max(0, y));
    return data[y * size + x];
  };
  return {
    at,
    membership(u, v, set) {
      return set.has(at(u, v)) ? 1 : 0;
    },
  };
}

/**
 * Membership using frozen V2.1 boundaries + s_surface (no cartesian s).
 */
export function classifyPointV22(x, y, z, bounds, field) {
  const r = computeSSurface(x, y, z, field);
  if (!r) return false;
  const s = r.s;
  if (s < bounds.rightS(y) || s > bounds.leftS(y)) return false;
  if (y < bounds.lowerY(s) || y > bounds.upperY(s)) return false;
  return true;
}

function keepLargestChest(mask, w, h, minKeepRatio = 0.005) {
  const seen = new Uint8Array(w * h);
  const comps = [];
  const dirs = [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1],
  ];
  for (let i = 0; i < w * h; i++) {
    if (mask[i] !== CHEST_INDEX || seen[i]) continue;
    const cells = [];
    const stack = [i];
    seen[i] = 1;
    while (stack.length) {
      const cur = stack.pop();
      cells.push(cur);
      const cx = cur % w;
      const cy = (cur / w) | 0;
      for (const [dx, dy] of dirs) {
        const nx = cx + dx;
        const ny = cy + dy;
        if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
        const ni = ny * w + nx;
        if (seen[ni] || mask[ni] !== CHEST_INDEX) continue;
        seen[ni] = 1;
        stack.push(ni);
      }
    }
    comps.push(cells);
  }
  comps.sort((a, b) => b.length - a.length);
  const keep = new Set(comps[0] ?? []);
  const largest = comps[0]?.length ?? 0;
  for (let c = 1; c < comps.length; c++) {
    if (comps[c].length >= largest * minKeepRatio) {
      for (const i of comps[c]) keep.add(i);
    }
  }
  let removed = 0;
  for (const c of comps) {
    for (const i of c) {
      if (keep.has(i)) continue;
      mask[i] = 0;
      removed++;
    }
  }
  return {
    components: keep.size > 0 ? 1 : 0,
    rawComponents: comps.length,
    removed,
    pixels: keep.size,
    tinyIslands: comps.filter((c) => c.length < largest * 0.01).length,
  };
}

/** Stage C raster — frozen from V2.1 (barycentric + 4-sample vote). */
async function rasterizeUV(mesh, bounds, field, baseMask, w, h) {
  const out = Buffer.from(baseMask);
  for (let i = 0; i < w * h; i++) {
    if (out[i] === CHEST_INDEX) out[i] = 0;
  }
  const P = mesh.positions;
  const UV = mesh.uvs;
  const I = mesh.indices;
  const yMin = bounds.meta.yBot - 0.02;
  const yMax = bounds.meta.yTop + 0.05;
  const hitCount = new Uint8Array(w * h);
  const bestFront = new Float64Array(w * h).fill(-Infinity);
  const bestVotes = new Uint8Array(w * h);

  for (let t = 0; t < mesh.triangleCount; t++) {
    const i0 = I[t * 3];
    const i1 = I[t * 3 + 1];
    const i2 = I[t * 3 + 2];
    const y0 = P[i0 * 3 + 1];
    const y1 = P[i1 * 3 + 1];
    const y2 = P[i2 * 3 + 1];
    if (Math.max(y0, y1, y2) < yMin || Math.min(y0, y1, y2) > yMax) continue;

    const u0 = UV[i0 * 2];
    const v0 = UV[i0 * 2 + 1];
    const u1 = UV[i1 * 2];
    const v1 = UV[i1 * 2 + 1];
    const u2 = UV[i2 * 2];
    const v2 = UV[i2 * 2 + 1];
    if (
      Math.abs(u0 - u1) > 0.55 ||
      Math.abs(u1 - u2) > 0.55 ||
      Math.abs(u2 - u0) > 0.55
    )
      continue;

    const p0 = [P[i0 * 3], y0, P[i0 * 3 + 2]];
    const p1 = [P[i1 * 3], y1, P[i1 * 3 + 2]];
    const p2 = [P[i2 * 3], y2, P[i2 * 3 + 2]];
    const frontScore = (p0[2] + p1[2] + p2[2]) / 3;
    if (frontScore < -0.12) continue;

    const area = (u1 - u0) * (v2 - v0) - (u2 - u0) * (v1 - v0);
    if (Math.abs(area) < 1e-12) continue;

    const minU = Math.min(u0, u1, u2);
    const maxU = Math.max(u0, u1, u2);
    const minV = Math.min(v0, v1, v2);
    const maxV = Math.max(v0, v1, v2);
    const x0p = Math.max(0, Math.floor(minU * (w - 1)));
    const x1p = Math.min(w - 1, Math.ceil(maxU * (w - 1)));
    const y0p = Math.max(0, Math.floor((1 - maxV) * (h - 1)));
    const y1p = Math.min(h - 1, Math.ceil((1 - minV) * (h - 1)));

    const offsets = [
      [0.25, 0.25],
      [0.75, 0.25],
      [0.25, 0.75],
      [0.75, 0.75],
    ];

    for (let py = y0p; py <= y1p; py++) {
      for (let px = x0p; px <= x1p; px++) {
        let votes = 0;
        let inside = 0;
        for (const [ox, oy] of offsets) {
          const u = (px + ox) / (w - 1);
          const v = 1 - (py + oy) / (h - 1);
          const w0 = ((u1 - u) * (v2 - v) - (u2 - u) * (v1 - v)) / area;
          const w1 = ((u2 - u) * (v0 - v) - (u0 - u) * (v2 - v)) / area;
          const w2 = 1 - w0 - w1;
          if (w0 < -0.02 || w1 < -0.02 || w2 < -0.02) continue;
          inside++;
          const x = p0[0] * w0 + p1[0] * w1 + p2[0] * w2;
          const y = p0[1] * w0 + p1[1] * w1 + p2[1] * w2;
          const z = p0[2] * w0 + p1[2] * w1 + p2[2] * w2;
          if (classifyPointV22(x, y, z, bounds, field)) votes++;
        }
        if (inside === 0) continue;
        const need = inside >= 4 ? 3 : Math.max(1, Math.ceil(inside * 0.75));
        if (votes < need) continue;
        const idx = py * w + px;
        hitCount[idx] = Math.min(255, hitCount[idx] + 1);
        if (frontScore > bestFront[idx]) {
          bestFront[idx] = frontScore;
          bestVotes[idx] = votes;
        }
      }
    }
  }

  let texels0 = 0;
  let texels1 = 0;
  let texelsN = 0;
  let unknownSkip = 0;
  for (let i = 0; i < w * h; i++) {
    if (hitCount[i] === 0) texels0++;
    else if (hitCount[i] === 1) texels1++;
    else texelsN++;
    if (bestVotes[i] === 0 || bestFront[i] === -Infinity) continue;
    out[i] = CHEST_INDEX;
  }
  return { mask: out, audit: { texels0, texels1, texelsN, unknownSkip } };
}

async function baseRender(mesh, normals, camera, width, height) {
  const empty = Buffer.alloc(4096 * 4096);
  const sampler = makeMaskSampler(empty, 4096);
  const pngBuf = await renderView({
    mesh,
    normals,
    maskSampler: sampler,
    camera,
    highlightIndices: [],
    width,
    height,
  }).toBuffer();
  return sharp(pngBuf).removeAlpha().raw().toBuffer({ resolveWithObject: true });
}

async function renderSections(mesh, normals, field, lm, outDir) {
  const shots = [
    ["A1-sections-front", "front"],
    ["A2-sections-front-right", "front_right"],
    ["A3-sections-right", "right"],
    ["A4-sections-top-debug", "top"],
  ];
  for (const [name, key] of shots) {
    const empty = Buffer.alloc(4096 * 4096);
    const sampler = makeMaskSampler(empty, 4096);
    const camera = frameCamera(mesh, sampler.at, [], VIEWS[key], {
      padding: 1.3,
    });
    camera.target = [0, 0.5 * (field.yMin + field.yMax), 0.02];
    if (key === "top") {
      camera.position = [0.02, field.yMax + 0.55, 0.08];
      camera.target = [0, 0.5 * (field.yMin + field.yMax), -0.02];
    }
    const width = 900;
    const height = 1100;
    const base = await baseRender(mesh, normals, camera, width, height);
    const buf = Buffer.from(base.data);

    for (const slice of field.slices) {
      if (!slice.arc) continue;
      // discarded / raw loop faint
      if (slice.rawPts) {
        for (const p of slice.rawPts) {
          const scr = projectPoint(p, camera, width, height);
          if (scr) paintDisk(buf, width, height, scr.x, scr.y, 0.9, [0.35, 0.35, 0.4]);
        }
      }
      // anterior arc
      for (const p of slice.arc.points) {
        const scr = projectPoint(p, camera, width, height);
        if (scr) paintDisk(buf, width, height, scr.x, scr.y, 1.6, [0.2, 0.85, 0.95]);
      }
      for (const [pt, rgb] of [
        [slice.arc.sternum, [1, 1, 0.2]],
        [slice.arc.axRight, [0.95, 0.25, 0.55]],
        [slice.arc.axLeft, [0.35, 0.9, 0.4]],
      ]) {
        const scr = projectPoint(pt, camera, width, height);
        if (scr) paintDisk(buf, width, height, scr.x, scr.y, 3.2, rgb);
      }
    }
    // landmarks
    for (const id of [
      "sternumTop",
      "anteriorAxillaryFoldLeft",
      "anteriorAxillaryFoldRight",
    ]) {
      const scr = projectPoint(lm.points[id], camera, width, height);
      if (scr) paintDisk(buf, width, height, scr.x, scr.y, 4, [1, 0.85, 0.1]);
    }
    await sharp(buf, { raw: { width, height, channels: 3 } })
      .png()
      .toFile(path.join(outDir, `${name}.png`));
  }
}

async function renderSFieldGradient(mesh, normals, field, mode, lm, outDir, fileMap) {
  const P = mesh.positions;
  const samples = [];
  for (let i = 0; i < mesh.vertexCount; i++) {
    const x = P[i * 3];
    const y = P[i * 3 + 1];
    const z = P[i * 3 + 2];
    if (y < field.yMin - 0.02 || y > field.yMax + 0.02) continue;
    let s = null;
    if (mode === "surface") {
      const r = computeSSurface(x, y, z, field);
      if (!r) continue;
      s = r.s;
    } else {
      s = computeSCartesian(x, lm);
      if (Math.abs(s) > 1.15) continue;
      if (z < -0.05) continue;
    }
    samples.push({ p: [x, y, z], s });
  }
  // Densify along anterior arcs so the field visibly reaches both axillae
  if (mode === "surface") {
    for (const slice of field.slices) {
      if (!slice.arc) continue;
      for (const sm of slice.arc.samples) {
        samples.push({ p: sm.p, s: sm.s });
      }
    }
  } else {
    // Old cartesian: sample a frontal x-grid (shows the flat vertical cut)
    for (let i = 0; i < 40; i++) {
      const y = field.yMin + ((field.yMax - field.yMin) * i) / 39;
      for (let j = 0; j <= 20; j++) {
        const s = -1 + j / 10;
        const ax =
          0.5 *
          (Math.abs(lm.points.anteriorAxillaryFoldLeft[0]) +
            Math.abs(lm.points.anteriorAxillaryFoldRight[0]));
        const x = s * ax;
        const z = 0.03;
        samples.push({ p: [x, y, z], s });
      }
    }
  }

  for (const [file, key] of fileMap) {
    const empty = Buffer.alloc(4096 * 4096);
    const sampler = makeMaskSampler(empty, 4096);
    const camera = frameCamera(mesh, sampler.at, [], VIEWS[key], {
      padding: 1.25,
    });
    camera.target = [0, 0.5 * (field.yMin + field.yMax), 0.02];
    const width = 900;
    const height = 1100;
    const base = await baseRender(mesh, normals, camera, width, height);
    const buf = Buffer.from(base.data);
    const stride = Math.max(1, Math.floor(samples.length / 90000));
    for (let i = 0; i < samples.length; i += stride) {
      const { p, s } = samples[i];
      if (Math.abs(s) > 1.05) continue;
      const scr = projectPoint(p, camera, width, height);
      if (!scr) continue;
      paintDisk(buf, width, height, scr.x, scr.y, 1.8, sToRgb(s));
    }
    await sharp(buf, { raw: { width, height, channels: 3 } })
      .png()
      .toFile(path.join(outDir, file));
  }
  return samples.length;
}

async function renderChestViews(mesh, normals, mask, w, outDir, names) {
  const sampler = makeBinaryMaskSampler(mask, w);
  for (const [file, key] of names) {
    const camera = frameCamera(mesh, sampler.at, [CHEST_INDEX], VIEWS[key], {
      padding: 1.2,
    });
    await renderView({
      mesh,
      normals,
      maskSampler: sampler,
      camera,
      highlightIndices: [CHEST_INDEX],
      width: 960,
      height: 1200,
    }).toFile(path.join(outDir, file));
  }
}

function exclusionChecks(mesh, field, lm, bounds) {
  const P = mesh.positions;
  let armR = 0;
  let armL = 0;
  let back = 0;
  let ribPost = 0;
  let armRHit = 0;
  let armLHit = 0;
  let backHit = 0;
  let ribHit = 0;
  const axR = lm.points.anteriorAxillaryFoldRight;
  const axL = lm.points.anteriorAxillaryFoldLeft;

  for (let i = 0; i < mesh.vertexCount; i++) {
    const x = P[i * 3];
    const y = P[i * 3 + 1];
    const z = P[i * 3 + 2];
    if (y < bounds.meta.yBot - 0.02 || y > bounds.meta.yTop + 0.05) continue;
    const inChestY = y >= bounds.meta.yBot - 0.01 && y <= bounds.meta.yTop + 0.02;
    if (!inChestY) continue;

    // Arm: lateral of axilla fold and outward
    const isArmR = x < axR[0] - 0.025 && Math.abs(y - axR[1]) < 0.12;
    const isArmL = x > axL[0] + 0.025 && Math.abs(y - axL[1]) < 0.12;
    const isBack = z < -0.1;
    const isRibPost = z < -0.04 && Math.abs(x) > 0.08 && Math.abs(x) < 0.16;

    const hit = classifyPointV22(x, y, z, bounds, field);
    if (isArmR) {
      armR++;
      if (hit) armRHit++;
    }
    if (isArmL) {
      armL++;
      if (hit) armLHit++;
    }
    if (isBack) {
      back++;
      if (hit) backHit++;
    }
    if (isRibPost) {
      ribPost++;
      if (hit) ribHit++;
    }
  }
  return {
    armRightExcluded: armRHit / Math.max(1, armR) < 0.02,
    armLeftExcluded: armLHit / Math.max(1, armL) < 0.02,
    backExcluded: backHit / Math.max(1, back) < 0.02,
    ribPostExcluded: ribHit / Math.max(1, ribPost) < 0.05,
    counts: { armR, armL, back, ribPost, armRHit, armLHit, backHit, ribHit },
  };
}

export async function generateFullChestV22() {
  mkdirSync(OUT, { recursive: true });
  copyFileSync(RUNTIME_MASK, path.join(OUT, "OFFICIAL_MASK_NOT_MODIFIED.png"));

  const lm = JSON.parse(readFileSync(LANDMARKS, "utf8"));
  const laterality = verifyLandmarkLaterality(lm);
  console.log("LATERALITY", laterality);

  const mesh = loadMeshData(GLB);
  const normals = computeVertexNormals(mesh);
  const bounds = buildBoundaries(lm);
  const validation = validateBoundaries(bounds);
  console.log("BOUNDARY_A", validation.ok, validation.errors);

  const yMin = bounds.meta.yBot - 0.015;
  const yMax = bounds.meta.yTop + 0.04;
  console.log("BUILD s_surface field…");
  const field = buildSurfaceSField(mesh, lm, yMin, yMax, N_SLICES);
  console.log("SLICES", {
    valid: field.valid,
    interpolated: field.interpolated,
    arms: field.armsDiscardedTotal,
    tol: field.tolerance,
  });

  const integrity = measureFieldIntegrity(mesh, field, lm, yMin, yMax);
  console.log("INTEGRITY", integrity);

  console.log("RENDER A — sections");
  await renderSections(mesh, normals, field, lm, OUT);

  console.log("RENDER B — s_surface gradient");
  await renderSFieldGradient(mesh, normals, field, "surface", lm, OUT, [
    ["B1-surface-s-front.png", "front"],
    ["B2-surface-s-front-right.png", "front_right"],
    ["B3-surface-s-right.png", "right"],
    ["B4-surface-s-left.png", "left"],
  ]);

  console.log("RENDER C — old vs new");
  await renderSFieldGradient(mesh, normals, field, "cartesian", lm, OUT, [
    ["C1-old-x-coordinate-front-right.png", "front_right"],
    ["C3-old-x-coordinate-right.png", "right"],
  ]);
  copyFileSync(
    path.join(OUT, "B2-surface-s-front-right.png"),
    path.join(OUT, "C2-new-surface-coordinate-front-right.png"),
  );
  copyFileSync(
    path.join(OUT, "B3-surface-s-right.png"),
    path.join(OUT, "C4-new-surface-coordinate-right.png"),
  );

  const exclusion = exclusionChecks(mesh, field, lm, bounds);
  console.log("EXCLUSION", exclusion);

  // Temporary mask via Stage C
  console.log("RASTER temp mask");
  const { data: baseRaw, info } = await sharp(RUNTIME_MASK)
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const w = info.width;
  const h = info.height;
  const ch = info.channels || 1;
  const base = Buffer.alloc(w * h);
  for (let i = 0; i < w * h; i++) base[i] = baseRaw[i * ch];

  const { mask: uvMask, audit } = await rasterizeUV(
    mesh,
    bounds,
    field,
    base,
    w,
    h,
  );
  const uvStats = keepLargestChest(uvMask, w, h);
  await sharp(uvMask, { raw: { width: w, height: h, channels: 1 } })
    .png()
    .toFile(path.join(OUT, "temp-runtime-mask.png"));
  await sharp(uvMask, { raw: { width: w, height: h, channels: 1 } })
    .png()
    .toFile(path.join(OUT, "temp-authoring-mask.png"));

  await renderChestViews(mesh, normals, uvMask, w, OUT, [
    ["D1-chest-front.png", "front"],
    ["D2-chest-front-right.png", "front_right"],
    ["D3-chest-front-left.png", "front_left"],
    ["D4-chest-right.png", "right"],
    ["D5-chest-left.png", "left"],
  ]);

  const hash = createHash("sha256").update(uvMask).digest("hex").slice(0, 16);

  const continuityPass =
    field.valid + field.interpolated >= N_SLICES * 0.9 &&
    field.slices.every(
      (s, i, arr) =>
        i === 0 ||
        !s.centroid ||
        !arr[i - 1].centroid ||
        Math.hypot(
          s.centroid[0] - arr[i - 1].centroid[0],
          s.centroid[2] - arr[i - 1].centroid[2],
        ) < 0.06,
    );

  const report = {
    version: "2.2",
    laterality,
    boundaryFrozenFrom: "v2.1",
    upperCenterRise: 0.003,
    slices: {
      generated: N_SLICES,
      valid: field.valid,
      interpolated: field.interpolated,
      armsDiscarded: field.armsDiscardedTotal,
      continuityPass,
      tolerance: field.tolerance,
    },
    integrity,
    exclusion,
    uvStats,
    audit,
    outputHash: hash,
    officialMaskOverwritten: false,
  };

  writeFileSync(path.join(OUT, "report.json"), `${JSON.stringify(report, null, 2)}\n`);
  console.log("V22_OK", OUT);
  console.log("HASH", hash);
  return report;
}

const invoked = process.argv[1]?.replace(/\\/g, "/");
if (invoked?.endsWith("/generate-full-chest-v22.mjs")) {
  generateFullChestV22().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
