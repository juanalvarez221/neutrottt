import { readFileSync, writeFileSync } from "node:fs";

const path = "tools/anatomical-overlay/bake-highlight.mjs";
let s = readFileSync(path, "utf8");

const oldPush = `positions.push(
        mesh.positions[vi * 3],
        mesh.positions[vi * 3 + 1],
        mesh.positions[vi * 3 + 2],
      );`;

const newPush = `const nx = normals[vi * 3];
      const ny = normals[vi * 3 + 1];
      const nz = normals[vi * 3 + 2];
      const inflate = 0.0018;
      positions.push(
        mesh.positions[vi * 3] + nx * inflate,
        mesh.positions[vi * 3 + 1] + ny * inflate,
        mesh.positions[vi * 3 + 2] + nz * inflate,
      );`;

if (!s.includes(oldPush)) {
  console.error("push block not found");
  process.exit(1);
}
s = s.replace(oldPush, newPush);

if (!s.includes("const normals = (() => {")) {
  s = s.replace(
    "// Extract per-region meshes",
    `const normals = (() => {
  const n = new Float64Array(mesh.vertexCount * 3);
  for (let t = 0; t < mesh.triangleCount; t++) {
    const i0 = mesh.indices[t * 3];
    const i1 = mesh.indices[t * 3 + 1];
    const i2 = mesh.indices[t * 3 + 2];
    const ax = mesh.positions[i0 * 3];
    const ay = mesh.positions[i0 * 3 + 1];
    const az = mesh.positions[i0 * 3 + 2];
    const bx = mesh.positions[i1 * 3] - ax;
    const by = mesh.positions[i1 * 3 + 1] - ay;
    const bz = mesh.positions[i1 * 3 + 2] - az;
    const cx = mesh.positions[i2 * 3] - ax;
    const cy = mesh.positions[i2 * 3 + 1] - ay;
    const cz = mesh.positions[i2 * 3 + 2] - az;
    const nx = by * cz - bz * cy;
    const ny = bz * cx - bx * cz;
    const nz = bx * cy - by * cx;
    for (const i of [i0, i1, i2]) {
      n[i * 3] += nx;
      n[i * 3 + 1] += ny;
      n[i * 3 + 2] += nz;
    }
  }
  for (let i = 0; i < mesh.vertexCount; i++) {
    const l = Math.hypot(n[i * 3], n[i * 3 + 1], n[i * 3 + 2]) || 1;
    n[i * 3] /= l;
    n[i * 3 + 1] /= l;
    n[i * 3 + 2] /= l;
  }
  return n;
})();

// Extract per-region meshes`,
  );
}

s = s.replace(
  "if (abs < frontRibTheta) {",
  "const frontLimit = Math.max(frontRibTheta, 58);\n      if (abs < frontLimit) {",
);

writeFileSync(path, s, "utf8");
console.log("patched ok");
