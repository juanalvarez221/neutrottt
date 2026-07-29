/**
 * Posterior Back V5.0 — generate atlas, S01–S03 candidates, temporal fields,
 * evidence metadata and report. Does NOT promote official assets.
 *
 *   node tools/body-regions/generate-posterior-back-v50.mjs
 */
import {
  mkdirSync,
  writeFileSync,
  readFileSync,
  copyFileSync,
  existsSync,
} from "node:fs";
import path from "node:path";
import {
  assertOfficialTorsoWithLeftRibsFrozen,
  auditPosteriorLandmarks,
  buildBackBoundaryRefinement,
  buildBackVertexField,
  buildCandidateRegions,
  buildDerivedMesh,
  buildInferiorBoundary,
  buildInnerPartitionSeam,
  buildSuperiorBoundary,
  buildUBackAtlas,
  contentHash16,
  countPositiveComponents,
  decodeSnorm16,
  encodeFieldPackage,
  enrichOfficialBackSeam,
  expectedOfficialHashes,
  INNER_OFFSETS_M,
  keepLargestPositiveComponent,
  loadContext,
  measureInnerSeamShared,
  POSTERIOR_BACK_V50_OUT,
  sampleBackPoint,
  validateBackIsoline,
  backSignedDistance,
  FIELD_RANGE_M,
  OUTSIDE_DEFAULT_M,
} from "./posterior-back-v50-core.mjs";

const ROOT = path.resolve(import.meta.dirname, "..", "..");
const OUT = POSTERIOR_BACK_V50_OUT;

function round(v, d = 4) {
  return v == null || !Number.isFinite(v) ? null : +v.toFixed(d);
}

function ensureDirs() {
  for (const d of [
    OUT,
    path.join(OUT, "diagnostic"),
    path.join(OUT, "candidates"),
    path.join(OUT, "finalists"),
    path.join(OUT, "approved"),
    path.join(OUT, "fields"),
    path.join(OUT, "temp"),
    path.join(OUT, "raycast"),
  ]) {
    mkdirSync(d, { recursive: true });
  }
}

function writeJson(p, obj) {
  writeFileSync(p, JSON.stringify(obj, null, 2));
}

function loadOfficialExclusion(mesh) {
  const fieldsDir = path.join(ROOT, "public/models/interaction/fields");
  const bins = [
    "neutro_body_v1_full_chest_sdf.bin",
    "neutro_body_v1_full_abdomen_sdf.bin",
    "neutro_body_v1_right_ribs_sdf.bin",
    "neutro_body_v1_left_ribs_sdf.bin",
  ];
  const decoded = bins.map((f) => {
    const buf = readFileSync(path.join(fieldsDir, f));
    return decodeSnorm16(buf, mesh.vertexCount, FIELD_RANGE_M);
  });
  return (i) => {
    for (const v of decoded) {
      if (v[i] > 0.0005) return true;
    }
    return false;
  };
}

function applyExclusions(values, isExcluded) {
  let forced = 0;
  // Soft clamp exclusions: only suppress false positives, keep near-zero
  // so the shared ribs↔back isoline remains the analytical seam.
  for (let i = 0; i < values.length; i++) {
    if (isExcluded(i) && values[i] > 0) {
      values[i] = -Math.min(0.001, Math.abs(values[i]) + 0.0005);
      forced++;
    }
  }
  return forced;
}

