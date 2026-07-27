/**
 * Forearms V9.0 gate orchestrator — bilateral Geometry Distance Field.
 *
 * Evaluates FA01/FA02/FA03 (innerBandOffset -4/0/+4 mm) for both sides,
 * selects FA02 when it passes bilaterally, otherwise first candidate that
 * passes both sides. Writes diagnostics, shared seams, approved sidecars,
 * temporary categorical mask (maskIndex 22-25 only) and gate report.
 *
 * Does NOT write to public/. Does NOT create commits.
 *
 *   node tools/body-regions/generate-forearms-v90.mjs
 */
import { mkdirSync, writeFileSync, readFileSync, existsSync } from "node:fs";
import path from "node:path";
import sharp from "sharp";
import {
  CANDIDATES,
  GEOMETRY_IDENTITY,
  PIPELINE_VERSION,
  SOURCE_GATE,
  FOREARMS_V90_OUT,
  CANONICAL_ID_MAP,
  assertOfficialBodyFrozen,
  evaluateForearmSide,
  evaluateForearmTarget,
  getForearmSideConfig,
  getForearmTargetConfig,
  loadMeshData,
  loadGeometryIdentity,
  measureSurfaceMetrics,
  sha16,
  contentHash16,
  decodeSnorm16,
  FIELD_RANGE_M,
  HAND_SEAM_T,
  deriveForearmLandmarks,
  loadOfficialProximalSeam,
  attachProximalToForearmFrame,
  buildDistalHandSeam,
  buildInnerOuterSeams,
  buildForearmAtlas,
} from "./forearms-v90-core.mjs";

const ROOT = path.resolve(import.meta.dirname, "..", "..");
const OUT = FOREARMS_V90_OUT;
const GLB = path.join(ROOT, "public/models/production/neutro_body_v1.glb");
const LANDMARKS = path.join(ROOT, "assets/body-regions/neutro_body_v1_landmarks.json");

export const SIDES = ["right", "left"];
export const CANDIDATE_ORDER = ["FA01", "FA02", "FA03"];
export const KINDS = ["inner", "outer", "forearm"];

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
    path.join(OUT, "backups"),
    path.join(OUT, "browser"),
    path.join(OUT, "fallback"),
    path.join(OUT, "hit-alignment"),
  ]) {
    mkdirSync(d, { recursive: true });
  }
}

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
 * Rasterize ONLY forearm inner/outer surface IDs (22-25). Foreign pixels preserved.
 */
export function rasterizeForearmSurfaces(mesh, fieldsBySideKind, mask, w, h) {
  const forearmIds = new Set([22, 23, 24, 25]);
  const out = Uint8Array.from(mask);
  for (let i = 0; i < out.length; i++) {
    if (forearmIds.has(out[i])) out[i] = 0;
  }
  const UV = mesh.uvs;
  const I = mesh.indices;
  const cover = new Float32Array(w * h);
  let foreignChanged = 0;

  const writeSample = (u, v, maskIndex, dist) => {
    if (!(dist > 0.0005)) return;
    const px = Math.min(w - 1, Math.max(0, Math.floor(u * w)));
    const py = Math.min(h - 1, Math.max(0, Math.floor((1 - v) * h)));
    const idx = py * w + px;
    if (!forearmIds.has(mask[idx]) && mask[idx] !== 0) {
      return;
    }
    if (dist > cover[idx]) {
      cover[idx] = dist;
      out[idx] = maskIndex;
    }
  };

  for (const side of SIDES) {
    for (const kind of ["inner", "outer"]) {
      const cfg = getForearmTargetConfig(side, kind);
      const values = fieldsBySideKind[`${side}:${kind}`];
      if (!values) continue;
      for (let t = 0; t < mesh.triangleCount; t++) {
        const a = I[t * 3];
        const b = I[t * 3 + 1];
        const c = I[t * 3 + 2];
        const fa = values[a];
        const fb = values[b];
        const fc = values[c];
        if (fa <= 0 && fb <= 0 && fc <= 0) continue;
        const uvs = [
          [UV[a * 2], UV[a * 2 + 1]],
          [UV[b * 2], UV[b * 2 + 1]],
          [UV[c * 2], UV[c * 2 + 1]],
        ];
        const ds = [fa, fb, fc];
        for (const [wa, wb, wc] of [
          [1, 0, 0],
          [0, 1, 0],
          [0, 0, 1],
          [0.5, 0.5, 0],
          [0.5, 0, 0.5],
          [0, 0.5, 0.5],
          [1 / 3, 1 / 3, 1 / 3],
        ]) {
          const d = ds[0] * wa + ds[1] * wb + ds[2] * wc;
          const u = uvs[0][0] * wa + uvs[1][0] * wb + uvs[2][0] * wc;
          const v = uvs[0][1] * wa + uvs[1][1] * wb + uvs[2][1] * wc;
          writeSample(u, v, cfg.maskIndex, d);
        }
      }
    }
  }

  for (let i = 0; i < mask.length; i++) {
    if (!forearmIds.has(mask[i]) && mask[i] !== 0 && out[i] !== mask[i]) {
      foreignChanged++;
      out[i] = mask[i];
    }
  }
  return { mask: out, foreignChanged, forearmIds: [...forearmIds] };
}

