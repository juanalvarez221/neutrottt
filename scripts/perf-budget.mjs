#!/usr/bin/env node
/**
 * Informe de presupuesto de assets estaticos (videos, imagenes, svg).
 * Exit 1 si hay archivos criticos; exit 0 con avisos para mejoras opcionales.
 */
import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "..");
const PUBLIC_DIR = path.join(ROOT, "public");

const THRESHOLDS_MB = {
  video: { warn: 1.5, critical: 3.5 },
  image: { warn: 0.45, critical: 0.85 },
  svg: { warn: 0.35, critical: 0.55 },
};

function walk(dir, acc = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, acc);
    else acc.push(full);
  }
  return acc;
}

function kind(file) {
  const ext = path.extname(file).toLowerCase();
  if (ext === ".mp4" || ext === ".webm") return "video";
  if (ext === ".svg") return "svg";
  if ([".png", ".jpg", ".jpeg", ".webp", ".avif", ".gif"].includes(ext)) return "image";
  return null;
}

const files = walk(PUBLIC_DIR);
const critical = [];
const warnings = [];
let totalMb = 0;

for (const file of files) {
  const type = kind(file);
  if (!type) continue;
  const mb = fs.statSync(file).size / (1024 * 1024);
  totalMb += mb;
  const rel = path.relative(ROOT, file).replace(/\\/g, "/");
  const { warn, critical: crit } = THRESHOLDS_MB[type];
  if (mb >= crit) critical.push({ rel, mb, type });
  else if (mb >= warn) warnings.push({ rel, mb, type });
}

critical.sort((a, b) => b.mb - a.mb);
warnings.sort((a, b) => b.mb - a.mb);

console.log("Neutrott — auditoria de assets\n");
console.log(`Total public/: ~${totalMb.toFixed(1)} MB en ${files.length} archivos revisables`);

if (warnings.length) {
  console.log(`\nAvisos (${warnings.length}) — comprimir o diferir carga:`);
  for (const item of warnings.slice(0, 12)) {
    console.log(`  [${item.type}] ${item.rel} — ${item.mb.toFixed(2)} MB`);
  }
  if (warnings.length > 12) console.log(`  ... y ${warnings.length - 12} mas`);
}

if (critical.length) {
  console.log(`\nCriticos (${critical.length}) — priorizar optimizacion:`);
  for (const item of critical) {
    console.log(`  [${item.type}] ${item.rel} — ${item.mb.toFixed(2)} MB`);
  }
  console.log("\nRecomendacion: ffmpeg -crf 28 para video, sharp/avif para imagenes.");
  process.exit(1);
}

console.log("\nSin archivos criticos. Revisa avisos para pulir LCP y ancho de banda.");
process.exit(0);
