import { readFileSync, writeFileSync } from "node:fs";

const path = "tools/anatomical-overlay/bake-highlight.mjs";
let s = readFileSync(path, "utf8");

const pattern =
  /const r = Math\.hypot\(c\[0\], c\[2\] - axisZ\(y\)\);\s*const trunk = y > 0\.85 && y < 1\.48 \? 0\.13 \+ 0\.04 \* Math\.sin\(\(y - 0\.9\) \* 3\) : 0\.1;\s*if \(r > trunk \+ 0\.035 \|\| y < 0\.88\) \{\s*region = classifyLimb\(c, charts\);\s*\}/;

const replacement = `const r = Math.hypot(c[0], c[2] - axisZ(y));
      const trunk = y > 0.85 && y < 1.48 ? 0.13 + 0.04 * Math.sin((y - 0.9) * 3) : 0.1;
      const limb = classifyLimb(c, charts);
      if (limb) {
        const armish = /shoulder|biceps|triceps|forearm|hand|elbow|wrist/.test(limb);
        if (armish) {
          const sideArm = c[0] >= 0 ? "left" : "right";
          const arm = charts.arm(sideArm);
          const upper = projectToSegment(c, arm.shoulder, arm.elbow);
          if (upper.dist < 0.1 && upper.t >= 0.02 && upper.t < 0.95) {
            region = limb;
          } else if (r > trunk + 0.035 || y < 0.88) {
            region = limb;
          }
        } else if (r > trunk + 0.035 || y < 0.88) {
          region = limb;
        }
      }`;

if (!pattern.test(s)) {
  console.error("pattern not found");
  process.exit(1);
}
s = s.replace(pattern, replacement);
writeFileSync(path, s, "utf8");
console.log("ok");
