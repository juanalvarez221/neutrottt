/**
 * Shoulders V7.0 gate orchestrator — bilateral Geometry Distance Field.
 *
 * Evaluates SH01/SH02/SH03 (deltoid insertion offset -6/0/+6 mm) for both
 * `right_shoulder` and `left_shoulder`, selects SH02 automatically when it
 * passes bilaterally (anatomical baseline), otherwise the first candidate
 * that passes both sides. Writes diagnostics, shared-seam extracts, a
 * per-candidate report, the approved sidecars for the selected candidate,
 * a temporary categorical mask (maskIndex 16/17 only) and the gate report.
 *
 * Does NOT write to public/. Does NOT create commits.
 *
 *   node tools/body-regions/generate-shoulders-v70.mjs
 */
import { mkdirSync, writeFileSync, copyFileSync } from "node:fs";
import path from "node:path";
import sharp from "sharp";
import {
  CANDIDATES,
  GEOMETRY_IDENTITY,
  PIPELINE_VERSION,
  SOURCE_GATE,
  SHOULDERS_V70_OUT,
  assertOfficialBodyFrozen,
  getShoulderSideConfig,
  evaluateShoulder,
  measureSurfaceMetrics,
  sha16,
} from "./shoulders-v70-core.mjs";

const ROOT = path.resolve(import.meta.dirname, "..", "..");
const OUT = SHOULDERS_V70_OUT;
export const SIDES = ["right", "left"];
export const CANDIDATE_ORDER = ["SH01", "SH02", "SH03"];

export function round(v, d = 4) {
  return v == null || !Number.isFinite(v) ? null : +v.toFixed(d);
}

export function writeJson(p, obj) {
  mkdirSync(path.dirname(p), { recursive: true });
  writeFileSync(p, `${JSON.stringify(obj, null, 2)}\n`);
  return p;
}

function ensureDirs() {
  for (const d of [
    OUT,
    path.join(OUT, "diagnostic"),
    path.join(OUT, "shared-seams"),
    path.join(OUT, "candidates"),
    path.join(OUT, "approved"),
    path.join(OUT, "alignment"),
    path.join(OUT, "masks"),
  ]) {
    mkdirSync(d, { recursive: true });
  }
}

/** Read the official runtime categorical mask (RGBA, index in R channel). */
export async function loadRuntimeMask(root = ROOT) {
  const png = path.join(
    root,
    "public/models/interaction/neutro_body_v1_anatomical_region_ids.png",
  );
  const { data, info } = await sharp(png)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const mask = new Uint8Array(info.width * info.height);
  for (let i = 0; i < mask.length; i++) mask[i] = data[i * 4];
  return { mask, w: info.width, h: info.height };
}

/**
 * Rasterize ONLY the right/left shoulder surface IDs (mask 16/17) from the
 * selected candidate's positive field sets (nearest-neighbor UV). Every
 * non-shoulder pixel is preserved bit-identically; shoulder pixels are fully
 * recleared first so stale coverage never survives a candidate change.
 */