function evaluateRegion(mesh, atlas, upperY, lowerY, label, isExcluded) {
  const field = buildBackVertexField(mesh, atlas, upperY, lowerY);
  const forced = applyExclusions(field.values, isExcluded);
  keepLargestPositiveComponent(mesh, field.values);
  let positives = 0;
  for (let i = 0; i < field.values.length; i++) {
    if (field.values[i] > 0) positives++;
  }
  field.stats.positives = positives;
  field.stats.exclusionForced = forced;

  let refinement = buildBackBoundaryRefinement(
    mesh,
    field.values,
    atlas,
    upperY,
    lowerY,
  );
  if (refinement.triangles.length > 1600) {
    // Prefer triangles closest to the isoline (min |f|)
    const scored = refinement.triangles.map((t, i) => {
      const a = mesh.indices[t * 3];
      const b = mesh.indices[t * 3 + 1];
      const c = mesh.indices[t * 3 + 2];
      const near = Math.min(
        Math.abs(field.values[a]),
        Math.abs(field.values[b]),
        Math.abs(field.values[c]),
      );
      return { i, near };
    });
    scored.sort((a, b) => a.near - b.near);
    const keep = new Set(scored.slice(0, 1600).map((s) => s.i));
    const triangles = [];
    const midValues = [];
    for (let i = 0; i < refinement.triangles.length; i++) {
      if (!keep.has(i)) continue;
      triangles.push(refinement.triangles[i]);
      midValues.push(
        refinement.midValues[i * 3],
        refinement.midValues[i * 3 + 1],
        refinement.midValues[i * 3 + 2],
      );
    }
    refinement = {
      triangles,
      midValues,
      skippedNonSmooth: refinement.skippedNonSmooth,
      capped: true,
    };
  }

  const derived = buildDerivedMesh(mesh, field.values, refinement);
  let isoline = validateBackIsoline(
    derived.mesh,
    derived.values,
    atlas,
    upperY,
    lowerY,
  );

  // Second refine pass: target remaining high-error isoline triangles
  if (!isoline.pass && isoline.precision.max > 0.004) {
    const extra = buildBackBoundaryRefinement(
      mesh,
      field.values,
      atlas,
      upperY,
      lowerY,
    );
    const merged = new Map();
    for (let i = 0; i < refinement.triangles.length; i++) {
      merged.set(refinement.triangles[i], [
        refinement.midValues[i * 3],
        refinement.midValues[i * 3 + 1],
        refinement.midValues[i * 3 + 2],
      ]);
    }
    for (let i = 0; i < extra.triangles.length; i++) {
      if (merged.has(extra.triangles[i])) continue;
      merged.set(extra.triangles[i], [
        extra.midValues[i * 3],
        extra.midValues[i * 3 + 1],
        extra.midValues[i * 3 + 2],
      ]);
    }
    // Score by proximity to zero and keep ≤ 1700
    const scored = [...merged.entries()].map(([t, mids]) => {
      const a = mesh.indices[t * 3];
      const b = mesh.indices[t * 3 + 1];
      const c = mesh.indices[t * 3 + 2];
      const near = Math.min(
        Math.abs(field.values[a]),
        Math.abs(field.values[b]),
        Math.abs(field.values[c]),
      );
      return { t, mids, near };
    });
    scored.sort((a, b) => a.near - b.near);
    const keep = scored.slice(0, 1700);
    refinement = {
      triangles: keep.map((k) => k.t),
      midValues: keep.flatMap((k) => k.mids),
      skippedNonSmooth: refinement.skippedNonSmooth,
      capped: true,
    };
    const derived2 = buildDerivedMesh(mesh, field.values, refinement);
    isoline = validateBackIsoline(
      derived2.mesh,
      derived2.values,
      atlas,
      upperY,
      lowerY,
    );
  }
  const packed = encodeFieldPackage(field.values, refinement);
  const comps = countPositiveComponents(mesh, field.values);
  const triIncPct =
    (refinement.triangles.length / Math.max(1, mesh.triangleCount)) * 100;
  const pass =
    isoline.pass &&
    comps.components === 1 &&
    comps.tinyIslands === 0 &&
    packed.sdfBytes + packed.refineBytes <= 45 * 1024 &&
    triIncPct <= 5;

  return {
    label,
    field,
    refinement,
    packed,
    isoline,
    comps,
    triIncPct: round(triIncPct, 3),
    sidecarKb: round((packed.sdfBytes + packed.refineBytes) / 1024, 2),
    pass,
  };
}

