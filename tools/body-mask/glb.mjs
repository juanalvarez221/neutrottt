import { readFileSync } from "node:fs";

const COMPONENT_TYPES = {
  5120: Int8Array,
  5121: Uint8Array,
  5122: Int16Array,
  5123: Uint16Array,
  5125: Uint32Array,
  5126: Float32Array,
};

const TYPE_COUNTS = {
  SCALAR: 1,
  VEC2: 2,
  VEC3: 3,
  VEC4: 4,
  MAT4: 16,
};

export function parseGlb(path) {
  const buffer = readFileSync(path);
  if (buffer.readUInt32LE(0) !== 0x46546c67) {
    throw new Error(`not a glb: ${path}`);
  }

  let offset = 12;
  let json = null;
  let bin = null;

  while (offset < buffer.length) {
    const length = buffer.readUInt32LE(offset);
    const type = buffer.readUInt32LE(offset + 4);
    const start = offset + 8;
    if (type === 0x4e4f534a) {
      json = JSON.parse(buffer.subarray(start, start + length).toString("utf8"));
    } else if (type === 0x004e4942) {
      bin = buffer.subarray(start, start + length);
    }
    offset = start + length;
  }

  if (!json) throw new Error("missing json chunk");
  return { json, bin };
}

export function readAccessor(gltf, index) {
  const { json, bin } = gltf;
  const accessor = json.accessors[index];
  const ArrayType = COMPONENT_TYPES[accessor.componentType];
  const components = TYPE_COUNTS[accessor.type];
  const count = accessor.count;

  if (accessor.bufferView === undefined) {
    return { data: new ArrayType(count * components), components, count };
  }

  const view = json.bufferViews[accessor.bufferView];
  const base = (view.byteOffset ?? 0) + (accessor.byteOffset ?? 0);
  const elementSize = ArrayType.BYTES_PER_ELEMENT * components;
  const stride = view.byteStride ?? elementSize;
  const out = new ArrayType(count * components);

  for (let i = 0; i < count; i++) {
    const byteStart = base + i * stride;
    for (let c = 0; c < components; c++) {
      const at = byteStart + c * ArrayType.BYTES_PER_ELEMENT;
      switch (accessor.componentType) {
        case 5126:
          out[i * components + c] = bin.readFloatLE(at);
          break;
        case 5125:
          out[i * components + c] = bin.readUInt32LE(at);
          break;
        case 5123:
          out[i * components + c] = bin.readUInt16LE(at);
          break;
        case 5121:
          out[i * components + c] = bin.readUInt8(at);
          break;
        case 5122:
          out[i * components + c] = bin.readInt16LE(at);
          break;
        case 5120:
          out[i * components + c] = bin.readInt8(at);
          break;
        default:
          throw new Error(`unsupported componentType ${accessor.componentType}`);
      }
    }
  }

  return { data: out, components, count };
}

function multiply(a, b) {
  const out = new Float64Array(16);
  for (let c = 0; c < 4; c++) {
    for (let r = 0; r < 4; r++) {
      let sum = 0;
      for (let k = 0; k < 4; k++) sum += a[k * 4 + r] * b[c * 4 + k];
      out[c * 4 + r] = sum;
    }
  }
  return out;
}

function trsMatrix(node) {
  if (node.matrix) return Float64Array.from(node.matrix);
  const [tx, ty, tz] = node.translation ?? [0, 0, 0];
  const [qx, qy, qz, qw] = node.rotation ?? [0, 0, 0, 1];
  const [sx, sy, sz] = node.scale ?? [1, 1, 1];

  const x2 = qx + qx;
  const y2 = qy + qy;
  const z2 = qz + qz;
  const xx = qx * x2;
  const xy = qx * y2;
  const xz = qx * z2;
  const yy = qy * y2;
  const yz = qy * z2;
  const zz = qz * z2;
  const wx = qw * x2;
  const wy = qw * y2;
  const wz = qw * z2;

  return Float64Array.from([
    (1 - (yy + zz)) * sx, (xy + wz) * sx, (xz - wy) * sx, 0,
    (xy - wz) * sy, (1 - (xx + zz)) * sy, (yz + wx) * sy, 0,
    (xz + wy) * sz, (yz - wx) * sz, (1 - (xx + yy)) * sz, 0,
    tx, ty, tz, 1,
  ]);
}

function applyMatrix(m, x, y, z) {
  return [
    m[0] * x + m[4] * y + m[8] * z + m[12],
    m[1] * x + m[5] * y + m[9] * z + m[13],
    m[2] * x + m[6] * y + m[10] * z + m[14],
  ];
}

