/**
 * Full Chest V2.5 evidence — Binary UV vs SDF UV (V2.4) vs Geometry Field.
 * Same camera and same supersampling per view so the only variable is the
 * visual authority.
 *
 *   node tools/body-regions/render-full-chest-v25-evidence.mjs
 */
import { mkdirSync, readFileSync } from "node:fs";
import path from "node:path";
import sharp from "sharp";
import { loadMeshData } from "../body-mask/glb.mjs";
import {
  computeVertexNormals,
  frameCamera,
  makeMaskSampler,
  makeSdfSampler,
  renderView,
} from "../body-mask/renderer.mjs";
import {
  buildDerivedMesh,
  decodeSnorm16,
} from "./generate-full-chest-geometry-field.mjs";

const ROOT = path.resolve(import.meta.dirname, "..", "..");
const GLB = path.join(ROOT, "public/models/production/neutro_body_v1.glb");
const OUT = path.join(ROOT, "artifacts/full-chest-v25");
const CMP = path.join(OUT, "comparison");
const V24_SDF = path.join(
  ROOT,
  "artifacts/full-chest-v24/full_chest_surface_sdf_r8.png",
);
const V22_MASK = path.join(
  ROOT,
  "artifacts/full-chest-v22/temp-runtime-mask.png",
);
const OFFICIAL_MASK = path.join(
  ROOT,
  "public/models/interaction/neutro_body_v1_anatomical_region_ids.png",
);
const LANDMARKS = path.join(
  ROOT,
  "assets/body-regions/neutro_body_v1_landmarks.json",
);
const CHEST_INDEX = 9;
const RES = 4096;
const WIDTH = 900;
const HEIGHT = 1080;
const SS = 4;

const deg = (d) => (d * Math.PI) / 180;
const VIEWS = {
  front: [0, 0, 1],
  right_30: [-Math.sin(deg(30)), 0, Math.cos(deg(30))],
  right_60: [-Math.sin(deg(60)), 0, Math.cos(deg(60))],
  right_80: [-Math.sin(deg(80)), 0, Math.cos(deg(80))],
  right_90: [-1, 0, 0],
  left_30: [Math.sin(deg(30)), 0, Math.cos(deg(30))],
  left_60: [Math.sin(deg(60)), 0, Math.cos(deg(60))],
  left_80: [Math.sin(deg(80)), 0, Math.cos(deg(80))],
  left_90: [1, 0, 0],
};

const TRIPLETS = [
  ["front", "01-front-binary.png", "02-front-sdf-uv.png", "03-front-geometry-field.png"],
  ["right_30", "04-right-30-binary.png", "05-right-30-sdf-uv.png", "06-right-30-geometry-field.png"],
  ["right_60", "07-right-60-binary.png", "08-right-60-sdf-uv.png", "09-right-60-geometry-field.png"],
  ["right_80", "10-right-80-binary.png", "11-right-80-sdf-uv.png", "12-right-80-geometry-field.png"],
  ["right_90", "13-right-90-binary.png", "14-right-90-sdf-uv.png", "15-right-90-geometry-field.png"],
  ["left_30", "16-left-30-binary.png", "17-left-30-sdf-uv.png", "18-left-30-geometry-field.png"],
  ["left_60", "19-left-60-binary.png", "20-left-60-sdf-uv.png", "21-left-60-geometry-field.png"],
  ["left_80", "22-left-80-binary.png", "23-left-80-sdf-uv.png", "24-left-80-geometry-field.png"],
  ["left_90", "25-left-90-binary.png", "26-left-90-sdf-uv.png", "27-left-90-geometry-field.png"],
];

async function readSingleChannel(file, size) {
  const { data, info } = await sharp(file)
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const ch = info.channels || 1;
  const out = Buffer.alloc(size * size);
  for (let i = 0; i < size * size; i++) out[i] = data[i * ch];
  return out;
}

function projectToPixels(point, camera, width, height) {
  const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
  const norm = (v) => {
    const l = Math.hypot(v[0], v[1], v[2]) || 1;
    return [v[0] / l, v[1] / l, v[2] / l];
  };
  const cross = (a, b) => [
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0],
  ];
  const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  const forward = norm(sub(camera.target, camera.position));
  const right = norm(cross(forward, [0, 1, 0]));
  const up = cross(right, forward);
  const tanHalf = Math.tan((camera.fov * Math.PI) / 360);
  const aspect = width / height;
  const rel = sub(point, camera.position);
  const zc = dot(rel, forward);
  if (zc <= 0.001) return null;
  return {
    x: ((dot(rel, right) / (zc * tanHalf * aspect)) * 0.5 + 0.5) * width,
    y: (0.5 - (dot(rel, up) / (zc * tanHalf)) * 0.5) * height,
  };
}

async function tripleCrop(files, center, outFile, half = 70) {
  const panels = [];
  for (const file of files) {
    const meta = await sharp(file).metadata();
    const left = Math.max(0, Math.min(meta.width - 2 * half, center.x - half));
    const top = Math.max(0, Math.min(meta.height - 2 * half, center.y - half));
    panels.push(
      await sharp(file)
        .extract({
          left: Math.round(left),
          top: Math.round(top),
          width: 2 * half,
          height: 2 * half,
        })
        .resize(2 * half * 4, 2 * half * 4, { kernel: "nearest" })
        .png()
        .toBuffer(),
    );
  }
  const w = 2 * half * 4;
  const h = 2 * half * 4;
  await sharp({
    create: {
      width: w * panels.length + 24 * (panels.length - 1),
      height: h,
      channels: 3,
      background: { r: 12, g: 12, b: 14 },
    },
  })
    .composite(
      panels.map((input, i) => ({ input, left: i * (w + 24), top: 0 })),
    )
    .png()
    .toFile(outFile);
}