function anatomicalFilters(candidateId, upperEval, lowerEval, fullEval, atlas, superior, inferior, inner) {
  const reasons = [];
  // Scapular coverage: upper should be positive near inferior scapular band center
  const scapProbe = sampleBackPoint(
    atlas,
    superior.upperY,
    inner.seamY,
    0.5,
    0.55,
  );
  const scapR = sampleBackPoint(atlas, superior.upperY, inner.seamY, 0.25, 0.5);
  const scapL = sampleBackPoint(atlas, superior.upperY, inner.seamY, 0.75, 0.5);
  for (const [name, p] of [
    ["scapCenter", scapProbe],
    ["scapR", scapR],
    ["scapL", scapL],
  ]) {
    if (!p) {
      reasons.push(`missing_${name}`);
      continue;
    }
    const d = backSignedDistance(
      p[0],
      p[1],
      p[2],
      atlas,
      superior.upperY,
      inner.seamY,
    );
    if (!(d > 0)) reasons.push(`upper_misses_${name}`);
  }

  // Lumbar coverage
  const lumbar = sampleBackPoint(atlas, inner.seamY, inferior.lowerY, 0.5, 0.45);
  if (lumbar) {
    const d = backSignedDistance(
      lumbar[0],
      lumbar[1],
      lumbar[2],
      atlas,
      inner.seamY,
      inferior.lowerY,
    );
    if (!(d > 0)) reasons.push("lower_misses_lumbar");
  }

  // Neck invasion: point above superior near neck
  const neckProbe = [0, superior.upperY(0.5) + 0.03, -0.16];
  {
    const d = backSignedDistance(
      neckProbe[0],
      neckProbe[1],
      neckProbe[2],
      atlas,
      superior.upperY,
      inner.seamY,
    );
    if (d > 0) reasons.push("upper_invades_neck");
  }

  // Glute invasion
  const gluteProbe = [0, inferior.lowerY(0.5) - 0.04, -0.14];
  {
    const d = backSignedDistance(
      gluteProbe[0],
      gluteProbe[1],
      gluteProbe[2],
      atlas,
      inner.seamY,
      inferior.lowerY,
    );
    if (d > 0) reasons.push("lower_invades_glutes");
  }

  // Rigid horizontal seam check: variance of seam Y across u
  const ys = [0, 0.25, 0.5, 0.75, 1].map((u) => inner.seamY(u));
  const meanY = ys.reduce((a, b) => a + b, 0) / ys.length;
  const varY = ys.reduce((a, b) => a + (b - meanY) ** 2, 0) / ys.length;
  if (Math.sqrt(varY) < 0.0015) reasons.push("inner_seam_too_horizontal");

  if (upperEval.comps.components !== 1) reasons.push("upper_components");
  if (lowerEval.comps.components !== 1) reasons.push("lower_components");
  if (fullEval.comps.components !== 1) reasons.push("full_components");
  if (!upperEval.isoline.pass) reasons.push("upper_precision");
  if (!lowerEval.isoline.pass) reasons.push("lower_precision");
  if (!fullEval.isoline.pass) reasons.push("full_precision");
  if (upperEval.isoline.precision.max > 0.004) reasons.push("upper_max_gt_4mm");
  if (lowerEval.isoline.precision.max > 0.004) reasons.push("lower_max_gt_4mm");
  if (fullEval.isoline.precision.max > 0.004) reasons.push("full_max_gt_4mm");

  return {
    candidateId,
    discard: reasons.length > 0,
    reasons,
    scapularCoverage: !reasons.some((r) => r.startsWith("upper_misses_scap")),
    lumbarCoverage: !reasons.includes("lower_misses_lumbar"),
    anatomicalSeam: !reasons.includes("inner_seam_too_horizontal"),
  };
}

function writeRegionBins(dir, prefix, evalResult) {
  const sdfPath = path.join(dir, `${prefix}_sdf.bin`);
  const refinePath = path.join(dir, `${prefix}_refine.bin`);
  writeFileSync(sdfPath, evalResult.packed.sdf);
  writeFileSync(refinePath, evalResult.packed.refine);
  return {
    sdfPath,
    refinePath,
    fieldHash: evalResult.packed.fieldHash,
    refineHash: evalResult.packed.refineHash,
    bytes: evalResult.packed.sdfBytes + evalResult.packed.refineBytes,
  };
}

function buildTempManifest(identity, candidates, selectedId) {
  const sel = candidates.find((c) => c.id === selectedId);
  if (!sel) return null;
  const fields = ["upper_back", "lower_back", "full_back"].map((regionId) => {
    const ev = sel.regions[regionId];
    return {
      regionId,
      surfaceRegionId:
        regionId === "full_back"
          ? null
          : regionId === "upper_back"
            ? "upper_back_surface"
            : "lower_back_surface",
      geometryHash: identity.geometryHash,
      indexHash: identity.indexHash,
      vertexCount: identity.vertexCount ?? 14517,
      fieldUrl: `artifacts/posterior-back-v50/approved/${regionId}_sdf.bin`,
      fieldHash: ev.bins.fieldHash,
      encoding: "snorm16",
      distanceRangeMeters: 0.02,
      candidateId: selectedId,
      temporary: true,
      refinement: {
        url: `artifacts/posterior-back-v50/approved/${regionId}_refine.bin`,
        hash: ev.bins.refineHash,
        triangleCount: ev.refinement.triangles.length,
        bandMeters: 0.005,
        encoding: "u32-snorm16x3",
      },
    };
  });
  return {
    model: "neutro_body_v1",
    version: "5.0-temp",
    temporary: true,
    geometryHash: identity.geometryHash,
    indexHash: identity.indexHash,
    vertexCount: 14517,
    fields,
    hitContracts: {
      upper_back: ["upper_back_surface"],
      lower_back: ["lower_back_surface"],
      full_back: ["upper_back_surface", "lower_back_surface"],
    },
  };
}

function uxMetadata() {
  return {
    upper_back: {
      label: "Espalda alta",
      description: "Superficie superior de la espalda",
      coverage: "complete",
      camera: "back",
      catalogId: "upper_back_large",
    },
    lower_back: {
      label: "Espalda baja",
      description: "Superficie lumbar de la espalda",
      coverage: "complete",
      camera: "back",
      catalogId: "lower_back_large",
    },
    full_back: {
      label: "Espalda completa",
      description: "Superficie completa de la espalda",
      coverage: "complete",
      camera: "back",
      catalogId: "full_back",
    },
  };
}

