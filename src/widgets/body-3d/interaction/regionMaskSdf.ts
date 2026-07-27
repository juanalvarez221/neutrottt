/**
 * Visual SDF coverage for public region highlights.
 * Categorical IDs stay NearestFilter; SDF is LinearFilter only.
 */

export const REGION_MASK_SDF_GLSL = /* glsl */ `
/**
 * sampleSdfVisualCoverage — anti-aliased coverage from analytical SDF texture.
 * encoded: 0 = -range, 0.5 = boundary, 1 = +range (inside).
 */
float sampleSdfVisualCoverage(sampler2D sdf, float rangeMeters, float minAa, vec2 uv) {
  float enc = texture2D(sdf, uv).r;
  float signedDistance = (enc - 0.5) * 2.0 * rangeMeters;
  float pixelWidth = max(fwidth(signedDistance), minAa);
  return smoothstep(-pixelWidth, pixelWidth, signedDistance);
}

/**
 * Coarse domain gate: dilated categorical membership so soft SDF edges are not
 * clipped by UV stairs, while blocking distant UV islands.
 */
float sampleDilatedDomain(
  sampler2D mask,
  sampler2D lut,
  vec2 texelSize,
  vec2 uv,
  float radiusTexels
) {
  float acc = 0.0;
  float wsum = 0.0;
  // 5-tap diamond in texel space (cheap dilated probe)
  for (int i = -2; i <= 2; i++) {
    float fi = float(i);
    vec2 o0 = vec2(fi, 0.0) * texelSize * radiusTexels * 0.5;
    vec2 o1 = vec2(0.0, fi) * texelSize * radiusTexels * 0.5;
    float id0 = floor(texture2D(mask, uv + o0).r * 255.0 + 0.5);
    float id1 = floor(texture2D(mask, uv + o1).r * 255.0 + 0.5);
    acc += texture2D(lut, vec2((id0 + 0.5) / 256.0, 0.5)).r;
    acc += texture2D(lut, vec2((id1 + 0.5) / 256.0, 0.5)).r;
    wsum += 2.0;
  }
  return step(0.5, acc);
}
`;

export function sampleSdfVisualCoverageJs(
  sampleEnc: (u: number, v: number) => number,
  rangeMeters: number,
  u: number,
  v: number,
  aaWidthMeters = 0.0004,
): number {
  const enc = sampleEnc(u, v);
  const signedDistance = (enc - 0.5) * 2 * rangeMeters;
  const w = Math.max(aaWidthMeters, 1e-6);
  const t = Math.max(0, Math.min(1, (signedDistance + w) / (2 * w)));
  return t * t * (3 - 2 * t);
}
