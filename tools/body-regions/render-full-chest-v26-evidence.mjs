/**
 * Full Chest V2.6 evidence — candidate sheets, finalist views, hit alignment.
 *
 * Every view uses the frozen V2.5 Geometry Distance Field visual path
 * (per-vertex distance + local refinement → geometry-field render), so the only
 * variable across images is the candidate boundary. Nothing is promoted.
 *
 *   node tools/body-regions/render-full-chest-v26-evidence.mjs
 */
import { mkdirSync } from "node:fs";
import path from "node:path";
import sharp from "sharp";
import {
  computeVertexNormals,
  frameCamera,
  makeMaskSampler,
  renderView,
} from "../body-mask/renderer.mjs";
import { buildDerivedMesh } from "./generate-full-chest-geometry-field.mjs";
import {
  buildBoundaryRefinement,
  buildHitProbes,
  buildV26Context,
  evaluateAllCandidates,
} from "./full-chest-v26.mjs";

const ROOT = path.resolve(import.meta.dirname, "..", "..");
const GLB = path.join(ROOT, "public/models/production/neutro_body_v1.glb");
const LANDMARKS = path.join(
  ROOT,
  "assets/body-regions/neutro_body_v1_landmarks.json",
);
const OFFICIAL_MASK = path.join(
  ROOT,
  "public/models/interaction/neutro_body_v1_anatomical_region_ids.png",
);
const OUT = path.join(ROOT, "artifacts/full-chest-v26");
const CAND = path.join(OUT, "candidates");
const FIN = path.join(OUT, "finalists");
const HIT = path.join(OUT, "hit-alignment");
const CHEST_INDEX = 9;
const RES = 4096;

