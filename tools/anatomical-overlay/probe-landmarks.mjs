/**
 * Probes BodyVisual for real model-space landmarks used by anatomical curves.
 * Output: assets/body-regions/neutro_body_v1_landmarks.json
 */
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { loadMeshData } from "../body-mask/glb.mjs";

const ROOT = path.resolve(import.meta.dirname, "..", "..");
const BODY = path.join(ROOT, "public/models/production/neutro_body_v1.glb");
const OUT = path.join(ROOT, "assets/body-regions/neutro_body_v1_landmarks.json");

const DEG = 180 / Math.PI;

function round3(v) {
  return Math.round(v * 1000) / 1000;
}

function roundArr(a) {
  return a.map(round3);
}

function axisZAt(mesh, y, band = 0.015) {
  let zMin = Infinity;
  let zMax = -Infinity;
  for (let i = 0; i < mesh.vertexCount; i++) {
    const py = mesh.positions[i * 3 + 1];
    if (py < y - band || py > y + band) continue;
    const px = mesh.positions[i * 3];
    if (Math.abs(px) > 0.14) continue;
    const pz = mesh.positions[i * 3 + 2];
    zMin = Math.min(zMin, pz);
    zMax = Math.max(zMax, pz);
  }
  if (!Number.isFinite(zMin)) return -0.09;
  return (zMin + zMax) / 2;
}

function thetaOf(p, axisZ) {
  return Math.atan2(p[0], p[2] - axisZ) * DEG;
}

function nearestVertex(mesh, pred, scoreFn) {
  let best = null;
  for (let i = 0; i < mesh.vertexCount; i++) {
    const p = [
      mesh.positions[i * 3],
      mesh.positions[i * 3 + 1],
      mesh.positions[i * 3 + 2],
    ];
    if (!pred(p, i)) continue;
    const score = scoreFn(p, i);
    if (!best || score > best.score) best = { p, score, i };
  }
  return best;
}

function frontmostInBand(mesh, y0, y1, x0, x1) {
  return nearestVertex(
    mesh,
    (p) => p[1] >= y0 && p[1] <= y1 && p[0] >= x0 && p[0] <= x1,
    (p) => p[2],
  );
}

function outermostInBand(mesh, y0, y1, side) {
  return nearestVertex(
    mesh,
    (p) => p[1] >= y0 && p[1] <= y1 && (side === "left" ? p[0] > 0.05 : p[0] < -0.05),
    (p) => (side === "left" ? p[0] : -p[0]),
  );
}

function backmostInBand(mesh, y0, y1, xAbsMax = 0.12) {
  return nearestVertex(
    mesh,
    (p) => p[1] >= y0 && p[1] <= y1 && Math.abs(p[0]) <= xAbsMax,
    (p) => -p[2],
  );
}

