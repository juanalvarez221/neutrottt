/**
 * Minimal GLB writer for multi-mesh POSITION overlays (no materials required).
 */
import { writeFileSync } from "node:fs";

function align4(n) {
  return (n + 3) & ~3;
}

function encodeJson(obj) {
  return Buffer.from(JSON.stringify(obj), "utf8");
}

/**
 * @param {{ name: string, positions: Float32Array, indices: Uint32Array }[]} meshes
 */
export function writeHighlightGlb(filePath, meshes) {
  const binParts = [];
  const bufferViews = [];
  const accessors = [];
  const gltfMeshes = [];
  const nodes = [];
  let byteOffset = 0;

  for (const mesh of meshes) {
    const pos = mesh.positions;
    const idx = mesh.indices;
    if (!idx.length) continue;

    let minX = Infinity;
    let minY = Infinity;
    let minZ = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    let maxZ = -Infinity;
    for (let i = 0; i < pos.length; i += 3) {
      minX = Math.min(minX, pos[i]);
      minY = Math.min(minY, pos[i + 1]);
      minZ = Math.min(minZ, pos[i + 2]);
      maxX = Math.max(maxX, pos[i]);
      maxY = Math.max(maxY, pos[i + 1]);
      maxZ = Math.max(maxZ, pos[i + 2]);
    }

    const posBytes = Buffer.from(pos.buffer, pos.byteOffset, pos.byteLength);
    const idxBytes = Buffer.from(idx.buffer, idx.byteOffset, idx.byteLength);

    const posPad = align4(posBytes.length) - posBytes.length;
    const idxPad = align4(idxBytes.length) - idxBytes.length;

    const posView = bufferViews.length;
    bufferViews.push({
      buffer: 0,
      byteOffset,
      byteLength: posBytes.length,
      target: 34962,
    });
    binParts.push(posBytes);
    if (posPad) binParts.push(Buffer.alloc(posPad));
    byteOffset += posBytes.length + posPad;

    const idxView = bufferViews.length;
    bufferViews.push({
      buffer: 0,
      byteOffset,
      byteLength: idxBytes.length,
      target: 34963,
    });
    binParts.push(idxBytes);
    if (idxPad) binParts.push(Buffer.alloc(idxPad));
    byteOffset += idxBytes.length + idxPad;

    const posAcc = accessors.length;
    accessors.push({
      bufferView: posView,
      componentType: 5126,
      count: pos.length / 3,
      type: "VEC3",
      max: [maxX, maxY, maxZ],
      min: [minX, minY, minZ],
    });
    const idxAcc = accessors.length;
    accessors.push({
      bufferView: idxView,
      componentType: 5125,
      count: idx.length,
      type: "SCALAR",
    });

    const meshIndex = gltfMeshes.length;
    gltfMeshes.push({
      name: mesh.name,
      primitives: [
        {
          attributes: { POSITION: posAcc },
          indices: idxAcc,
          mode: 4,
        },
      ],
    });
    nodes.push({ name: mesh.name, mesh: meshIndex });
  }

  const binBuffer = Buffer.concat(binParts);
  const json = {
    asset: { version: "2.0", generator: "neutro-anatomical-overlay" },
    scenes: [{ nodes: nodes.map((_, i) => i) }],
    scene: 0,
    nodes,
    meshes: gltfMeshes,
    accessors,
    bufferViews,
    buffers: [{ byteLength: binBuffer.length }],
  };

  let jsonBuf = encodeJson(json);
  const jsonPad = align4(jsonBuf.length) - jsonBuf.length;
  if (jsonPad) jsonBuf = Buffer.concat([jsonBuf, Buffer.alloc(jsonPad, 0x20)]);

  const total = 12 + 8 + jsonBuf.length + 8 + binBuffer.length;
  const out = Buffer.alloc(total);
  out.writeUInt32LE(0x46546c67, 0); // glTF
  out.writeUInt32LE(2, 4);
  out.writeUInt32LE(total, 8);
  out.writeUInt32LE(jsonBuf.length, 12);
  out.writeUInt32LE(0x4e4f534a, 16); // JSON
  jsonBuf.copy(out, 20);
  const binStart = 20 + jsonBuf.length;
  out.writeUInt32LE(binBuffer.length, binStart);
  out.writeUInt32LE(0x004e4942, binStart + 4); // BIN
  binBuffer.copy(out, binStart + 8);
  writeFileSync(filePath, out);
}