const deg = (d) => (d * Math.PI) / 180;
const VIEWS = {
  front: [0, 0, 1],
  "front-right-45": [-Math.sin(deg(45)), 0, Math.cos(deg(45))],
  "front-left-45": [Math.sin(deg(45)), 0, Math.cos(deg(45))],
  "front-right-30": [-Math.sin(deg(30)), 0, Math.cos(deg(30))],
  "front-right-60": [-Math.sin(deg(60)), 0, Math.cos(deg(60))],
  "front-left-30": [Math.sin(deg(30)), 0, Math.cos(deg(30))],
  "front-left-60": [Math.sin(deg(60)), 0, Math.cos(deg(60))],
  "right-90": [-1, 0, 0],
  "left-90": [1, 0, 0],
};
const CANDIDATE_VIEWS = ["front", "front-right-45", "front-left-45", "right-90", "left-90"];
const FINALIST_VIEWS = [
  "front",
  "front-right-30",
  "front-right-60",
  "front-left-30",
  "front-left-60",
  "right-90",
  "left-90",
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

function labelSvg(width, text) {
  const esc = text.replace(/&/g, "&amp;").replace(/</g, "&lt;");
  return Buffer.from(
    `<svg width="${width}" height="34" xmlns="http://www.w3.org/2000/svg">` +
      `<rect x="0" y="0" width="${width}" height="34" fill="rgba(10,10,12,0.72)"/>` +
      `<text x="10" y="23" font-family="monospace" font-size="17" fill="#e8e8ea">${esc}</text>` +
      `</svg>`,
  );
}

async function labeled(pngBuffer, width, text, outFile) {
  const label = await sharp(labelSvg(width, text)).png().toBuffer();
  await sharp(pngBuffer)
    .composite([{ input: label, left: 0, top: 0 }])
    .png()
    .toFile(outFile);
}

function derivedFor(mesh, normals, field, r) {
  const refinement = buildBoundaryRefinement(mesh, r.values, r.bounds, field);
  return buildDerivedMesh(mesh, r.values, refinement, normals);
}

function renderGeometryField({ derived, normals, maskSampler, camera, width, height, ss }) {
  return renderView({
    mesh: derived.mesh,
    normals: derived.normals ?? normals,
    maskSampler,
    camera,
    highlightIndices: [CHEST_INDEX],
    width,
    height,
    visualMode: "geometry-field",
    vertexField: derived.values,
    supersample: ss,
  });
}

export async function renderV26Evidence() {
  mkdirSync(CAND, { recursive: true });
  mkdirSync(FIN, { recursive: true });
  mkdirSync(HIT, { recursive: true });

  const ctx = buildV26Context(GLB, LANDMARKS);
  const normals = computeVertexNormals(ctx.mesh);
  const mask = await readSingleChannel(OFFICIAL_MASK, RES);
  const maskSampler = makeMaskSampler(mask, RES);

  const { results, finalists } = evaluateAllCandidates(ctx);

  // Frame each view once on the official chest island for a stable comparison.
  const cameras = {};
  for (const key of Object.keys(VIEWS)) {
    cameras[key] = frameCamera(ctx.mesh, maskSampler.at, [CHEST_INDEX], VIEWS[key], {
      padding: 1.15,
    });
  }

  const cw = 560;
  const ch = 680;

  // --- Candidates (§9): 5 views each + contact sheets ---
  const candidatePanels = {};
  for (const key of CANDIDATE_VIEWS) candidatePanels[key] = [];
  for (const r of results) {
    const derived = derivedFor(ctx.mesh, normals, ctx.field, r);
    const tag =
      `${r.id}  infra=${(r.params.infraclavicularOffset * 1000).toFixed(0)}mm ` +
      `rise=${(r.params.upperCenterRise * 1000).toFixed(0)}mm ` +
      `imf=${(r.params.inferiorCenterTransition * 1000).toFixed(0)}mm ` +
      `${r.pass ? "PASS" : "FAIL"}`;
    for (const key of CANDIDATE_VIEWS) {
      const buf = await renderGeometryField({
        derived,
        normals,
        maskSampler,
        camera: cameras[key],
        width: cw,
        height: ch,
        ss: 3,
      }).toBuffer();
      const outFile = path.join(CAND, `${r.id}-${key}.png`);
      await labeled(buf, cw, tag, outFile);
      candidatePanels[key].push({ id: r.id, file: outFile });
    }
    console.log("candidate", r.id, r.pass ? "PASS" : "FAIL");
  }

  // Contact sheets: 4 columns × 2 rows.
  const contactMap = {
    front: "contact-front.png",
    "front-right-45": "contact-front-right.png",
    "front-left-45": "contact-front-left.png",
    "right-90": "contact-right.png",
    "left-90": "contact-left.png",
  };
  for (const [key, name] of Object.entries(contactMap)) {
    const panels = candidatePanels[key];
    const cols = 4;
    const rows = Math.ceil(panels.length / cols);
    const gap = 12;
    const tiles = [];
    for (let i = 0; i < panels.length; i++) {
      tiles.push({
        input: await sharp(panels[i].file).resize(cw, ch + 34).png().toBuffer(),
        left: (i % cols) * (cw + gap),
        top: Math.floor(i / cols) * (ch + 34 + gap),
      });
    }
    await sharp({
      create: {
        width: cols * cw + (cols - 1) * gap,
        height: rows * (ch + 34) + (rows - 1) * gap,
        channels: 3,
        background: { r: 12, g: 12, b: 14 },
      },
    })
      .composite(tiles)
      .png()
      .toFile(path.join(OUT, name));
    console.log("contact", name);
  }

  // --- Finalists (§10): 7 views + a browser-parity front ---
  for (const id of finalists) {
    const r = results.find((x) => x.id === id);
    const derived = derivedFor(ctx.mesh, normals, ctx.field, r);
    const tag =
      `${r.id}  infra=${(r.params.infraclavicularOffset * 1000).toFixed(0)}mm ` +
      `rise=${(r.params.upperCenterRise * 1000).toFixed(0)}mm ` +
      `imf=${(r.params.inferiorCenterTransition * 1000).toFixed(0)}mm`;
    for (const key of FINALIST_VIEWS) {
      const buf = await renderGeometryField({
        derived,
        normals,
        maskSampler,
        camera: cameras[key],
        width: 900,
        height: 1080,
        ss: 4,
      }).toBuffer();
      await labeled(buf, 900, tag, path.join(FIN, `${r.id}-${key}.png`));
    }
    // Runtime-parity front (geometry-field == shader path, promotion deferred).
    const browserBuf = await renderGeometryField({
      derived,
      normals,
      maskSampler,
      camera: cameras.front,
      width: 900,
      height: 1080,
      ss: 4,
    }).toBuffer();
    await labeled(browserBuf, 900, `${r.id} browser-parity front`, path.join(FIN, `${r.id}-browser-front.png`));
    console.log("finalist", id);
  }

  // --- Hit alignment (§13): probe markers on the approved candidate ---
  const approvedId = finalists[0];
  const rApproved = results.find((x) => x.id === approvedId);
  const derivedApproved = derivedFor(ctx.mesh, normals, ctx.field, rApproved);
  const probes = buildHitProbes(ctx.mesh, ctx.lm, rApproved.bounds, ctx.field, rApproved.values);
  const hitWidth = 900;
  const hitHeight = 1080;
  for (const key of ["front", "right-90", "left-90"]) {
    const baseBuf = await renderGeometryField({
      derived: derivedApproved,
      normals,
      maskSampler,
      camera: cameras[key],
      width: hitWidth,
      height: hitHeight,
      ss: 2,
    }).toBuffer();
    const raw = await sharp(baseBuf).removeAlpha().raw().toBuffer({ resolveWithObject: true });
    const buf = Buffer.from(raw.data);
    const paint = (pt, rgb) => {
      const scr = projectToPixels(pt, cameras[key], hitWidth, hitHeight);
      if (!scr) return;
      const cx = Math.round(scr.x);
      const cy = Math.round(scr.y);
      for (let dy = -6; dy <= 6; dy++) {
        for (let dx = -6; dx <= 6; dx++) {
          if (dx * dx + dy * dy > 36) continue;
          const x = cx + dx;
          const y = cy + dy;
          if (x < 0 || y < 0 || x >= hitWidth || y >= hitHeight) continue;
          const o = (y * hitWidth + x) * 3;
          buf[o] = rgb[0];
          buf[o + 1] = rgb[1];
          buf[o + 2] = rgb[2];
        }
      }
    };
    for (const pt of Object.values(probes.interior)) paint(pt, [46, 204, 113]);
    for (const pt of Object.values(probes.exterior)) paint(pt, [231, 76, 60]);
    const composed = await sharp(buf, {
      raw: { width: hitWidth, height: hitHeight, channels: 3 },
    })
      .png()
      .toBuffer();
    await labeled(
      composed,
      hitWidth,
      `${approvedId} hit-alignment ${key} (green=chest, red=outside)`,
      path.join(HIT, `hit-${key}.png`),
    );
    console.log("hit-alignment", key);
  }

  console.log("V26_EVIDENCE_OK", OUT);
}

const invoked = process.argv[1]?.replace(/\\/g, "/");
if (invoked?.endsWith("/render-full-chest-v26-evidence.mjs")) {
  renderV26Evidence().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