function main() {
  const mesh = loadMeshData(BODY);
  const buf = readFileSync(BODY);
  const sourceHash = createHash("sha256").update(buf).digest("hex").slice(0, 16);

  let minY = Infinity;
  let maxY = -Infinity;
  let minX = Infinity;
  let maxX = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;
  for (let i = 0; i < mesh.vertexCount; i++) {
    const x = mesh.positions[i * 3];
    const y = mesh.positions[i * 3 + 1];
    const z = mesh.positions[i * 3 + 2];
    minX = Math.min(minX, x);
    maxX = Math.max(maxX, x);
    minY = Math.min(minY, y);
    maxY = Math.max(maxY, y);
    minZ = Math.min(minZ, z);
    maxZ = Math.max(maxZ, z);
  }

  const height = maxY - minY;
  const breastApexR = frontmostInBand(mesh, 1.24, 1.3, -0.12, -0.04);
  const breastApexL = frontmostInBand(mesh, 1.24, 1.3, 0.04, 0.12);

  // Inframammary: lowest front point under each breast mound.
  const infraMedialR = nearestVertex(
    mesh,
    (p) => p[1] >= 1.16 && p[1] <= 1.24 && p[0] >= -0.05 && p[0] <= -0.01 && p[2] > -0.02,
    (p) => -p[1] + 0.35 * p[2],
  );
  const infraLateralR = nearestVertex(
    mesh,
    (p) => p[1] >= 1.16 && p[1] <= 1.26 && p[0] >= -0.14 && p[0] <= -0.07 && p[2] > -0.05,
    (p) => -p[1] + 0.25 * p[2],
  );
  const infraMedialL = nearestVertex(
    mesh,
    (p) => p[1] >= 1.16 && p[1] <= 1.24 && p[0] >= 0.01 && p[0] <= 0.05 && p[2] > -0.02,
    (p) => -p[1] + 0.35 * p[2],
  );
  const infraLateralL = nearestVertex(
    mesh,
    (p) => p[1] >= 1.16 && p[1] <= 1.26 && p[0] >= 0.07 && p[0] <= 0.14 && p[2] > -0.05,
    (p) => -p[1] + 0.25 * p[2],
  );

  const sternumTop = frontmostInBand(mesh, 1.33, 1.4, -0.02, 0.02);
  const sternumBottom = frontmostInBand(mesh, 1.2, 1.26, -0.02, 0.02);
  const clavicleR = nearestVertex(
    mesh,
    (p) => p[1] >= 1.36 && p[1] <= 1.44 && p[0] >= -0.12 && p[0] <= -0.04 && p[2] > -0.08,
    (p) => p[2] - 0.1 * Math.abs(p[1] - 1.4),
  );
  const clavicleL = nearestVertex(
    mesh,
    (p) => p[1] >= 1.36 && p[1] <= 1.44 && p[0] >= 0.04 && p[0] <= 0.12 && p[2] > -0.08,
    (p) => p[2] - 0.1 * Math.abs(p[1] - 1.4),
  );

  const axillaAntR = nearestVertex(
    mesh,
    (p) => p[1] >= 1.32 && p[1] <= 1.42 && p[0] >= -0.2 && p[0] <= -0.12 && p[2] > -0.05,
    (p) => p[2] + 0.3 * (-p[0]),
  );
  const axillaAntL = nearestVertex(
    mesh,
    (p) => p[1] >= 1.32 && p[1] <= 1.42 && p[0] >= 0.12 && p[0] <= 0.2 && p[2] > -0.05,
    (p) => p[2] + 0.3 * p[0],
  );
  const axillaPostR = nearestVertex(
    mesh,
    (p) => p[1] >= 1.3 && p[1] <= 1.42 && p[0] >= -0.2 && p[0] <= -0.1 && p[2] < -0.05,
    (p) => -p[2] + 0.2 * (-p[0]),
  );
  const axillaPostL = nearestVertex(
    mesh,
    (p) => p[1] >= 1.3 && p[1] <= 1.42 && p[0] >= 0.1 && p[0] <= 0.2 && p[2] < -0.05,
    (p) => -p[2] + 0.2 * p[0],
  );

  const scapularLine = backmostInBand(mesh, 1.05, 1.12, 0.16);
  const waistFront = frontmostInBand(mesh, 1.08, 1.14, -0.04, 0.04);
  const waistBack = backmostInBand(mesh, 1.08, 1.14, 0.1);
  const iliacR = outermostInBand(mesh, 0.88, 0.96, "right");
  const iliacL = outermostInBand(mesh, 0.88, 0.96, "left");

  const neckBaseFront = frontmostInBand(mesh, 1.44, 1.48, -0.04, 0.04);
  const neckBaseBack = backmostInBand(mesh, 1.44, 1.48, 0.06);

  const shoulderR = outermostInBand(mesh, 1.4, 1.48, "right");
  const shoulderL = outermostInBand(mesh, 1.4, 1.48, "left");

  // Limb joints from dense clustering of extremity centroids.
  const elbowR = nearestVertex(
    mesh,
    (p) => p[1] >= 1.08 && p[1] <= 1.16 && p[0] < -0.22,
    (p) => -Math.hypot(p[0] + 0.28, p[2] + 0.09),
  );
  const elbowL = nearestVertex(
    mesh,
    (p) => p[1] >= 1.08 && p[1] <= 1.16 && p[0] > 0.22,
    (p) => -Math.hypot(p[0] - 0.28, p[2] + 0.09),
  );
  const wristR = nearestVertex(
    mesh,
    (p) => p[1] >= 0.95 && p[1] <= 1.02 && p[0] < -0.28 && p[2] > 0.05,
    (p) => -Math.hypot(p[0] + 0.33, p[2] - 0.15),
  );
  const wristL = nearestVertex(
    mesh,
    (p) => p[1] >= 0.95 && p[1] <= 1.02 && p[0] > 0.28 && p[2] > 0.05,
    (p) => -Math.hypot(p[0] - 0.33, p[2] - 0.15),
  );
  const hipR = nearestVertex(
    mesh,
    (p) => p[1] >= 0.82 && p[1] <= 0.9 && p[0] >= -0.14 && p[0] <= -0.06,
    (p) => -Math.hypot(p[0] + 0.1, p[2] + 0.09),
  );
  const hipL = nearestVertex(
    mesh,
    (p) => p[1] >= 0.82 && p[1] <= 0.9 && p[0] >= 0.06 && p[0] <= 0.14,
    (p) => -Math.hypot(p[0] - 0.1, p[2] + 0.09),
  );
  const kneeR = nearestVertex(
    mesh,
    (p) => p[1] >= 0.44 && p[1] <= 0.52 && p[0] < -0.12,
    (p) => -Math.hypot(p[0] + 0.177, p[2] + 0.1),
  );
  const kneeL = nearestVertex(
    mesh,
    (p) => p[1] >= 0.44 && p[1] <= 0.52 && p[0] > 0.12,
    (p) => -Math.hypot(p[0] - 0.177, p[2] + 0.1),
  );
  const ankleR = nearestVertex(
    mesh,
    (p) => p[1] >= 0.1 && p[1] <= 0.16 && p[0] < -0.18,
    (p) => -Math.hypot(p[0] + 0.23, p[2] + 0.1),
  );
  const ankleL = nearestVertex(
    mesh,
    (p) => p[1] >= 0.1 && p[1] <= 0.16 && p[0] > 0.18,
    (p) => -Math.hypot(p[0] - 0.23, p[2] + 0.1),
  );

  const pick = (hit, fallback) => roundArr(hit?.p ?? fallback);
  const yOf = (hit, fallback) => round3(hit?.p?.[1] ?? fallback);

  const landmarks = {
    model: "neutro_body_v1",
    sourceMesh: "public/models/production/neutro_body_v1.glb",
    sourceHash,
    coordinateSystem: {
      up: "+Y",
      front: "+Z",
      anatomicalLeft: "+X",
    },
    measurements: {
      bodyHeight: round3(height),
      min: roundArr([minX, minY, minZ]),
      max: roundArr([maxX, maxY, maxZ]),
      halfWidth: round3((maxX - minX) / 2),
      halfDepth: round3((maxZ - minZ) / 2),
    },
    points: {
      neckBaseFront: pick(neckBaseFront, [0, 1.452, 0.02]),
      neckBaseBack: pick(neckBaseBack, [0, 1.452, -0.12]),
      clavicleRight: pick(clavicleR, [-0.08, 1.39, 0.0]),
      clavicleLeft: pick(clavicleL, [0.08, 1.39, 0.0]),
      sternumTop: pick(sternumTop, [0, 1.36, 0.02]),
      sternumBottom: pick(sternumBottom, [0, 1.23, 0.03]),
      breastApexRight: pick(breastApexR, [-0.072, 1.268, 0.031]),
      breastApexLeft: pick(breastApexL, [0.072, 1.268, 0.031]),
      inframammaryMedialRight: pick(infraMedialR, [-0.03, 1.2, 0.02]),
      inframammaryLateralRight: pick(infraLateralR, [-0.1, 1.2, 0.0]),
      inframammaryMedialLeft: pick(infraMedialL, [0.03, 1.2, 0.02]),
      inframammaryLateralLeft: pick(infraLateralL, [0.1, 1.2, 0.0]),
      anteriorAxillaryFoldRight: pick(axillaAntR, [-0.16, 1.36, 0.0]),
      anteriorAxillaryFoldLeft: pick(axillaAntL, [0.16, 1.36, 0.0]),
      posteriorAxillaryFoldRight: pick(axillaPostR, [-0.15, 1.35, -0.1]),
      posteriorAxillaryFoldLeft: pick(axillaPostL, [0.15, 1.35, -0.1]),
      inferiorScapularLine: pick(scapularLine, [0, 1.08, -0.14]),
      waistFront: pick(waistFront, [0, 1.11, 0.05]),
      waistBack: pick(waistBack, [0, 1.11, -0.12]),
      iliacCrestRight: pick(iliacR, [-0.14, 0.92, -0.02]),
      iliacCrestLeft: pick(iliacL, [0.14, 0.92, -0.02]),
      shoulderRight: pick(shoulderR, [-0.2, 1.42, -0.1]),
      shoulderLeft: pick(shoulderL, [0.2, 1.42, -0.1]),
      elbowRight: pick(elbowR, [-0.28, 1.115, -0.09]),
      elbowLeft: pick(elbowL, [0.28, 1.115, -0.09]),
      wristRight: pick(wristR, [-0.33, 0.98, 0.15]),
      wristLeft: pick(wristL, [0.33, 0.98, 0.15]),
      hipRight: pick(hipR, [-0.1, 0.86, -0.09]),
      hipLeft: pick(hipL, [0.1, 0.86, -0.09]),
      kneeRight: pick(kneeR, [-0.177, 0.475, -0.1]),
      kneeLeft: pick(kneeL, [0.177, 0.475, -0.1]),
      ankleRight: pick(ankleR, [-0.229, 0.125, -0.1]),
      ankleLeft: pick(ankleL, [0.229, 0.125, -0.1]),
    },
    levels: {
      neckBase: yOf(neckBaseFront, 1.452),
      infraclavicular: yOf(clavicleR, 1.39),
      breastApex: yOf(breastApexR, 1.268),
      inframammary: yOf(infraMedialR, 1.2),
      inferiorScapular: yOf(scapularLine, 1.08),
      waist: yOf(waistFront, 1.11),
      iliacCrest: yOf(iliacR, 0.92),
    },
    ratios: {
      neckBase: round3(yOf(neckBaseFront, 1.452) / height),
      breastApex: round3(yOf(breastApexR, 1.268) / height),
      inframammary: round3(yOf(infraMedialR, 1.2) / height),
      waist: round3(yOf(waistFront, 1.11) / height),
    },
    axisZSamples: [1.0, 1.15, 1.25, 1.35, 1.45].map((y) => ({
      y,
      z: round3(axisZAt(mesh, y)),
    })),
  };

  // Annotate breast apex theta for authoring.
  const az = axisZAt(mesh, landmarks.levels.breastApex);
  landmarks.derived = {
    breastApexRightTheta: round3(thetaOf(landmarks.points.breastApexRight, az)),
    breastApexLeftTheta: round3(thetaOf(landmarks.points.breastApexLeft, az)),
    note: "theta = atan2(x, z - axisZ(y)) degrees; 0 = anterior/sternum",
  };

  mkdirSync(path.dirname(OUT), { recursive: true });
  writeFileSync(OUT, `${JSON.stringify(landmarks, null, 2)}\n`);
  console.log("wrote", path.relative(ROOT, OUT));
  console.log("height", landmarks.measurements.bodyHeight);
  console.log("breastApexR", landmarks.points.breastApexRight);
  console.log("infraMedialR", landmarks.points.inframammaryMedialRight);
  console.log("sternumTop", landmarks.points.sternumTop);
}

main();