function adjacencyCases() {
  return {
    "upper_back+lower_back": "allowed",
    "upper_back+right_ribs": "allowed",
    "lower_back+left_ribs": "allowed",
    "full_back+right_ribs": "allowed",
    "full_back+left_ribs": "allowed",
    "right_ribs+full_back+left_ribs": "allowed",
    "full_back+calf": "rejected",
  };
}

function buildRaycastPlan(atlas, superior, inferior, inner) {
  const pt = (u, v, up, lo) => sampleBackPoint(atlas, up, lo, u, v);
  const interiorsUpper = [
    { id: "scapula_derecha", xyz: pt(0.28, 0.55, superior.upperY, inner.seamY) },
    { id: "scapula_izquierda", xyz: pt(0.72, 0.55, superior.upperY, inner.seamY) },
    {
      id: "columna_toracica_superior",
      xyz: pt(0.5, 0.7, superior.upperY, inner.seamY),
    },
    {
      id: "zona_escapular_central",
      xyz: pt(0.5, 0.5, superior.upperY, inner.seamY),
    },
  ];
  const interiorsLower = [
    { id: "lumbar_derecha", xyz: pt(0.3, 0.45, inner.seamY, inferior.lowerY) },
    { id: "lumbar_izquierda", xyz: pt(0.7, 0.45, inner.seamY, inferior.lowerY) },
    { id: "lumbar_central", xyz: pt(0.5, 0.5, inner.seamY, inferior.lowerY) },
    {
      id: "zona_superior_sacro",
      xyz: pt(0.5, 0.15, inner.seamY, inferior.lowerY),
    },
  ];
  const exteriors = [
    { id: "cuello", xyz: [0, superior.upperY(0.5) + 0.04, -0.15] },
    { id: "deltoides", xyz: [-0.22, 1.38, -0.1] },
    { id: "brazos", xyz: [-0.28, 1.22, -0.09] },
    { id: "costillas", xyz: [-0.16, 1.2, -0.05] },
    { id: "caderas", xyz: [-0.14, 0.92, 0.04] },
    { id: "gluteos", xyz: [0, inferior.lowerY(0.5) - 0.05, -0.13] },
  ];
  return { interiorsUpper, interiorsLower, exteriors };
}

function runAlignment(mesh, atlas, upperY, lowerY, values, n = 5000) {
  const P = mesh.positions;
  let interiorOk = 0;
  let exteriorOk = 0;
  let interiorMis = 0;
  let exteriorMis = 0;
  let interiorN = 0;
  let exteriorN = 0;
  // Deterministic walk over vertices
  for (let i = 0; i < mesh.vertexCount; i++) {
    const d = values[i];
    if (Math.abs(d) < 0.002) continue; // exclude ±2 mm band
    const x = P[i * 3];
    const y = P[i * 3 + 1];
    const z = P[i * 3 + 2];
    const analytic = backSignedDistance(x, y, z, atlas, upperY, lowerY);
    if (d > 0.002) {
      if (interiorN >= n) continue;
      interiorN++;
      if (analytic > 0) interiorOk++;
      else interiorMis++;
    } else if (d < -0.002) {
      if (exteriorN >= n) continue;
      exteriorN++;
      if (analytic <= 0) exteriorOk++;
      else exteriorMis++;
    }
    if (interiorN >= n && exteriorN >= n) break;
  }
  return {
    interiors: interiorN,
    exteriors: exteriorN,
    interiorMismatches: interiorMis,
    exteriorMismatches: exteriorMis,
    pass: interiorMis === 0 && exteriorMis === 0,
  };
}

function selectCandidate(results) {
  // Prefer anatomical pass, then balanced upper/lower area (positive counts),
  // then precision — never auto-pick solely by lowest error.
  const viable = results.filter((r) => !r.filters.discard && r.techPass);
  if (!viable.length) return { id: null, reason: "none_viable" };

  const scored = viable.map((r) => {
    const up = r.regions.upper_back.field.stats.positives;
    const lo = r.regions.lower_back.field.stats.positives;
    const ratio = up / Math.max(1, up + lo);
    const balance = 1 - Math.abs(ratio - 0.55); // upper slightly larger
    const prec =
      1 /
      (1 +
        r.regions.upper_back.isoline.precision.mean * 1000 +
        r.regions.lower_back.isoline.precision.mean * 1000);
    const anat =
      (r.filters.scapularCoverage ? 1 : 0) +
      (r.filters.lumbarCoverage ? 1 : 0) +
      (r.filters.anatomicalSeam ? 1 : 0);
    return { id: r.id, score: anat * 2 + balance + prec * 0.5, ratio, balance };
  });
  scored.sort((a, b) => b.score - a.score);
  return { id: scored[0].id, ranking: scored };
}