/**
 * Flattens every mesh primitive into a single world-space triangle soup.
 */
export function loadMeshData(path) {
  const gltf = parseGlb(path);
  const { json } = gltf;

  const positions = [];
  const uvs = [];
  const indices = [];
  const primitives = [];
  let hasUv = true;
  let vertexOffset = 0;

  const walk = (nodeIndex, parentMatrix) => {
    const node = json.nodes[nodeIndex];
    const matrix = multiply(parentMatrix, trsMatrix(node));

    if (node.mesh !== undefined) {
      for (const primitive of json.meshes[node.mesh].primitives) {
        const pos = readAccessor(gltf, primitive.attributes.POSITION);
        const uvIndex = primitive.attributes.TEXCOORD_0;
        const uv = uvIndex === undefined ? null : readAccessor(gltf, uvIndex);
        if (!uv) hasUv = false;

        const primStart = indices.length / 3;

        for (let i = 0; i < pos.count; i++) {
          const [x, y, z] = applyMatrix(
            matrix,
            pos.data[i * 3],
            pos.data[i * 3 + 1],
            pos.data[i * 3 + 2],
          );
          positions.push(x, y, z);
          uvs.push(uv ? uv.data[i * 2] : 0, uv ? uv.data[i * 2 + 1] : 0);
        }

        if (primitive.indices !== undefined) {
          const idx = readAccessor(gltf, primitive.indices);
          for (let i = 0; i < idx.count; i++) indices.push(vertexOffset + idx.data[i]);
        } else {
          for (let i = 0; i < pos.count; i++) indices.push(vertexOffset + i);
        }

        primitives.push({
          name: node.name ?? `mesh_${node.mesh}`,
          triStart: primStart,
          triCount: indices.length / 3 - primStart,
        });
        vertexOffset += pos.count;
      }
    }

    for (const child of node.children ?? []) walk(child, matrix);
  };

  const identity = Float64Array.from([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
  const scene = json.scenes[json.scene ?? 0];
  for (const nodeIndex of scene.nodes) walk(nodeIndex, identity);

  return {
    positions: Float64Array.from(positions),
    uvs: Float64Array.from(uvs),
    indices: Uint32Array.from(indices),
    triangleCount: indices.length / 3,
    vertexCount: positions.length / 3,
    hasUv,
    primitives,
  };
}

export function triangleCentroidUv(mesh, tri) {
  const a = mesh.indices[tri * 3];
  const b = mesh.indices[tri * 3 + 1];
  const c = mesh.indices[tri * 3 + 2];
  return [
    (mesh.uvs[a * 2] + mesh.uvs[b * 2] + mesh.uvs[c * 2]) / 3,
    (mesh.uvs[a * 2 + 1] + mesh.uvs[b * 2 + 1] + mesh.uvs[c * 2 + 1]) / 3,
  ];
}

export function triangleCentroid(mesh, tri) {
  const a = mesh.indices[tri * 3];
  const b = mesh.indices[tri * 3 + 1];
  const c = mesh.indices[tri * 3 + 2];
  return [
    (mesh.positions[a * 3] + mesh.positions[b * 3] + mesh.positions[c * 3]) / 3,
    (mesh.positions[a * 3 + 1] + mesh.positions[b * 3 + 1] + mesh.positions[c * 3 + 1]) / 3,
    (mesh.positions[a * 3 + 2] + mesh.positions[b * 3 + 2] + mesh.positions[c * 3 + 2]) / 3,
  ];
}

export function triangleArea(mesh, tri) {
  const a = mesh.indices[tri * 3];
  const b = mesh.indices[tri * 3 + 1];
  const c = mesh.indices[tri * 3 + 2];
  const ax = mesh.positions[a * 3];
  const ay = mesh.positions[a * 3 + 1];
  const az = mesh.positions[a * 3 + 2];
  const ux = mesh.positions[b * 3] - ax;
  const uy = mesh.positions[b * 3 + 1] - ay;
  const uz = mesh.positions[b * 3 + 2] - az;
  const vx = mesh.positions[c * 3] - ax;
  const vy = mesh.positions[c * 3 + 1] - ay;
  const vz = mesh.positions[c * 3 + 2] - az;
  const cx = uy * vz - uz * vy;
  const cy = uz * vx - ux * vz;
  const cz = ux * vy - uy * vx;
  return 0.5 * Math.hypot(cx, cy, cz);
}

export function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}