export async function renderV25Evidence() {
  mkdirSync(CMP, { recursive: true });

  const lm = JSON.parse(readFileSync(LANDMARKS, "utf8"));
  const mesh = loadMeshData(GLB);
  const normals = computeVertexNormals(mesh);

  const manifest = JSON.parse(
    readFileSync(
      path.join(OUT, "neutro_body_v1_region_fields.json"),
      "utf8",
    ),
  );
  const entry = manifest.fields[0];
  const sidecar = readFileSync(
    path.join(ROOT, "public/models/interaction/fields", path.basename(entry.fieldUrl)),
  );
  const vertexField =
    entry.encoding === "snorm16"
      ? decodeSnorm16(sidecar, entry.vertexCount, entry.distanceRangeMeters)
      : new Float32Array(
          sidecar.buffer,
          sidecar.byteOffset,
          entry.vertexCount,
        );
  if (vertexField.length !== mesh.vertexCount) {
    throw new Error(
      `GEOMETRY_FIELD_MISMATCH ${vertexField.length} vs ${mesh.vertexCount}`,
    );
  }

  // Runtime parity: geometry-field views render the locally refined overlay.
  const refineBuffer = readFileSync(
    path.join(
      ROOT,
      "public/models/interaction/fields",
      path.basename(entry.refinement.url),
    ),
  );
  const refineCount = refineBuffer.length / 10;
  const refinement = { triangles: [], midValues: [] };
  for (let i = 0; i < refineCount; i++) {
    refinement.triangles.push(refineBuffer.readUInt32LE(i * 10));
    for (let k = 0; k < 3; k++) {
      refinement.midValues.push(
        (refineBuffer.readInt16LE(i * 10 + 4 + k * 2) / 32767) *
          entry.distanceRangeMeters,
      );
    }
  }
  const derived = buildDerivedMesh(mesh, vertexField, refinement, normals);
  console.log(
    "refined triangles",
    refineCount,
    "->",
    derived.mesh.triangleCount,
    "total",
  );

  // Categorical mask: official IDs with the V2.2 temp chest island when present.
  const mask = await readSingleChannel(OFFICIAL_MASK, RES);
  try {
    const v22 = await readSingleChannel(V22_MASK, RES);
    for (let i = 0; i < RES * RES; i++) {
      if (v22[i] === CHEST_INDEX) mask[i] = CHEST_INDEX;
    }
  } catch {
    /* official only */
  }

  const sdfEncoded = new Float32Array(RES * RES);
  const sdfRaw = await readSingleChannel(V24_SDF, RES);
  for (let i = 0; i < RES * RES; i++) sdfEncoded[i] = sdfRaw[i] / 255;

  const maskSampler = makeMaskSampler(mask, RES);
  const sdfSampler = makeSdfSampler(sdfEncoded, RES);

  const cameras = {};
  for (const [viewKey, binary, sdfUv, geom] of TRIPLETS) {
    const camera = frameCamera(
      mesh,
      maskSampler.at,
      [CHEST_INDEX],
      VIEWS[viewKey],
      { padding: 1.15 },
    );
    cameras[viewKey] = camera;
    const common = {
      mesh,
      normals,
      maskSampler,
      camera,
      highlightIndices: [CHEST_INDEX],
      width: WIDTH,
      height: HEIGHT,
      supersample: SS,
    };
    console.log("render", viewKey);
    await renderView({ ...common, visualMode: "binary-debug" }).toFile(
      path.join(CMP, binary),
    );
    await renderView({
      ...common,
      visualMode: "sdf-visual",
      sdfSampler,
      sdfRangeMeters: 0.012,
    }).toFile(path.join(CMP, sdfUv));
    await renderView({
      ...common,
      mesh: derived.mesh,
      normals: derived.normals ?? normals,
      visualMode: "geometry-field",
      vertexField: derived.values,
    }).toFile(path.join(CMP, geom));
  }

  // Axillary zoom composites: binary | sdf-uv | geometry-field
  const axR = lm.points.anteriorAxillaryFoldRight;
  const axL = lm.points.anteriorAxillaryFoldLeft;
  const rightCenter =
    projectToPixels(axR, cameras.right_60, WIDTH, HEIGHT) ??
    { x: WIDTH / 2, y: HEIGHT / 2 };
  const leftCenter =
    projectToPixels(axL, cameras.left_60, WIDTH, HEIGHT) ??
    { x: WIDTH / 2, y: HEIGHT / 2 };

  await tripleCrop(
    [
      path.join(CMP, "07-right-60-binary.png"),
      path.join(CMP, "08-right-60-sdf-uv.png"),
      path.join(CMP, "09-right-60-geometry-field.png"),
    ],
    rightCenter,
    path.join(CMP, "33-right-axillary-edge-4x.png"),
  );
  await tripleCrop(
    [
      path.join(CMP, "19-left-60-binary.png"),
      path.join(CMP, "20-left-60-sdf-uv.png"),
      path.join(CMP, "21-left-60-geometry-field.png"),
    ],
    leftCenter,
    path.join(CMP, "34-left-axillary-edge-4x.png"),
  );

  console.log("V25_EVIDENCE_OK", CMP);
}

const invoked = process.argv[1]?.replace(/\\/g, "/");
if (invoked?.endsWith("/render-full-chest-v25-evidence.mjs")) {
  renderV25Evidence().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
