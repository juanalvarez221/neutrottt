/**
 * Deterministic abdomen landmarks derived from neutro_body_v1.glb.
 *
 * Existing landmarks.json has no umbilicus / pubis / ASIS-style anterior
 * transitions. Derivations are reproducible from the mesh + sourceHash and
 * never invent free-hand coordinates.
 *
 *   node tools/body-regions/derive-abdomen-landmarks.mjs
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { loadMeshData, parseGlb, readAccessor } from "../body-mask/glb.mjs";
import {
  hashFloat32Canonical,
  hashUint32Canonical,
} from "./geometry-field-hash.mjs";

const ROOT = path.resolve(import.meta.dirname, "..", "..");
const GLB = path.join(ROOT, "public/models/production/neutro_body_v1.glb");
const LANDMARKS = path.join(
  ROOT,
  "assets/body-regions/neutro_body_v1_landmarks.json",
);
const OUT = path.join(ROOT, "artifacts/full-abdomen-v30");

function nearestVertex(mesh, predicate, score) {
  const P = mesh.positions;
  let best = -1;
  let bestScore = -Infinity;
  for (let i = 0; i < mesh.vertexCount; i++) {
    const p = [P[i * 3], P[i * 3 + 1], P[i * 3 + 2]];
    if (!predicate(p)) continue;
    const s = score(p);
    if (s > bestScore) {
      bestScore = s;
      best = i;
    }
  }
  if (best < 0) return null;
  return {
    index: best,
    point: [P[best * 3], P[best * 3 + 1], P[best * 3 + 2]],
    score: bestScore,
  };
}

function frontmostInBand(mesh, y0, y1, x0, x1) {
  return nearestVertex(
    mesh,
    (p) => p[1] >= y0 && p[1] <= y1 && p[0] >= x0 && p[0] <= x1 && p[2] > -0.05,
    (p) => p[2] - 0.15 * Math.abs(p[0]),
  );
}

function anteriorLateralInBand(mesh, y0, y1, side) {
  const sign = side === "left" ? 1 : -1;
  return nearestVertex(
    mesh,
    (p) =>
      p[1] >= y0 &&
      p[1] <= y1 &&
      Math.sign(p[0] || sign) === sign &&
      Math.abs(p[0]) >= 0.08 &&
      Math.abs(p[0]) <= 0.18 &&
      p[2] > -0.04,
    (p) => p[2] + 0.35 * Math.abs(p[0]),
  );
}

/**
 * Derive abdomen-critical landmarks. Existing names reused as anchors:
 * waistFront, hipLeft/Right, inframammary*, iliacCrest* (width only).
 */