export function rasterizeShoulderSurfaces(mesh, fieldsBySide, mask, w, h) {
  const maskIndexBySide = Object.fromEntries(
    SIDES.map((side) => [side, getShoulderSideConfig(side).maskIndex]),
  );
  const shoulderIds = new Set(Object.values(maskIndexBySide));
  const out = Uint8Array.from(mask);
  for (let i = 0; i < out.length; i++) {
    if (shoulderIds.has(out[i])) out[i] = 0;
  }
  const UV = mesh.uvs;
  const I = mesh.indices;
  const cover = new Float32Array(w * h);

  const writeSample = (u, v, side, dist) => {
    if (!(dist > 0.0005)) return;
    const px = Math.min(w - 1, Math.max(0, Math.floor(u * w)));
    const py = Math.min(h - 1, Math.max(0, Math.floor((1 - v) * h)));
    const idx = py * w + px;
    // Never overwrite a foreign (non-shoulder, non-background) ID.
    if (!shoulderIds.has(mask[idx]) && mask[idx] !== 0) return;
    if (out[idx] !== 0 && !shoulderIds.has(out[idx])) return;
    if (dist > cover[idx]) {
      cover[idx] = dist;
      out[idx] = maskIndexBySide[side];
    }
  };

  for (let t = 0; t < mesh.triangleCount; t++) {
    const a = I[t * 3];
    const b = I[t * 3 + 1];
    const c = I[t * 3 + 2];
    let anyPositive = false;
    for (const side of SIDES) {
      if (fieldsBySide[side][a] > 0 || fieldsBySide[side][b] > 0 || fieldsBySide[side][c] > 0) {
        anyPositive = true;
        break;
      }
    }
    if (!anyPositive) continue;
    for (let s = 0; s < 16; s++) {
      let u = Math.random();
      let v = Math.random() * (1 - u);
      let ww = 1 - u - v;
      if (s === 0) {
        u = 1;
        v = 0;
        ww = 0;
      } else if (s === 1) {
        u = 0;
        v = 1;
        ww = 0;
      } else if (s === 2) {
        u = 0;
        v = 0;
        ww = 1;
      } else if (s === 3) {
        u = v = ww = 1 / 3;
      }
      const uu = UV[a * 2] * u + UV[b * 2] * v + UV[c * 2] * ww;
      const vv = UV[a * 2 + 1] * u + UV[b * 2 + 1] * v + UV[c * 2 + 1] * ww;
      let bestSide = null;
      let bestD = 0;
      for (const side of SIDES) {
        const vals = fieldsBySide[side];
        const d = vals[a] * u + vals[b] * v + vals[c] * ww;
        if (d > bestD) {
          bestD = d;
          bestSide = side;
        }
      }
      if (bestSide) writeSample(uu, vv, bestSide, bestD);
    }
  }

  // Nearest-neighbor authority: stamp every positive vertex's own UV texel.
  for (let i = 0; i < mesh.vertexCount; i++) {
    let bestSide = null;
    let bestD = 0;
    for (const side of SIDES) {
      const d = fieldsBySide[side][i];
      if (d > bestD) {
        bestD = d;
        bestSide = side;
      }
    }
    if (!bestSide || bestD <= 0.0005) continue;
    writeSample(UV[i * 2], UV[i * 2 + 1], bestSide, bestD);
  }

  let foreignChanged = 0;
  for (let i = 0; i < mask.length; i++) {
    if (shoulderIds.has(mask[i])) continue;
    if (mask[i] === 0) continue;
    if (out[i] !== mask[i]) foreignChanged++;
  }
  return { mask: out, foreignChanged };
}

export function serializeSeam(seam) {
  if (!seam) return null;
  return {
    seamId: seam.seamId,
    side: seam.side,
    triangleCount: seam.triangleCount,
    matchedCount: seam.matchedCount,
    totalM: round(seam.total, 6),
    points: seam.points.map((p) => p.map((x) => round(x, 6))),
  };
}

export function serializeArmSeam(armSeam) {
  if (!armSeam) return null;
  return {
    side: armSeam.side,
    insertionPoint: armSeam.insertionPoint.map((x) => round(x, 6)),
    insertionDistM: round(armSeam.insertionDist, 6),
    t: round(armSeam.t, 6),
    radiusM: round(armSeam.radius, 6),
    planeNormal: armSeam.planeNormal.map((x) => round(x, 6)),
    axisPoint: armSeam.axisPoint.map((x) => round(x, 6)),
    axisDir: armSeam.axisDir.map((x) => round(x, 6)),
    closed: armSeam.closed,
    synthesized: armSeam.synthesized,
    totalM: round(armSeam.total, 6),
    pointCount: armSeam.points.length,
    diagnostics: armSeam.diagnostics,
  };
}

/**
 * Write the four shared-seam sidecars (arm insertion + neck/chest/back
 * frontier segments) for one side. `seams` = { neck, chest, back, arm } as
 * produced by `buildShoulderContext` / `evaluateShoulder(...).seams`.
 */
