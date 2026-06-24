#!/usr/bin/env node
/**
 * Auditoria estatica de patrones que suelen romper la responsividad.
 */
import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "..");
const SRC = path.join(ROOT, "src");

const RULES = [
  {
    id: "h-screen",
    pattern: /\bh-screen\b/g,
    message: "Usar min-h-[100dvh] o min-h-dvh en lugar de h-screen (Safari/iOS).",
    severity: "error",
  },
  {
    id: "fixed-wide",
    pattern: /\bw-\[(?:[4-9]\d{2,}|[1-9]\d{3,})px\]/g,
    message: "Ancho fijo grande sin alternativa responsive.",
    severity: "warn",
  },
];

function walk(dir, acc = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, acc);
    else if (/\.(tsx|jsx|css)$/.test(entry.name)) acc.push(full);
  }
  return acc;
}

const findings = [];

for (const file of walk(SRC)) {
  const content = fs.readFileSync(file, "utf8");
  const rel = path.relative(ROOT, file).replace(/\\/g, "/");

  for (const rule of RULES) {
    const matches = content.match(rule.pattern);
    if (!matches?.length) continue;
    findings.push({
      severity: rule.severity,
      rule: rule.id,
      file: rel,
      count: matches.length,
      message: rule.message,
    });
  }
}

const order = { error: 0, warn: 1, info: 2 };
findings.sort((a, b) => order[a.severity] - order[b.severity] || a.file.localeCompare(b.file));

console.log("Neutrott — auditoria de responsividad\n");

if (!findings.length) {
  console.log("Sin hallazgos en reglas estaticas.");
  process.exit(0);
}

for (const item of findings) {
  console.log(`[${item.severity.toUpperCase()}] ${item.file} (${item.count}x) — ${item.message}`);
}

const errors = findings.filter((f) => f.severity === "error").length;
console.log(`\n${findings.length} hallazgos (${errors} errores).`);
process.exit(errors > 0 ? 1 : 0);