export function deriveAbdomenLandmarks(mesh, lm, geometryHash, indexHash) {
  const waistY = lm.points.waistFront[1];
  const hipY = 0.5 * (lm.points.hipLeft[1] + lm.points.hipRight[1]);
  const imfY =
    0.5 *
    (lm.points.inframammaryLateralLeft[1] +
      lm.points.inframammaryLateralRight[1]);

  const umbilicusHit = frontmostInBand(
    mesh,
    waistY - 0.055,
    waistY - 0.01,
    -0.03,
    0.03,
  );
  const pubisHit = frontmostInBand(mesh, hipY - 0.05, hipY + 0.02, -0.035, 0.035);
  const latWaistR = anteriorLateralInBand(mesh, waistY - 0.02, waistY + 0.03, "right");
  const latWaistL = anteriorLateralInBand(mesh, waistY - 0.02, waistY + 0.03, "left");
  const latHipR = anteriorLateralInBand(mesh, hipY - 0.01, hipY + 0.05, "right");
  const latHipL = anteriorLateralInBand(mesh, hipY - 0.01, hipY + 0.05, "left");

  const mk = (name, hit, method, confidence) => {
    if (!hit) {
      throw new Error(`ABDOMEN_LANDMARK_DERIVATION_FAILED: ${name}`);
    }
    return {
      name,
      point: hit.point.map((v) => +v.toFixed(6)),
      vertexIndex: hit.index,
      method,
      confidence,
      geometryHash,
      indexHash,
      sourceHash: lm.sourceHash,
    };
  };

  return {
    version: "3.0",
    model: lm.model,
    sourceMesh: lm.sourceMesh,
    sourceHash: lm.sourceHash,
    geometryHash,
    indexHash,
    existingUsed: [
      "waistFront",
      "waistBack",
      "hipRight",
      "hipLeft",
      "iliacCrestRight",
      "iliacCrestLeft",
      "inframammaryMedialLeft",
      "inframammaryMedialRight",
      "inframammaryLateralLeft",
      "inframammaryLateralRight",
      "sternumBottom",
      "anteriorAxillaryFoldLeft",
      "anteriorAxillaryFoldRight",
    ],
    missingInAuthoring: [
      "umbilicus",
      "pubisSuperiorAnterior",
      "abdomenLateralWaistRight",
      "abdomenLateralWaistLeft",
      "abdomenLateralHipRight",
      "abdomenLateralHipLeft",
    ],
    derived: {
      umbilicus: mk(
        "umbilicus",
        umbilicusHit,
        `frontmostInBand(y=[${(waistY - 0.055).toFixed(3)},${(waistY - 0.01).toFixed(3)}], x=±0.03, max z-0.15|x|)`,
        0.86,
      ),
      pubisSuperiorAnterior: mk(
        "pubisSuperiorAnterior",
        pubisHit,
        `frontmostInBand(y=[${(hipY - 0.05).toFixed(3)},${(hipY + 0.02).toFixed(3)}], x=±0.035, max z-0.15|x|)`,
        0.84,
      ),
      abdomenLateralWaistRight: mk(
        "abdomenLateralWaistRight",
        latWaistR,
        `anteriorLateralInBand(waistY±, right, |x|∈[0.08,0.18], z>-0.04)`,
        0.8,
      ),
      abdomenLateralWaistLeft: mk(
        "abdomenLateralWaistLeft",
        latWaistL,
        `anteriorLateralInBand(waistY±, left, |x|∈[0.08,0.18], z>-0.04)`,
        0.8,
      ),
      abdomenLateralHipRight: mk(
        "abdomenLateralHipRight",
        latHipR,
        `anteriorLateralInBand(hipY±, right, |x|∈[0.08,0.18], z>-0.04)`,
        0.78,
      ),
      abdomenLateralHipLeft: mk(
        "abdomenLateralHipLeft",
        latHipL,
        `anteriorLateralInBand(hipY±, left, |x|∈[0.08,0.18], z>-0.04)`,
        0.78,
      ),
    },
    anchors: {
      imfY,
      waistY,
      hipY,
      waistFront: lm.points.waistFront,
      hipRight: lm.points.hipRight,
      hipLeft: lm.points.hipLeft,
    },
  };
}

export function loadGeometryIdentity(glbPath) {
  const gltf = parseGlb(glbPath);
  const primitive = gltf.json.meshes[0].primitives[0];
  const positions = readAccessor(gltf, primitive.attributes.POSITION);
  const indices = readAccessor(gltf, primitive.indices);
  return {
    geometryHash: hashFloat32Canonical(positions.data),
    indexHash: hashUint32Canonical(indices.data),
    vertexCount: positions.count,
  };
}

export function runDeriveAbdomenLandmarks() {
  const lm = JSON.parse(readFileSync(LANDMARKS, "utf8"));
  const mesh = loadMeshData(GLB);
  const id = loadGeometryIdentity(GLB);
  const report = deriveAbdomenLandmarks(
    mesh,
    lm,
    id.geometryHash,
    id.indexHash,
  );
  mkdirSync(OUT, { recursive: true });
  const outFile = path.join(OUT, "derived-landmarks.json");
  writeFileSync(outFile, JSON.stringify(report, null, 2));
  console.log("ABDOMEN_LANDMARKS", outFile);
  console.log(
    "derived",
    Object.keys(report.derived).join(", "),
    "geometryHash",
    id.geometryHash,
  );
  return report;
}

const isMain =
  process.argv[1] &&
  process.argv[1].replace(/\\/g, "/").endsWith("derive-abdomen-landmarks.mjs");
if (isMain) {
  runDeriveAbdomenLandmarks();
}
