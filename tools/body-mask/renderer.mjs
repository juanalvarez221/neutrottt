import sharp from "sharp";

const SKIN = [0.831, 0.808, 0.784];
const BACKGROUND = [0.353, 0.365, 0.392];
const HIGHLIGHT = [0.909, 0.659, 0.251];
const HIGHLIGHT_STRENGTH = 0.62;
const KEY_LIGHT = normalize([0.35, 0.55, 0.75]);
const FILL_LIGHT = normalize([-0.5, 0.1, -0.6]);
const SUPERSAMPLE = 2;

function normalize(v) {
  const l = Math.hypot(v[0], v[1], v[2]) || 1;
  return [v[0] / l, v[1] / l, v[2] / l];
}

function sub(a, b) {
  return [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
}

function cross(a, b) {
  return [
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0],
  ];
}

function dot(a, b) {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

export function computeVertexNormals(mesh) {
  const normals = new Float64Array(mesh.vertexCount * 3);
  for (let t = 0; t < mesh.triangleCount; t++) {
    const i0 = mesh.indices[t * 3];
    const i1 = mesh.indices[t * 3 + 1];
    const i2 = mesh.indices[t * 3 + 2];
    const a = [mesh.positions[i0 * 3], mesh.positions[i0 * 3 + 1], mesh.positions[i0 * 3 + 2]];
    const b = [mesh.positions[i1 * 3], mesh.positions[i1 * 3 + 1], mesh.positions[i1 * 3 + 2]];
    const c = [mesh.positions[i2 * 3], mesh.positions[i2 * 3 + 1], mesh.positions[i2 * 3 + 2]];
    const n = cross(sub(b, a), sub(c, a));
    for (const i of [i0, i1, i2]) {
      normals[i * 3] += n[0];
      normals[i * 3 + 1] += n[1];
      normals[i * 3 + 2] += n[2];
    }
  }
  for (let i = 0; i < mesh.vertexCount; i++) {
    const n = normalize([normals[i * 3], normals[i * 3 + 1], normals[i * 3 + 2]]);
    normals[i * 3] = n[0];
    normals[i * 3 + 1] = n[1];
    normals[i * 3 + 2] = n[2];
  }
  return normals;
}

/**
 * Frames a camera on the surface covered by `focusIndices`, falling back to the
 * whole mesh. `direction` is the unit vector from the target to the camera.
 */
export function frameCamera(mesh, maskSampler, focusIndices, direction, options = {}) {
  const padding = options.padding ?? 1.55;
  const fov = options.fov ?? 32;
  const focus = new Set(focusIndices);
  let min = [Infinity, Infinity, Infinity];
  let max = [-Infinity, -Infinity, -Infinity];
  let found = false;

  for (let t = 0; t < mesh.triangleCount; t++) {
    const centroid = [0, 0, 0];
    let uvU = 0;
    let uvV = 0;
    for (let k = 0; k < 3; k++) {
      const vi = mesh.indices[t * 3 + k];
      centroid[0] += mesh.positions[vi * 3] / 3;
      centroid[1] += mesh.positions[vi * 3 + 1] / 3;
      centroid[2] += mesh.positions[vi * 3 + 2] / 3;
      uvU += mesh.uvs[vi * 2] / 3;
      uvV += mesh.uvs[vi * 2 + 1] / 3;
    }
    if (focus.size && !focus.has(maskSampler(uvU, uvV))) continue;
    found = true;
    for (let i = 0; i < 3; i++) {
      min[i] = Math.min(min[i], centroid[i]);
      max[i] = Math.max(max[i], centroid[i]);
    }
  }

  if (!found) {
    min = [-0.37, 0, -0.24];
    max = [0.37, 1.735, 0.24];
  }

  const target = [(min[0] + max[0]) / 2, (min[1] + max[1]) / 2, (min[2] + max[2]) / 2];
  const extent = Math.max(max[0] - min[0], max[1] - min[1], max[2] - min[2], 0.09);
  const distance = ((extent * padding) / 2 / Math.tan((fov * Math.PI) / 360)) + extent * 0.5;
  const dir = normalize(direction);
  const position = [
    target[0] + dir[0] * distance,
    target[1] + dir[1] * distance,
    target[2] + dir[2] * distance,
  ];
  return { target, position, fov };
}

export function renderView({
  mesh,
  normals,
  maskSampler,
  camera,
  width = 864,
  height = 1024,
  highlightIndices = [],
  /** binary-debug | final-visual | sdf-visual | geometry-field */
  visualMode = "binary-debug",
  /** Optional SDF sampler: sample(u,v) → normalized [0,1] with 0.5 = boundary. */
  sdfSampler = null,
  sdfRangeMeters = 0.012,
  /**
   * Optional per-fragment analytical SDF: (x,y,z) => meters signed distance.
   * When set with sdf-visual, preferred over texture (continuous, no UV stairs).
   */
  sdfAnalytical = null,
  /** Per-vertex signed distance in meters (geometry-field mode). */
  vertexField = null,
  fieldMinAaMeters = 0.00025,
  fieldMaxAaMeters = 0.0015,
  supersample = null,
}) {
  const ss =
    supersample ??
    (visualMode === "final-visual" ||
    visualMode === "sdf-visual" ||
    visualMode === "geometry-field"
      ? 4
      : SUPERSAMPLE);
  const W = width * ss;
  const H = height * ss;
  const color = new Float32Array(W * H * 3);
  const depth = new Float32Array(W * H).fill(Infinity);

  for (let i = 0; i < W * H; i++) {
    color[i * 3] = BACKGROUND[0];
    color[i * 3 + 1] = BACKGROUND[1];
    color[i * 3 + 2] = BACKGROUND[2];
  }

  const forward = normalize(sub(camera.target, camera.position));
  const right = normalize(cross(forward, [0, 1, 0]));
  const up = cross(right, forward);
  const tanHalf = Math.tan((camera.fov * Math.PI) / 360);
  const aspect = W / H;
  const highlight = new Set(highlightIndices);

  const project = (p) => {
    const rel = sub(p, camera.position);
    const zc = dot(rel, forward);
    if (zc <= 0.001) return null;
    const xc = dot(rel, right);
    const yc = dot(rel, up);
    return {
      x: ((xc / (zc * tanHalf * aspect)) * 0.5 + 0.5) * W,
      y: (0.5 - (yc / (zc * tanHalf)) * 0.5) * H,
      z: zc,
    };
  };

  for (let t = 0; t < mesh.triangleCount; t++) {
    const idx = [mesh.indices[t * 3], mesh.indices[t * 3 + 1], mesh.indices[t * 3 + 2]];
    const verts = idx.map((i) => [
      mesh.positions[i * 3],
      mesh.positions[i * 3 + 1],
      mesh.positions[i * 3 + 2],
    ]);
    const screen = verts.map(project);
    if (screen.some((s) => s === null)) continue;

    const minX = Math.max(0, Math.floor(Math.min(...screen.map((s) => s.x))));
    const maxX = Math.min(W - 1, Math.ceil(Math.max(...screen.map((s) => s.x))));
    const minY = Math.max(0, Math.floor(Math.min(...screen.map((s) => s.y))));
    const maxY = Math.min(H - 1, Math.ceil(Math.max(...screen.map((s) => s.y))));
    if (minX > maxX || minY > maxY) continue;

    const [s0, s1, s2] = screen;
    const denom = (s1.y - s2.y) * (s0.x - s2.x) + (s2.x - s1.x) * (s0.y - s2.y);
    if (Math.abs(denom) < 1e-9) continue;

    const uvs = idx.map((i) => [mesh.uvs[i * 2], mesh.uvs[i * 2 + 1]]);
    const screenSpan = Math.max(
      1,
      Math.hypot(s1.x - s0.x, s1.y - s0.y),
      Math.hypot(s2.x - s0.x, s2.y - s0.y),
      Math.hypot(s2.x - s1.x, s2.y - s1.y),
    );
    const uvSpan = Math.max(
      Math.hypot(uvs[1][0] - uvs[0][0], uvs[1][1] - uvs[0][1]),
      Math.hypot(uvs[2][0] - uvs[0][0], uvs[2][1] - uvs[0][1]),
      Math.hypot(uvs[2][0] - uvs[1][0], uvs[2][1] - uvs[1][1]),
    );
    const softRadius = Math.max(3 / 4096, 1.35 * (uvSpan / screenSpan));

    // Geometry field: linear in screen space → exact fwidth analogue per pixel.
    let f0 = 0;
    let f1 = 0;
    let f2 = 0;
    let fieldAa = fieldMinAaMeters;
    if (visualMode === "geometry-field" && vertexField) {
      f0 = vertexField[idx[0]];
      f1 = vertexField[idx[1]];
      f2 = vertexField[idx[2]];
      const dwdx0 = (s1.y - s2.y) / denom;
      const dwdx1 = (s2.y - s0.y) / denom;
      const dwdx2 = -(dwdx0 + dwdx1);
      const dwdy0 = (s2.x - s1.x) / denom;
      const dwdy1 = (s0.x - s2.x) / denom;
      const dwdy2 = -(dwdy0 + dwdy1);
      const dfdx = f0 * dwdx0 + f1 * dwdx1 + f2 * dwdx2;
      const dfdy = f0 * dwdy0 + f1 * dwdy1 + f2 * dwdy2;
      const fw = Math.abs(dfdx) + Math.abs(dfdy);
      fieldAa = Math.min(fieldMaxAaMeters, Math.max(fieldMinAaMeters, fw));
    }

    for (let py = minY; py <= maxY; py++) {
      for (let px = minX; px <= maxX; px++) {
        const cx = px + 0.5;
        const cy = py + 0.5;
        const w0 = ((s1.y - s2.y) * (cx - s2.x) + (s2.x - s1.x) * (cy - s2.y)) / denom;
        const w1 = ((s2.y - s0.y) * (cx - s2.x) + (s0.x - s2.x) * (cy - s2.y)) / denom;
        const w2 = 1 - w0 - w1;
        if (w0 < 0 || w1 < 0 || w2 < 0) continue;

        const z = w0 * s0.z + w1 * s1.z + w2 * s2.z;
        const offset = py * W + px;
        if (z >= depth[offset]) continue;
        depth[offset] = z;

        const n = normalize([
          w0 * normals[idx[0] * 3] + w1 * normals[idx[1] * 3] + w2 * normals[idx[2] * 3],
          w0 * normals[idx[0] * 3 + 1] + w1 * normals[idx[1] * 3 + 1] + w2 * normals[idx[2] * 3 + 1],
          w0 * normals[idx[0] * 3 + 2] + w1 * normals[idx[1] * 3 + 2] + w2 * normals[idx[2] * 3 + 2],
        ]);
        const lambert =
          0.34 +
          0.62 * Math.max(0, dot(n, KEY_LIGHT)) +
          0.18 * Math.max(0, dot(n, FILL_LIGHT));

        let shade = [SKIN[0] * lambert, SKIN[1] * lambert, SKIN[2] * lambert];

        if (highlight.size) {
          const u = w0 * uvs[0][0] + w1 * uvs[1][0] + w2 * uvs[2][0];
          const v = w0 * uvs[0][1] + w1 * uvs[1][1] + w2 * uvs[2][1];
          let membership = 0;
          if (visualMode === "geometry-field" && vertexField) {
            const d = f0 * w0 + f1 * w1 + f2 * w2;
            const t = Math.max(
              0,
              Math.min(1, (d + fieldAa) / Math.max(1e-9, 2 * fieldAa)),
            );
            membership = t * t * (3 - 2 * t);
          } else if (visualMode === "sdf-visual") {
            let sd = null;
            if (typeof sdfAnalytical === "function") {
              const x =
                w0 * verts[0][0] + w1 * verts[1][0] + w2 * verts[2][0];
              const y =
                w0 * verts[0][1] + w1 * verts[1][1] + w2 * verts[2][1];
              const z =
                w0 * verts[0][2] + w1 * verts[1][2] + w2 * verts[2][2];
              sd = sdfAnalytical(x, y, z);
            }
            if (sd == null && sdfSampler && typeof sdfSampler.sample === "function") {
              const enc = sdfSampler.sample(u, v);
              sd = (enc - 0.5) * 2 * sdfRangeMeters;
            }
            if (sd != null) {
              const w = Math.max(0.0012, Math.min(0.008, softRadius * 2.5 + 0.0012));
              const t = Math.max(0, Math.min(1, (sd + w) / Math.max(1e-9, 2 * w)));
              membership = t * t * (3 - 2 * t);
            }
          } else if (
            visualMode === "final-visual" &&
            typeof maskSampler.coverage === "function"
          ) {
            membership = maskSampler.coverage(u, v, highlight, softRadius);
          } else if (visualMode === "binary-debug") {
            membership = highlight.has(maskSampler.at(u, v)) ? 1 : 0;
          } else {
            membership = maskSampler.membership(u, v, highlight, softRadius);
          }
          if (membership > 0.02) {
            const k = membership * HIGHLIGHT_STRENGTH;
            shade = [
              shade[0] * (1 - k) + HIGHLIGHT[0] * lambert * k,
              shade[1] * (1 - k) + HIGHLIGHT[1] * lambert * k,
              shade[2] * (1 - k) + HIGHLIGHT[2] * lambert * k,
            ];
          }
        }

        color[offset * 3] = shade[0];
        color[offset * 3 + 1] = shade[1];
        color[offset * 3 + 2] = shade[2];
      }
    }
  }

  const out = Buffer.alloc(width * height * 3);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let r = 0;
      let g = 0;
      let b = 0;
      for (let sy = 0; sy < ss; sy++) {
        for (let sx = 0; sx < ss; sx++) {
          const offset = ((y * ss + sy) * W + x * ss + sx) * 3;
          r += color[offset];
          g += color[offset + 1];
          b += color[offset + 2];
        }
      }
      const n = ss * ss;
      const at = (y * width + x) * 3;
      out[at] = Math.round(Math.min(1, r / n) * 255);
      out[at + 1] = Math.round(Math.min(1, g / n) * 255);
      out[at + 2] = Math.round(Math.min(1, b / n) * 255);
    }
  }

  return sharp(out, { raw: { width, height, channels: 3 } }).png();
}