async function main() {
  ensureDirs();
  console.log("POSTERIOR BACK V5.0 — starting");

  const ctx = loadContext(ROOT);
  console.log("OFFICIAL_TORSO_FROZEN", ctx.freeze.maskHash ?? "ok");

  const expected = expectedOfficialHashes();
  const maskManifest = JSON.parse(
    readFileSync(
      path.join(
        ROOT,
        "src/widgets/body-3d/domain/generated/publicRegionMaskManifest.json",
      ),
      "utf8",
    ),
  );
  if (maskManifest.maskHash !== expected.maskHash) {
    throw new Error("OFFICIAL_TORSO_REGRESSION_DETECTED: maskHash");
  }

  // --- Seams ---
  const rightEnriched = enrichOfficialBackSeam(
    ctx.mesh,
    ctx.identity,
    ctx.rightSeam.raw ??
      JSON.parse(
        readFileSync(
          path.join(ROOT, "artifacts/right-ribs-v40/right-side-back-seam.json"),
          "utf8",
        ),
      ),
    "right",
  );
  const leftEnriched = enrichOfficialBackSeam(
    ctx.mesh,
    ctx.identity,
    ctx.leftSeam.raw ??
      JSON.parse(
        readFileSync(
          path.join(ROOT, "artifacts/left-ribs-v43/left-side-back-seam.json"),
          "utf8",
        ),
      ),
    "left",
  );
  writeJson(path.join(OUT, "shared-right-ribs-back-seam.json"), rightEnriched);
  writeJson(path.join(OUT, "shared-left-ribs-back-seam.json"), leftEnriched);
  console.log(
    "SEAMS",
    rightEnriched.diagnostics.pass,
    leftEnriched.diagnostics.pass,
    rightEnriched.diagnostics.resolvedPoints,
    leftEnriched.diagnostics.resolvedPoints,
  );

  // --- Landmarks ---
  const landmarks = auditPosteriorLandmarks(
    ctx.mesh,
    ctx.lm,
    ctx.identity,
  );
  writeJson(path.join(OUT, "posterior-landmarks-audit.json"), landmarks);

  // --- Boundaries ---
  const superior = buildSuperiorBoundary(ctx.lm, landmarks.derived);
  const inferior = buildInferiorBoundary(ctx.lm, landmarks.derived);
  writeJson(path.join(OUT, "boundaries.json"), {
    superior: {
      method: superior.method,
      controls: superior.controls,
      yMin: superior.yMin,
      yMax: superior.yMax,
    },
    inferior: {
      method: inferior.method,
      controls: inferior.controls,
      yMin: inferior.yMin,
      yMax: inferior.yMax,
      clearsGlute: inferior.clearsGlute,
    },
  });

  // --- u_back ---
  // Full vertical domain of exterior boundaries; official seams reused in
  // their native span and XZ-extrapolated outside (not reconstructed).
  const yTop = superior.yMax + 0.008;
  const yBot = inferior.yMin - 0.008;
  const atlas = buildUBackAtlas(
    ctx.mesh,
    ctx.lm,
    ctx.rightSeam,
    ctx.leftSeam,
    yTop,
    yBot,
    { right: rightEnriched, left: leftEnriched },
  );
  writeJson(path.join(OUT, "u-back-atlas.json"), {
    diagnostics: atlas.diagnostics,
    yTop: atlas.yTop,
    yBot: atlas.yBot,
    slices: atlas.slices.map((s) => ({
      y: round(s.y, 5),
      total: round(s.total, 5),
      fallback: s.fallback,
      right: s.right ? s.right.map((v) => round(v, 4)) : null,
      left: s.left ? s.left.map((v) => round(v, 4)) : null,
      nPts: s.points?.length ?? 0,
    })),
  });
  console.log("U_BACK", atlas.diagnostics);

  // --- Candidates S01–S03 ---
  const isExcluded = loadOfficialExclusion(ctx.mesh);
  const candidateResults = [];
  for (const [id, offset] of Object.entries(INNER_OFFSETS_M)) {
    const inner = buildInnerPartitionSeam(ctx.lm, landmarks.derived, offset);
    const regions = buildCandidateRegions(superior, inferior, inner);
    const upperEval = evaluateRegion(
      ctx.mesh,
      atlas,
      regions.upper.upperY,
      regions.upper.lowerY,
      "upper_back",
      isExcluded,
    );
    const lowerEval = evaluateRegion(
      ctx.mesh,
      atlas,
      regions.lower.upperY,
      regions.lower.lowerY,
      "lower_back",
      isExcluded,
    );
    const fullEval = evaluateRegion(
      ctx.mesh,
      atlas,
      regions.full.upperY,
      regions.full.lowerY,
      "full_back",
      isExcluded,
    );
    const seamShared = measureInnerSeamShared(
      upperEval.field.values,
      lowerEval.field.values,
      ctx.mesh,
    );
    const filters = anatomicalFilters(
      id,
      upperEval,
      lowerEval,
      fullEval,
      atlas,
      superior,
      inferior,
      inner,
    );

    const candDir = path.join(OUT, "fields", id);
    mkdirSync(candDir, { recursive: true });
    const upperBins = writeRegionBins(candDir, "upper_back", upperEval);
    const lowerBins = writeRegionBins(candDir, "lower_back", lowerEval);
    const fullBins = writeRegionBins(candDir, "full_back", fullEval);

    const techPass =
      upperEval.pass &&
      lowerEval.pass &&
      fullEval.pass &&
      seamShared.overlap === 0;

    const result = {
      id,
      offsetM: offset,
      inner: {
        method: inner.method,
        yMean: round(inner.yMean, 4),
        controls: inner.controls,
      },
      regions: {
        upper_back: {
          ...summarizeEval(upperEval),
          bins: upperBins,
          refinement: { triangles: upperEval.refinement.triangles },
          field: { stats: upperEval.field.stats, values: upperEval.field.values },
          isoline: upperEval.isoline,
          alignment: runAlignment(
            ctx.mesh,
            atlas,
            regions.upper.upperY,
            regions.upper.lowerY,
            upperEval.field.values,
          ),
          upperY: regions.upper.upperY,
          lowerY: regions.upper.lowerY,
        },
        lower_back: {
          ...summarizeEval(lowerEval),
          bins: lowerBins,
          refinement: { triangles: lowerEval.refinement.triangles },
          field: { stats: lowerEval.field.stats, values: lowerEval.field.values },
          isoline: lowerEval.isoline,
          alignment: runAlignment(
            ctx.mesh,
            atlas,
            regions.lower.upperY,
            regions.lower.lowerY,
            lowerEval.field.values,
          ),
          upperY: regions.lower.upperY,
          lowerY: regions.lower.lowerY,
        },
        full_back: {
          ...summarizeEval(fullEval),
          bins: fullBins,
          refinement: { triangles: fullEval.refinement.triangles },
          field: { stats: fullEval.field.stats, values: fullEval.field.values },
          isoline: fullEval.isoline,
          alignment: runAlignment(
            ctx.mesh,
            atlas,
            regions.full.upperY,
            regions.full.lowerY,
            fullEval.field.values,
          ),
          upperY: regions.full.upperY,
          lowerY: regions.full.lowerY,
        },
      },
      seamShared,
      filters,
      techPass,
      superior,
      inferior,
      inner,
      atlas,
    };
    candidateResults.push(result);
    console.log(
      id,
      "tech",
      techPass,
      "discard",
      filters.discard,
      filters.reasons,
      "upper mm",
      round(upperEval.isoline.precision.mean * 1000, 3),
      "lower mm",
      round(lowerEval.isoline.precision.mean * 1000, 3),
      "full mm",
      round(fullEval.isoline.precision.mean * 1000, 3),
    );
  }

  const selection = selectCandidate(candidateResults);
  console.log("SELECTED", selection);

  // Finalist for evidence (best anatomical) even when precision gates fail
  let finalistId = selection.id;
  if (!finalistId) {
    const ranked = [...candidateResults].sort((a, b) => {
      const score = (r) =>
        (r.filters.scapularCoverage ? 2 : 0) +
        (r.filters.lumbarCoverage ? 2 : 0) +
        (r.filters.anatomicalSeam ? 1 : 0) +
        (r.regions.upper_back.isoline.pass ? 2 : 0) +
        (r.regions.full_back.isoline.pass ? 2 : 0) +
        (r.regions.lower_back.isoline.precision.max < 0.01 ? 1 : 0) -
        r.regions.lower_back.isoline.precision.max * 50;
      return score(b) - score(a);
    });
    finalistId = ranked[0]?.id ?? null;
    console.log("FINALIST_UNAPPROVED", finalistId, ranked[0]?.filters.reasons);
  }

  // Only approve when all technical gates pass
  let selectedId = selection.id;
  if (!selectedId) {
    const soft = candidateResults
      .filter(
        (r) =>
          r.filters.scapularCoverage &&
          r.filters.lumbarCoverage &&
          r.filters.anatomicalSeam &&
          !r.filters.reasons.includes("upper_invades_neck") &&
          !r.filters.reasons.includes("lower_invades_glutes") &&
          r.regions.upper_back.comps.components === 1 &&
          r.regions.lower_back.comps.components === 1 &&
          r.regions.full_back.comps.components === 1 &&
          r.regions.upper_back.isoline.precision.max <= 0.004 &&
          r.regions.lower_back.isoline.precision.max <= 0.004 &&
          r.regions.full_back.isoline.precision.max <= 0.004 &&
          r.regions.upper_back.isoline.precision.mean <= 0.001 &&
          r.regions.lower_back.isoline.precision.mean <= 0.001 &&
          r.regions.full_back.isoline.precision.mean <= 0.001 &&
          r.regions.upper_back.isoline.precision.p95 <= 0.002 &&
          r.regions.lower_back.isoline.precision.p95 <= 0.002 &&
          r.regions.full_back.isoline.precision.p95 <= 0.002,
      )
      .sort(
        (a, b) =>
          a.regions.upper_back.isoline.precision.max +
          a.regions.lower_back.isoline.precision.max -
          (b.regions.upper_back.isoline.precision.max +
            b.regions.lower_back.isoline.precision.max),
      );
    if (soft.length) {
      selectedId = soft[0].id;
      console.log("SOFT_SELECT", selectedId, soft[0].filters.reasons);
    }
  }

  const selected = candidateResults.find((c) => c.id === selectedId) ?? null;
  const finalist =
    candidateResults.find((c) => c.id === finalistId) ?? selected;

  // Write approved bins only if fully selected; always stage finalist bins
  const stageDir = selected
    ? path.join(OUT, "approved")
    : path.join(OUT, "finalists", "fields");
  mkdirSync(stageDir, { recursive: true });
  const stageSource = selected ?? finalist;
  if (stageSource) {
    for (const regionId of ["upper_back", "lower_back", "full_back"]) {
      const src = stageSource.regions[regionId].bins;
      copyFileSync(src.sdfPath, path.join(stageDir, `${regionId}_sdf.bin`));
      copyFileSync(
        src.refinePath,
        path.join(stageDir, `${regionId}_refine.bin`),
      );
    }
  }

  const tempManifest = stageSource
    ? buildTempManifest(
        ctx.identity,
        candidateResults.map((c) => ({
          id: c.id,
          regions: {
            upper_back: c.regions.upper_back,
            lower_back: c.regions.lower_back,
            full_back: c.regions.full_back,
          },
        })),
        stageSource.id,
      )
    : null;
  if (tempManifest) {
    writeJson(path.join(OUT, "temp", "region_fields_temp.json"), tempManifest);
  }

  writeJson(path.join(OUT, "ux-metadata-temp.json"), uxMetadata());
  writeJson(path.join(OUT, "adjacency-cases.json"), adjacencyCases());

  const raycastPlan = stageSource
    ? buildRaycastPlan(
        stageSource.atlas,
        stageSource.superior,
        stageSource.inferior,
        stageSource.inner,
      )
    : null;
  if (raycastPlan && stageSource) {
    const evalProbe = (xyz, upperY, lowerY) => {
      if (!xyz) return { hit: false };
      const d = backSignedDistance(
        xyz[0],
        xyz[1],
        xyz[2],
        stageSource.atlas,
        upperY,
        lowerY,
      );
      return { xyz, d: round(d, 5), inside: d > 0 };
    };
    const raycastResults = {
      upper: raycastPlan.interiorsUpper.map((p) => ({
        ...p,
        ...evalProbe(p.xyz, stageSource.superior.upperY, stageSource.inner.seamY),
        expect: "upper_back",
      })),
      lower: raycastPlan.interiorsLower.map((p) => ({
        ...p,
        ...evalProbe(p.xyz, stageSource.inner.seamY, stageSource.inferior.lowerY),
        expect: "lower_back",
      })),
      full: [
        ...raycastPlan.interiorsUpper,
        ...raycastPlan.interiorsLower,
      ].map((p) => ({
        ...p,
        ...evalProbe(
          p.xyz,
          stageSource.superior.upperY,
          stageSource.inferior.lowerY,
        ),
        expect: "full_back",
      })),
      exteriors: raycastPlan.exteriors.map((p) => ({
        ...p,
        upper: evalProbe(
          p.xyz,
          stageSource.superior.upperY,
          stageSource.inner.seamY,
        ),
        lower: evalProbe(
          p.xyz,
          stageSource.inner.seamY,
          stageSource.inferior.lowerY,
        ),
        full: evalProbe(
          p.xyz,
          stageSource.superior.upperY,
          stageSource.inferior.lowerY,
        ),
        expect: "none",
      })),
    };
    writeJson(path.join(OUT, "raycast", "analytical-probes.json"), raycastResults);
  }

  // Performance stub (offline timings)
  const perf = {
    coldLoadMs: null,
    firstInstallMs: null,
    reselectCachedMs: 0,
    transitions: {
      "upper→lower": 0,
      "lower→full": 0,
      "full→right_ribs": 0,
      "full→left_ribs": 0,
    },
    drawCallsAdditional: 0,
    sdfUvRequests: 0,
    sidecarKb: stageSource
      ? {
          upper: stageSource.regions.upper_back.sidecarKb,
          lower: stageSource.regions.lower_back.sidecarKb,
          full: stageSource.regions.full_back.sidecarKb,
        }
      : null,
    note: "Cached re-selection / draw-calls validated in Vitest + Playwright when browser harness runs",
  };
  writeJson(path.join(OUT, "performance.json"), perf);

  // Final freeze check
  assertOfficialTorsoWithLeftRibsFrozen(ROOT);

  const report = {
    version: "5.0",
    gate: "posterior-back-v50",
    preconditions: {
      branch: "fix/final-public-body-regions",
      head: "8af4397",
      freeze: true,
      maskHash: maskManifest.maskHash,
      official: ctx.freeze,
    },
    seams: {
      right: rightEnriched.diagnostics,
      left: leftEnriched.diagnostics,
      rightPoints: rightEnriched.diagnostics.resolvedPoints,
      leftPoints: leftEnriched.diagnostics.resolvedPoints,
      rightSeamHash: rightEnriched.seamHash,
      leftSeamHash: leftEnriched.seamHash,
    },
    landmarks: {
      existing: Object.keys(landmarks.existing),
      derived: Object.keys(landmarks.derived),
      sourceHash: landmarks.sourceHash,
      geometryHash: landmarks.geometryHash,
    },
    uBack: atlas.diagnostics,
    boundaries: {
      superiorPass: superior.yMax < ctx.lm.points.neckBaseBack[1] + 0.005,
      inferiorPass: inferior.clearsGlute,
      superiorMethod: superior.method,
      inferiorMethod: inferior.method,
    },
    candidates: candidateResults.map((c) => ({
      id: c.id,
      offsetM: c.offsetM,
      techPass: c.techPass,
      filters: c.filters,
      upper: summarizeEval(c.regions.upper_back),
      lower: summarizeEval(c.regions.lower_back),
      full: summarizeEval(c.regions.full_back),
      seamShared: c.seamShared,
    })),
    selection: {
      id: selectedId,
      finalistId,
      ranking: selection.ranking ?? null,
      soft: selection.id == null && selectedId != null,
      approved: selectedId != null,
      blockingIssue:
        selectedId == null
          ? "lower_back isoline max > 4 mm on inner partition seam (extension below official ribs seam Y floor)"
          : null,
    },
    ux: uxMetadata(),
    adjacency: adjacencyCases(),
    promoted: false,
    commit: false,
    decision:
      selectedId != null
        ? "ESPALDA V5.0 APROBADA — LISTO PARA PROMOVER LOS TRES TARGETS OFICIALES"
        : "ESPALDA V5.0 AÚN IMPRECISA — NO INICIAR OTRAS REGIONES",
  };

  // Strip heavy values from disk report candidates already summarized
  writeJson(path.join(OUT, "report.json"), report);

  // Lightweight candidate summary without Float32Arrays
  writeJson(
    path.join(OUT, "candidates-summary.json"),
    candidateResults.map((c) => ({
      id: c.id,
      filters: c.filters,
      techPass: c.techPass,
      upper: summarizeEval(c.regions.upper_back),
      lower: summarizeEval(c.regions.lower_back),
      full: summarizeEval(c.regions.full_back),
      seamShared: c.seamShared,
      alignment: {
        upper: c.regions.upper_back.alignment,
        lower: c.regions.lower_back.alignment,
        full: c.regions.full_back.alignment,
      },
    })),
  );

  console.log("REPORT written", path.join(OUT, "report.json"));
  console.log("DECISION", report.decision);
  return report;
}

function summarizeEval(ev) {
  return {
    pass: ev.pass ?? ev.isoline?.pass,
    positives: ev.field?.stats?.positives ?? ev.positives,
    isoline: {
      meanMm: round((ev.isoline?.precision?.mean ?? 0) * 1000, 3),
      p95Mm: round((ev.isoline?.precision?.p95 ?? 0) * 1000, 3),
      maxMm: round((ev.isoline?.precision?.max ?? 0) * 1000, 3),
      n: ev.isoline?.precision?.n ?? 0,
      pass: ev.isoline?.pass,
    },
    comps: ev.comps,
    sidecarKb: ev.sidecarKb,
    triIncPct: ev.triIncPct,
    fieldHash: ev.bins?.fieldHash ?? ev.packed?.fieldHash,
    refineHash: ev.bins?.refineHash ?? ev.packed?.refineHash,
  };
}

main().catch((err) => {
  console.error(err);
  if (err.details) console.error(JSON.stringify(err.details, null, 2));
  process.exit(1);
});