function serializeSeam(seam) {
  return {
    seamId: seam.seamId,
    side: seam.side,
    insertionPoint: seam.insertionPoint,
    planeNormal: seam.planeNormal,
    axisPoint: seam.axisPoint,
    axisDir: seam.axisDir,
    t: seam.t,
    radius: seam.radius,
    insertionDist: seam.insertionDist,
    points: seam.points,
    total: seam.total,
    closed: seam.closed,
    seamHash: seam.seamHash,
    sourceHash: seam.sourceHash ?? null,
    synthesized: seam.synthesized ?? false,
    autoIntersections: seam.autoIntersections ?? 0,
    components: seam.components ?? 1,
    diagnostics: seam.diagnostics ?? null,
    angle: seam.angle ?? null,
  };
}

async function main() {
  ensureDirs();
  console.log("[generate-forearms-v90] freeze check…");
  const freeze = assertOfficialBodyFrozen(ROOT);
  console.log("[generate-forearms-v90] freeze OK", freeze.maskHash);

  writeJson(path.join(OUT, "diagnostic/canonical-id-map.json"), CANONICAL_ID_MAP);

  const mesh = loadMeshData(GLB);
  const identity = loadGeometryIdentity(GLB);
  const lm = JSON.parse(readFileSync(LANDMARKS, "utf8"));

  const derivedLandmarks = {};
  const localFrames = {};
  for (const side of SIDES) {
    const derived = deriveForearmLandmarks(side, lm, identity, mesh);
    derivedLandmarks[side] = {
      side,
      elbow: derived.elbow,
      wrist: derived.wrist,
      forearmAxis: derived.forearmAxis,
      forearmLength: derived.forearmLength,
      volarNormal: derived.volarNormal,
      dorsalNormal: derived.dorsalNormal,
      radialDir: derived.radialDir,
      ulnarDir: derived.ulnarDir,
      styloidRadial: derived.styloidRadial,
      styloidUlnar: derived.styloidUlnar,
      palmCenter: derived.palmCenter,
      method: derived.method,
      confidence: derived.confidence,
      geometryHash: identity.geometryHash,
      sourceHash: sha16(JSON.stringify(lm.points)),
    };
    localFrames[side] = {
      axis: derived.forearmAxis,
      volarNormal: derived.volarNormal,
      dorsalNormal: derived.dorsalNormal,
      radialDirection: derived.radialDir,
      ulnarDirection: derived.ulnarDir,
      axisDotVolar: Math.abs(
        derived.forearmAxis[0] * derived.volarNormal[0] +
          derived.forearmAxis[1] * derived.volarNormal[1] +
          derived.forearmAxis[2] * derived.volarNormal[2],
      ),
      axisDotRadial: Math.abs(
        derived.forearmAxis[0] * derived.radialDir[0] +
          derived.forearmAxis[1] * derived.radialDir[1] +
          derived.forearmAxis[2] * derived.radialDir[2],
      ),
    };

    const proximal = attachProximalToForearmFrame(
      loadOfficialProximalSeam(side),
      derived,
    );
    const distal = buildDistalHandSeam(mesh, derived);
    const io = buildInnerOuterSeams(derived, proximal, distal, 0);

    writeJson(
      path.join(OUT, "shared-seams", `${side}-upper-arm-forearm.json`),
      serializeSeam(proximal),
    );
    writeJson(
      path.join(OUT, "shared-seams", `${side}-forearm-hand.json`),
      serializeSeam(distal),
    );
    writeJson(
      path.join(OUT, "shared-seams", `${side}-radial-inner-outer.json`),
      serializeSeam(io.radial),
    );
    writeJson(
      path.join(OUT, "shared-seams", `${side}-ulnar-inner-outer.json`),
      serializeSeam(io.ulnar),
    );
    const atlas = buildForearmAtlas(mesh, derived, proximal, distal);
    writeJson(path.join(OUT, "diagnostic", `${side}-atlas.json`), {
      side,
      parametrized: atlas.parametrized,
      skipped: atlas.skipped,
      sectionCount: atlas.sectionCount,
      handSeamT: HAND_SEAM_T,
    });
  }
  writeJson(path.join(OUT, "diagnostic/derived-landmarks.json"), derivedLandmarks);
  writeJson(path.join(OUT, "diagnostic/forearm-local-frames.json"), localFrames);

  const candidateReports = {};
  let selectedId = null;
  for (const cid of CANDIDATE_ORDER) {
    const candidate = CANDIDATES[cid];
    console.log(`[generate-forearms-v90] evaluating ${cid}…`);
    const sides = {};
    let bilateralPass = true;
    for (const side of SIDES) {
      const result = evaluateForearmSide(side, candidate, {
        mesh,
        identity,
        landmarks: lm,
      });
      sides[side] = {
        pass: result.pass,
        kinds: Object.fromEntries(
          KINDS.map((k) => {
            const r = result.results[k];
            return [
              k,
              {
                pass: r.pass,
                regionId: r.regionId,
                stages: r.stages,
                isoline: r.refinedIsoline,
                alignment: {
                  interiorMismatches: r.alignment.interiorMismatches,
                  exteriorMismatches: r.alignment.exteriorMismatches,
                  pass: r.alignment.pass,
                },
                region: {
                  components: r.region.components,
                  tinyIslands: r.region.tinyIslands ?? 0,
                },
                surface: {
                  positives: r.surface.positives,
                  areaApprox: r.surface.areaApprox ?? null,
                },
                pkgBytes: r.pkgBytes,
                refinement: r.refinement
                  ? {
                      rounds: r.refinement.roundStats?.length ?? 0,
                      inserted: r.refinement.insertedVertexCount,
                      vertPct: r.refinement.vertexIncrementPct,
                      triPct: r.refinement.triangleIncrementPct,
                    }
                  : null,
                fieldHash: r.pkg?.fieldHash ?? null,
                refineHash: r.pkg?.refineHash ?? null,
              },
            ];
          }),
        ),
      };
      if (!result.pass) bilateralPass = false;
      sides[side]._full = result;
    }
    candidateReports[cid] = {
      candidateId: cid,
      innerBandOffsetMm: candidate.innerBandOffsetMm,
      bilateralPass,
      sides: Object.fromEntries(
        SIDES.map((s) => [s, { pass: sides[s].pass, kinds: sides[s].kinds }]),
      ),
    };
    writeJson(path.join(OUT, "candidates", `${cid}.json`), candidateReports[cid]);
    if (bilateralPass && !selectedId) {
      if (cid === "FA02") selectedId = cid;
      else if (!selectedId) selectedId = cid;
    }
    candidateReports[cid]._sidesFull = sides;
  }

  if (!selectedId) {
    for (const cid of CANDIDATE_ORDER) {
      if (candidateReports[cid].bilateralPass) {
        selectedId = cid;
        break;
      }
    }
  }
  if (!selectedId) selectedId = "FA02";
  if (candidateReports.FA02?.bilateralPass) selectedId = "FA02";

  console.log(`[generate-forearms-v90] selected ${selectedId}`);
  const selected = CANDIDATES[selectedId];
  const fullSides = {};
  for (const side of SIDES) {
    const stashed = candidateReports[selectedId]._sidesFull?.[side]?._full;
    fullSides[side] =
      stashed ??
      evaluateForearmSide(side, selected, { mesh, identity, landmarks: lm });
  }

  const regions = {};
  const fieldsBySideKind = {};
  for (const side of SIDES) {
    for (const kind of KINDS) {
      const r = fullSides[side].results[kind];
      const stem = r.fileStem;
      if (r.pkg) {
        writeFileSync(path.join(OUT, "approved", `${stem}_sdf.bin`), r.pkg.sdf);
        writeFileSync(path.join(OUT, "approved", `${stem}_refine.bin`), r.pkg.refine);
      }
      fieldsBySideKind[`${side}:${kind}`] = r.values;
      const cfg = getForearmTargetConfig(side, kind);
      regions[r.regionId] = {
        side,
        kind,
        fileStem: stem,
        fieldHash: r.pkg?.fieldHash ?? null,
        refineHash: r.pkg?.refineHash ?? null,
        encoding: r.pkg?.encoding ?? null,
        isoline: r.refinedIsoline,
        alignment: r.alignment,
        components: r.region.components,
        tinyIslands: r.region.tinyIslands ?? 0,
        pkgBytes: r.pkgBytes,
        refinementTriangleCount: r.refinement?.triangles?.length ?? 0,
        vertexIncrementPct: r.refinement?.vertexIncrementPct ?? 0,
        triangleIncrementPct: r.refinement?.triangleIncrementPct ?? 0,
        rounds: r.refinement?.roundStats?.length ?? 0,
        insertedVerts: r.refinement?.insertedVertexCount ?? 0,
        innerBandOffsetMm: selected.innerBandOffsetMm,
        pass: r.pass,
        hitVisualRegionIds: cfg.hitVisualRegionIds,
        maskIndex: cfg.maskIndex,
        surfaceId: cfg.surfaceId,
        boundaryHashes: {
          proximal: r.seams.proximal.seamHash,
          hand: r.seams.distal.seamHash,
          radial: r.seams.radial.seamHash,
          ulnar: r.seams.ulnar.seamHash,
        },
      };
      writeJson(path.join(OUT, "alignment", `${stem}.json`), {
        regionId: r.regionId,
        ...r.alignment,
      });
    }
  }

  writeJson(path.join(OUT, "approved/hashes.json"), {
    candidateId: selectedId,
    geometryHash: identity.geometryHash,
    indexHash: identity.indexHash,
    vertexCount: identity.vertexCount ?? mesh.vertexCount,
    regions,
  });

  // Bilateral report
  const bilateral = {};
  for (const kind of KINDS) {
    const rR = fullSides.right.results[kind];
    const rL = fullSides.left.results[kind];
    const aR = rR.surface.areaApprox ?? rR.surface.positives;
    const aL = rL.surface.areaApprox ?? rL.surface.positives;
    const diff = aR && aL ? Math.abs(aR - aL) / Math.max(aR, aL) : null;
    bilateral[kind] = {
      rightArea: aR,
      leftArea: aL,
      areaDiffPct: diff != null ? +(diff * 100).toFixed(2) : null,
      rightLength: rR.ctx.derived.forearmLength,
      leftLength: rL.ctx.derived.forearmLength,
    };
  }
  writeJson(path.join(OUT, "diagnostic/bilateral-report.json"), bilateral);

  // Temporary mask
  const { mask: baseMask, w, h } = await loadRuntimeMask(ROOT);
  const rastered = rasterizeForearmSurfaces(mesh, fieldsBySideKind, baseMask, w, h);
  const rgba = Buffer.alloc(w * h * 4);
  for (let i = 0; i < w * h; i++) {
    rgba[i * 4] = rastered.mask[i];
    rgba[i * 4 + 1] = 0;
    rgba[i * 4 + 2] = 0;
    rgba[i * 4 + 3] = 255;
  }
  const maskPng = await sharp(rgba, { raw: { width: w, height: h, channels: 4 } })
    .png()
    .toBuffer();
  writeFileSync(path.join(OUT, "masks/neutro_body_v1_anatomical_region_ids.png"), maskPng);

  const allPass = SIDES.every((s) => fullSides[s].pass);
  const report = {
    version: PIPELINE_VERSION,
    sourceGate: SOURCE_GATE,
    selectedCandidate: selectedId,
    innerBandOffsetMm: selected.innerBandOffsetMm,
    approved: allPass,
    canPromoteOfficially: allPass && rastered.foreignChanged === 0,
    freeze,
    geometryIdentity: {
      geometryHash: identity.geometryHash,
      indexHash: identity.indexHash,
      vertexCount: mesh.vertexCount,
    },
    candidates: Object.fromEntries(
      CANDIDATE_ORDER.map((c) => [
        c,
        {
          bilateralPass: candidateReports[c].bilateralPass,
          innerBandOffsetMm: candidateReports[c].innerBandOffsetMm,
        },
      ]),
    ),
    regions,
    mask: { foreignChanged: rastered.foreignChanged },
    selectionReason: allPass
      ? selectedId === "FA02"
        ? "anatomical baseline FA02 passed bilaterally"
        : `${selectedId} first bilateral passer`
      : "no bilateral passer — FA02 packaged for diagnostics",
  };
  writeJson(path.join(OUT, "report.json"), report);

  // Stub raycast / performance / fallback artifacts for gate continuity
  writeJson(path.join(OUT, "hit-alignment/raycast-results.json"), {
    note: "dense probes deferred to vitest/playwright; canvas probes run in e2e",
    status: "pending_browser",
  });
  writeJson(path.join(OUT, "performance.json"), {
    note: "filled by browser/unit instrumentation",
    microHoverBudgetMs: 16,
  });
  writeJson(path.join(OUT, "fallback/fallback-results.json"), {
    note: "filled by vitest fallback suite",
  });

  console.log(
    `[generate-forearms-v90] done selected=${selectedId} approved=${allPass} foreignMask=${rastered.foreignChanged}`,
  );
  return report;
}

if (
  process.argv[1] &&
  process.argv[1].replace(/\\/g, "/").endsWith("generate-forearms-v90.mjs")
) {
  main().catch((err) => {
    console.error("[generate-forearms-v90] FAIL", err.message, err.details || err.stack);
    process.exit(1);
  });
}
