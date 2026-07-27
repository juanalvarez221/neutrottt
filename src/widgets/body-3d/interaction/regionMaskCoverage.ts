/**
 * Region mask coverage — visual AA without interpolating categorical IDs.
 *
 * Binary IDs stay NearestFilter authority. Coverage interpolates only 0/1
 * membership against an active region id (or active set via LUT).
 */

export const REGION_MASK_COVERAGE_GLSL = /* glsl */ `
float maskIdAt(sampler2D mask, vec2 uv) {
  return floor(texture2D(mask, uv).r * 255.0 + 0.5);
}

/**
 * sampleRegionCoverage(activeRegionId, uv)
 * 1) Locate texel + four bilinear neighbors
 * 2) Compare each sample to activeRegionId (binary 0/1)
 * 3) Bilinear-interpolate membership only
 * 4) Screen-space AA via fwidth
 * Never interpolates ID numbers.
 */
float sampleRegionCoverage(sampler2D mask, vec2 texelSize, float activeRegionId, vec2 uv) {
  vec2 res = vec2(1.0 / max(texelSize.x, 1e-8), 1.0 / max(texelSize.y, 1e-8));
  vec2 p = uv * res - 0.5;
  vec2 i = floor(p);
  vec2 f = fract(p);

  vec2 uv00 = (i + vec2(0.5, 0.5)) * texelSize;
  vec2 uv10 = (i + vec2(1.5, 0.5)) * texelSize;
  vec2 uv01 = (i + vec2(0.5, 1.5)) * texelSize;
  vec2 uv11 = (i + vec2(1.5, 1.5)) * texelSize;

  float m00 = float(abs(maskIdAt(mask, uv00) - activeRegionId) < 0.5);
  float m10 = float(abs(maskIdAt(mask, uv10) - activeRegionId) < 0.5);
  float m01 = float(abs(maskIdAt(mask, uv01) - activeRegionId) < 0.5);
  float m11 = float(abs(maskIdAt(mask, uv11) - activeRegionId) < 0.5);

  float a = mix(m00, m10, f.x);
  float b = mix(m01, m11, f.x);
  float cov = mix(a, b, f.y);

  // Screen AA from coverage + UV footprint (never from raw IDs).
  float wUv = 0.5 * length(fwidth(uv * res));
  float w = max(max(fwidth(cov), wUv), 1e-4);
  return smoothstep(0.5 - w, 0.5 + w, cov);
}

/** Same as above but membership comes from a LUT (multi-id highlight sets). */
float sampleLutCoverage(sampler2D mask, sampler2D lut, vec2 texelSize, vec2 uv) {
  vec2 res = vec2(1.0 / max(texelSize.x, 1e-8), 1.0 / max(texelSize.y, 1e-8));
  vec2 p = uv * res - 0.5;
  vec2 i = floor(p);
  vec2 f = fract(p);

  vec2 uv00 = (i + vec2(0.5, 0.5)) * texelSize;
  vec2 uv10 = (i + vec2(1.5, 0.5)) * texelSize;
  vec2 uv01 = (i + vec2(0.5, 1.5)) * texelSize;
  vec2 uv11 = (i + vec2(1.5, 1.5)) * texelSize;

  float id00 = maskIdAt(mask, uv00);
  float id10 = maskIdAt(mask, uv10);
  float id01 = maskIdAt(mask, uv01);
  float id11 = maskIdAt(mask, uv11);

  float m00 = texture2D(lut, vec2((id00 + 0.5) / 256.0, 0.5)).r;
  float m10 = texture2D(lut, vec2((id10 + 0.5) / 256.0, 0.5)).r;
  float m01 = texture2D(lut, vec2((id01 + 0.5) / 256.0, 0.5)).r;
  float m11 = texture2D(lut, vec2((id11 + 0.5) / 256.0, 0.5)).r;

  float a = mix(m00, m10, f.x);
  float b = mix(m01, m11, f.x);
  float cov = mix(a, b, f.y);

  float wUv = 0.5 * length(fwidth(uv * res));
  float w = max(max(fwidth(cov), wUv), 1e-4);
  return smoothstep(0.5 - w, 0.5 + w, cov);
}
`;

function clamp(x: number, a: number, b: number) {
  return Math.max(a, Math.min(b, x));
}

function lerp(a: number, b: number, t: number) {
  return a * (1 - t) + b * t;
}

function smoothstep(edge0: number, edge1: number, x: number) {
  const t = clamp((x - edge0) / Math.max(1e-8, edge1 - edge0), 0, 1);
  return t * t * (3 - 2 * t);
}

/**
 * JS mirror of sampleRegionCoverage without fwidth (pass explicit aaWidth).
 * `at(x,y)` returns mask ID at integer texel coords (OpenGL V: row0 = v=1).
 */
export function sampleRegionCoverageJs(
  at: (x: number, y: number) => number,
  size: number,
  activeRegionId: number,
  u: number,
  v: number,
  aaWidth = 0.05,
): number {
  const px = u * size - 0.5;
  const py = (1 - v) * size - 0.5;
  const ix = Math.floor(px);
  const iy = Math.floor(py);
  const fx = px - ix;
  const fy = py - iy;

  const id = (x: number, y: number) => {
    const cx = clamp(x, 0, size - 1);
    const cy = clamp(y, 0, size - 1);
    return at(cx, cy);
  };

  const m00 = id(ix, iy) === activeRegionId ? 1 : 0;
  const m10 = id(ix + 1, iy) === activeRegionId ? 1 : 0;
  const m01 = id(ix, iy + 1) === activeRegionId ? 1 : 0;
  const m11 = id(ix + 1, iy + 1) === activeRegionId ? 1 : 0;

  const a = lerp(m00, m10, fx);
  const b = lerp(m01, m11, fx);
  const cov = lerp(a, b, fy);
  const w = Math.max(aaWidth, 1e-4);
  return smoothstep(0.5 - w, 0.5 + w, cov);
}

/** Binary center membership (authoritative selection). */
export function binaryCenterMembership(
  at: (x: number, y: number) => number,
  size: number,
  activeRegionId: number,
  u: number,
  v: number,
): 0 | 1 {
  const x = clamp(Math.floor(u * size), 0, size - 1);
  const y = clamp(Math.floor((1 - v) * size), 0, size - 1);
  return at(x, y) === activeRegionId ? 1 : 0;
}