/**
 * Mask reader.
 * - at(): categorical nearest (selection authority)
 * - membership(): legacy 3×3 (compat)
 * - coverage(): bilinear of binary membership + soft AA (final-visual)
 */
export function makeMaskSampler(data, size) {
  const at = (u, v) => {
    let x = Math.floor(u * size);
    let y = Math.floor((1 - v) * size);
    x = Math.min(size - 1, Math.max(0, x));
    y = Math.min(size - 1, Math.max(0, y));
    return data[y * size + x];
  };
  const atXY = (x, y) => {
    const cx = Math.min(size - 1, Math.max(0, x));
    const cy = Math.min(size - 1, Math.max(0, y));
    return data[cy * size + cx];
  };
  return {
    at,
    membership(u, v, set, radius = 1 / size) {
      let hits = 0;
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          if (set.has(at(u + dx * radius, v + dy * radius))) hits += 1;
        }
      }
      return hits / 9;
    },
    /** Browser-like coverage: bilinear on 0/1 membership, never on IDs. */
    coverage(u, v, set, softRadius = 1 / size) {
      const px = u * size - 0.5;
      const py = (1 - v) * size - 0.5;
      const ix = Math.floor(px);
      const iy = Math.floor(py);
      const fx = px - ix;
      const fy = py - iy;
      const m = (x, y) => (set.has(atXY(x, y)) ? 1 : 0);
      const m00 = m(ix, iy);
      const m10 = m(ix + 1, iy);
      const m01 = m(ix, iy + 1);
      const m11 = m(ix + 1, iy + 1);
      const a = m00 * (1 - fx) + m10 * fx;
      const b = m01 * (1 - fx) + m11 * fx;
      const cov = a * (1 - fy) + b * fy;
      // Approximate fwidth: keep ~1–2 screen pixels of soft edge
      const w = Math.max(0.12, Math.min(0.45, softRadius * size * 0.55));
      const t = Math.max(0, Math.min(1, (cov - (0.5 - w)) / Math.max(1e-6, 2 * w)));
      return t * t * (3 - 2 * t);
    },
  };
}

/** Linear SDF sampler from normalized float buffer (0..1, 0.5 = boundary). */
export function makeSdfSampler(encoded, size) {
  const atXY = (x, y) => {
    const cx = Math.min(size - 1, Math.max(0, x));
    const cy = Math.min(size - 1, Math.max(0, y));
    return encoded[cy * size + cx];
  };
  return {
    sample(u, v) {
      const px = u * size - 0.5;
      const py = (1 - v) * size - 0.5;
      const ix = Math.floor(px);
      const iy = Math.floor(py);
      const fx = px - ix;
      const fy = py - iy;
      const a = atXY(ix, iy) * (1 - fx) + atXY(ix + 1, iy) * fx;
      const b = atXY(ix, iy + 1) * (1 - fx) + atXY(ix + 1, iy + 1) * fx;
      return a * (1 - fy) + b * fy;
    },
  };
}