export function writeSideSeams(outDir, side, seams) {
  return {
    upperArm: writeJson(
      path.join(outDir, `${side}-shoulder-upper-arm.json`),
      serializeArmSeam(seams.arm),
    ),
    neck: writeJson(
      path.join(outDir, `${side}-neck-shoulder.json`),
      serializeSeam(seams.neck),
    ),
    chest: writeJson(
      path.join(outDir, `${side}-chest-shoulder.json`),
      serializeSeam(seams.chest),
    ),
    back: writeJson(
      path.join(outDir, `${side}-back-shoulder.json`),
      serializeSeam(seams.back),
    ),
  };
}

export function summarizeResult(result) {
  return {
    candidateId: result.candidateId,
    side: result.side,
    stages: result.stages,
    pass: result.pass,
    isoline: result.isoline,
    refinedIsoline: result.refinedIsoline,
    alignment: result.alignment,
    surface: result.surface,
    region: result.region,
    topology: result.topology,
    pkgBytes: result.pkgBytes,
    seamExactness: result.seams.exactness,
  };
}

export function bilateralReport(mesh, rightValues, leftValues) {
  const right = measureSurfaceMetrics(mesh, rightValues);
  const left = measureSurfaceMetrics(mesh, leftValues);
  const rel = (a, b) => {
    const denom = Math.max(Math.abs(a), Math.abs(b), 1e-9);
    return +(Math.abs(a - b) / denom).toFixed(5);
  };
  return {
    right,
    left,
    deltas: {
      positives: Math.abs(right.positives - left.positives),
      areaRel: rel(right.areaM2, left.areaM2),
      heightRel: rel(right.heightM, left.heightM),
      widthRel: rel(right.widthXM, left.widthXM),
      depthRel: rel(right.depthZM, left.depthZM),
    },
  };
}

async function main() {
  ensureDirs();
  const freeze = assertOfficialBodyFrozen(ROOT);
  console.log(`[shoulders-v70] official body freeze OK maskHash=${freeze.maskHash}`);

  const resultsByCandidate = {};
  for (const cid of CANDIDATE_ORDER) {
    const candidate = CANDIDATES[cid];
    resultsByCandidate[cid] = {};
    for (const side of SIDES) {
      console.log(`[shoulders-v70] evaluating ${cid} ${side}…`);
      const result = evaluateShoulder(side, candidate, { freeze });
      resultsByCandidate[cid][side] = result;
      console.log(
        `  ${cid} ${side}: stages=${JSON.stringify(result.stages)} positives=${result.surface.positives} pkgKB=${round((result.pkgBytes ?? 0) / 1024, 2)} ${result.pass ? "PASS" : "FAIL"}`,
      );
    }
  }

  const bothPass = (cid) =>
    resultsByCandidate[cid].right.pass && resultsByCandidate[cid].left.pass;

  let selectedCandidate = null;
  if (bothPass("SH02")) {
    selectedCandidate = "SH02";
  } else {
    for (const cid of CANDIDATE_ORDER) {
      if (bothPass(cid)) {
        selectedCandidate = cid;
        break;
      }
    }
  }
  console.log(`[shoulders-v70] selectedCandidate=${selectedCandidate ?? "NONE"}`);

  const candidateSummary = {};
  for (const cid of CANDIDATE_ORDER) {
    candidateSummary[cid] = {
      candidateId: cid,
      candidate: CANDIDATES[cid],
      right: summarizeResult(resultsByCandidate[cid].right),
      left: summarizeResult(resultsByCandidate[cid].left),
      bothPass: bothPass(cid),
    };
    writeJson(path.join(OUT, "candidates", `${cid}.json`), candidateSummary[cid]);
  }

  if (!selectedCandidate) {
    const report = {
      gate: "shoulders-v70",
      pipelineVersion: PIPELINE_VERSION,
      sourceGate: SOURCE_GATE,
      approved: false,
      canPromoteOfficially: false,
      selectedCandidate: null,
      reason: "NO_CANDIDATE_PASSED_BOTH_SIDES",
      candidates: Object.fromEntries(
        CANDIDATE_ORDER.map((cid) => [
          cid,
          {
            right: resultsByCandidate[cid].right.pass,
            left: resultsByCandidate[cid].left.pass,
            bothPass: bothPass(cid),
          },
        ]),
      ),
    };
    writeJson(path.join(OUT, "report.json"), report);
    console.error("[shoulders-v70] FAIL — no candidate passed both sides");
    process.exitCode = 1;
    return;
  }

  const chosen = {
    right: resultsByCandidate[selectedCandidate].right,
    left: resultsByCandidate[selectedCandidate].left,
  };

  // --- diagnostic/canonical-id-map.json ------------------------------
  const canonicalIdMap = Object.fromEntries(
    SIDES.map((side) => {
      const cfg = getShoulderSideConfig(side);
      return [
        side,
        {
          regionId: cfg.regionId,
          surfaceId: cfg.surfaceId,
          maskIndex: cfg.maskIndex,
          neckRegionId: cfg.neckRegionId,
          label: cfg.label,
          description: cfg.description,
        },
      ];
    }),
  );
  writeJson(path.join(OUT, "diagnostic/canonical-id-map.json"), canonicalIdMap);

  // --- diagnostic/derived-landmarks.json ------------------------------
  const derivedLandmarks = Object.fromEntries(
    SIDES.map((side) => {
      const d = chosen[side].ctx.derived;
      return [
        side,
        {
          acromion: d.acromion.map((x) => round(x, 6)),
          elbow: d.elbow.map((x) => round(x, 6)),
          armAxis: d.armAxis.map((x) => round(x, 6)),
          armLengthM: round(d.armLength, 6),
          frameU: d.frameU.map((x) => round(x, 6)),
          frameV: d.frameV.map((x) => round(x, 6)),
          towardTorso: d.towardTorso.map((x) => round(x, 6)),
          radiusAcromionM: round(d.radiusAcromion, 6),
          radiusElbowM: round(d.radiusElbow, 6),
          shoulder: d.shoulder.map((x) => round(x, 6)),
          clavicle: d.clavicle.map((x) => round(x, 6)),
          anteriorAxilla: d.anteriorAxilla.map((x) => round(x, 6)),
          posteriorAxilla: d.posteriorAxilla.map((x) => round(x, 6)),
        },
      ];
    }),
  );
  writeJson(path.join(OUT, "diagnostic/derived-landmarks.json"), derivedLandmarks);

  // --- diagnostic/bilateral-report.json --------------------------------
  const bilateral = bilateralReport(
    chosen.right.ctx.mesh,
    chosen.right.values,
    chosen.left.values,
  );
  writeJson(path.join(OUT, "diagnostic/bilateral-report.json"), {
    candidateId: selectedCandidate,
    ...bilateral,
  });

  // --- shared-seams/ ----------------------------------------------------
  for (const side of SIDES) {
    writeSideSeams(path.join(OUT, "shared-seams"), side, chosen[side].seams);
  }

  // --- approved/{side}_shoulder_{sdf,refine}.bin + hashes.json ----------
  const hashes = {
    geometryHash: GEOMETRY_IDENTITY.geometryHash,
    indexHash: GEOMETRY_IDENTITY.indexHash,
    vertexCount: GEOMETRY_IDENTITY.vertexCount,
    candidateId: selectedCandidate,
    pipelineVersion: PIPELINE_VERSION,
    regions: {},
  };
  for (const side of SIDES) {
    const cfg = getShoulderSideConfig(side);
    const r = chosen[side];
    const sdfPath = path.join(OUT, "approved", `${cfg.regionId}_sdf.bin`);
    const refPath = path.join(OUT, "approved", `${cfg.regionId}_refine.bin`);
    writeFileSync(sdfPath, r.pkg.sdf);
    writeFileSync(refPath, r.pkg.refine);
    hashes.regions[cfg.regionId] = {
      side,
      maskIndex: cfg.maskIndex,
      surfaceId: cfg.surfaceId,
      fieldHash: r.pkg.fieldHash,
      refineHash: r.pkg.refineHash,
      sdfBytes: r.pkg.sdfBytes,
      refineBytes: r.pkg.refineBytes,
      encoding: r.pkg.encoding,
      refinementTriangleCount: r.refinement.triangles.length,
      isoline: r.refinedIsoline,
      topology: r.topology,
      surface: r.surface,
      deltoidInsertionOffsetMm: CANDIDATES[selectedCandidate].deltoidInsertionOffsetMm,
      boundaryHashes: {
        neck: sha16(r.seams.neck),
        chest: sha16(r.seams.chest),
        back: sha16(r.seams.back),
        upperArm: sha16(r.seams.arm),
      },
    };
  }
  writeJson(path.join(OUT, "approved/hashes.json"), hashes);

  // --- masks/ (temporary — mask 16/17 only) -----------------------------
  const { mask: baseMask, w, h } = await loadRuntimeMask();
  const fieldsBySide = { right: chosen.right.values, left: chosen.left.values };
  const rastered = rasterizeShoulderSurfaces(
    chosen.right.ctx.mesh,
    fieldsBySide,
    baseMask,
    w,
    h,
  );
  if (rastered.foreignChanged !== 0) {
    throw new Error(`MASK_FOREIGN_CHANGED:${rastered.foreignChanged}`);
  }
  {
    const rgba = Buffer.alloc(w * h * 4);
    for (let i = 0; i < w * h; i++) {
      rgba[i * 4] = rastered.mask[i];
      rgba[i * 4 + 1] = 0;
      rgba[i * 4 + 2] = 0;
      rgba[i * 4 + 3] = 255;
    }
    await sharp(rgba, { raw: { width: w, height: h, channels: 4 } })
      .png()
      .toFile(path.join(OUT, "masks/neutro_body_v1_anatomical_region_ids.png"));
    copyFileSync(
      path.join(OUT, "masks/neutro_body_v1_anatomical_region_ids.png"),
      path.join(OUT, "masks/neutro_body_v1_anatomical_regions_authoring.png"),
    );
  }

  // --- alignment/ ---------------------------------------------------------
  const alignment = {};
  for (const side of SIDES) {
    alignment[side] = chosen[side].alignment;
    writeJson(path.join(OUT, "alignment", `${side}.json`), alignment[side]);
  }

  const approved = chosen.right.pass && chosen.left.pass;
  const report = {
    gate: "shoulders-v70",
    pipelineVersion: PIPELINE_VERSION,
    sourceGate: SOURCE_GATE,
    approved,
    canPromoteOfficially: approved,
    selectedCandidate,
    candidateParams: CANDIDATES[selectedCandidate],
    freeze: { maskHash: freeze.maskHash },
    hashes,
    metrics: {
      right: {
        stages: chosen.right.stages,
        isoline: chosen.right.refinedIsoline,
        alignment: chosen.right.alignment,
        surface: chosen.right.surface,
        seamExactness: chosen.right.seams.exactness,
      },
      left: {
        stages: chosen.left.stages,
        isoline: chosen.left.refinedIsoline,
        alignment: chosen.left.alignment,
        surface: chosen.left.surface,
        seamExactness: chosen.left.seams.exactness,
      },
    },
    candidates: Object.fromEntries(
      CANDIDATE_ORDER.map((cid) => [
        cid,
        {
          right: resultsByCandidate[cid].right.pass,
          left: resultsByCandidate[cid].left.pass,
          bothPass: bothPass(cid),
        },
      ]),
    ),
    bilateral,
    mask: { foreignChanged: rastered.foreignChanged },
    promoted: false,
  };
  writeJson(path.join(OUT, "report.json"), report);

  console.log(
    `[shoulders-v70] done selected=${selectedCandidate} approved=${report.approved} canPromote=${report.canPromoteOfficially}`,
  );
  if (!report.approved) process.exitCode = 1;
}

if (
  process.argv[1] &&
  process.argv[1].replace(/\\/g, "/").endsWith("generate-shoulders-v70.mjs")
) {
  main().catch((err) => {
    console.error("[shoulders-v70] FAIL", err.message, err.details || "");
    process.exit(1);
  });
}
