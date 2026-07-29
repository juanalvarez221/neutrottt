#!/usr/bin/env node
/**
 * Auditoria de responsividad en estados interactivos (lo que el barrido de rutas no ve):
 *  - overlays abiertos (carrito, ficha del estudio)
 *  - formularios: tamano de fuente que dispara el zoom automatico de iOS
 *  - contenido de dialogos que excede la altura del viewport sin poder desplazarse
 *
 * Uso: node scripts/responsive-overlay-audit.mjs [baseUrl]
 */
import { chromium } from "playwright";

const BASE_URL = process.argv[2] ?? process.env.AUDIT_BASE_URL ?? "http://localhost:3100";
const IOS_MIN_FONT_PX = 16;

const VIEWPORTS = [
  { label: "320w  iPhone SE", width: 320, height: 568 },
  { label: "360w  Android", width: 360, height: 740 },
  { label: "390w  iPhone 14", width: 390, height: 844 },
  { label: "844w  iPhone horizontal", width: 844, height: 390 },
  { label: "768w  iPad", width: 768, height: 1024 },
];

const OVERLAYS = [
  {
    name: "carrito",
    route: "/tienda",
    open: (page) => page.getByRole("button", { name: "Abrir carrito" }).first().click(),
  },
  {
    name: "ficha del estudio",
    route: "/",
    open: (page) => page.locator('button[aria-label*="Emerald"]').first().click(),
  },
];

const FORM_ROUTES = ["/tienda/checkout", "/cotizacion/conexion", "/cotizacion/asesoria/agendar?size=espalda_completa"];

function measure() {
  const doc = document.documentElement;
  const vw = window.innerWidth;
  const vh = window.innerHeight;

  const dialog = document.querySelector('[role="dialog"], dialog[open]');
  let dialogInfo = null;
  if (dialog) {
    const rect = dialog.getBoundingClientRect();

    // Contenido inalcanzable: cae fuera del viewport y ningun contenedor lo desplaza.
    const unreachable = [];
    for (const el of dialog.querySelectorAll("*")) {
      const style = getComputedStyle(el);
      if (style.display === "none" || style.visibility === "hidden") continue;
      const box = el.getBoundingClientRect();
      if (box.height === 0 || box.width === 0) continue;
      if (box.top < vh - 2 && box.left < vw - 2 && box.right > 2) continue;

      let scrollableAncestor = false;
      for (let p = el.parentElement; p && p !== document.body; p = p.parentElement) {
        const ps = getComputedStyle(p);
        const scrollsY = ps.overflowY === "auto" || ps.overflowY === "scroll";
        const scrollsX = ps.overflowX === "auto" || ps.overflowX === "scroll";
        if (
          (scrollsY && p.scrollHeight > p.clientHeight + 1) ||
          (scrollsX && p.scrollWidth > p.clientWidth + 1)
        ) {
          scrollableAncestor = true;
          break;
        }
      }
      if (!scrollableAncestor && unreachable.length < 5) {
        const cls = (el.getAttribute("class") || "").trim().split(/\s+/).slice(0, 3).join(".");
        unreachable.push(
          `${el.tagName.toLowerCase()}${cls ? `.${cls}` : ""} top=${Math.round(box.top)} bottom=${Math.round(box.bottom)}`,
        );
      }
    }

    const smallTaps = [];
    for (const el of dialog.querySelectorAll(
      "a[href], button, [role='button'], input, select, textarea",
    )) {
      if (el.hasAttribute("disabled")) continue;
      const box = el.getBoundingClientRect();
      if (box.width === 0 || box.height === 0) continue;
      if (box.width >= 40 && box.height >= 40) continue;
      if (smallTaps.length >= 6) break;
      const label = (el.getAttribute("aria-label") || el.textContent || "").trim().slice(0, 28);
      smallTaps.push(`${Math.round(box.width)}x${Math.round(box.height)} "${label}"`);
    }

    dialogInfo = {
      width: Math.round(rect.width),
      height: Math.round(rect.height),
      overflowsViewport: rect.height > vh + 1 || rect.width > vw + 1,
      unreachable,
      smallTaps,
    };
  }

  return {
    horizontalScroll: Math.max(0, doc.scrollWidth - doc.clientWidth),
    dialog: dialogInfo,
    viewport: { vw, vh },
  };
}

function measureFields() {
  const offenders = [];
  for (const el of document.querySelectorAll("input, select, textarea")) {
    if (el.type === "hidden") continue;
    const rect = el.getBoundingClientRect();
    if (rect.width === 0 && rect.height === 0) continue;
    const fontSize = Number.parseFloat(getComputedStyle(el).fontSize);
    if (fontSize < 16) {
      offenders.push({
        name: el.getAttribute("name") || el.getAttribute("id") || el.tagName.toLowerCase(),
        fontSize: Math.round(fontSize * 100) / 100,
        height: Math.round(rect.height),
      });
    }
  }
  return offenders;
}

const browser = await chromium.launch();
const findings = [];
let checks = 0;

for (const viewport of VIEWPORTS) {
  const context = await browser.newContext({
    viewport: { width: viewport.width, height: viewport.height },
    isMobile: true,
    hasTouch: true,
    deviceScaleFactor: 2,
  });
  // El selector de idioma cubre la pantalla en la primera visita.
  await context.addInitScript(() => {
    window.localStorage.setItem("danniel.language", "es");
  });
  const page = await context.newPage();
  page.setDefaultTimeout(15_000);
  process.stdout.write(`${viewport.label}: `);

  for (const overlay of OVERLAYS) {
    checks += 1;
    try {
      await page.goto(`${BASE_URL}${overlay.route}`, {
        waitUntil: "domcontentloaded",
        timeout: 45_000,
      });
      await page.waitForTimeout(500);
      await overlay.open(page);
      await page.waitForTimeout(900);

      const result = await page.evaluate(measure);
      const problems = [];

      if (result.horizontalScroll > 1) {
        problems.push(`scroll horizontal de ${result.horizontalScroll}px con el overlay abierto`);
      }
      if (!result.dialog) {
        problems.push("no se detecto [role=dialog] tras abrir");
      } else {
        if (result.dialog.overflowsViewport) {
          problems.push(
            `el dialogo mide ${result.dialog.width}x${result.dialog.height} sobre un viewport de ${result.viewport.vw}x${result.viewport.vh}`,
          );
        }
        if (result.dialog.unreachable.length) {
          problems.push(
            `contenido fuera del viewport sin area desplazable: ${result.dialog.unreachable.join(" | ")}`,
          );
        }
        if (result.dialog.smallTaps.length) {
          problems.push(`areas de toque < 40px: ${result.dialog.smallTaps.join(" | ")}`);
        }
      }

      if (problems.length) {
        process.stdout.write("x");
        findings.push({ viewport: viewport.label, subject: overlay.name, problems });
      } else {
        process.stdout.write(".");
      }
    } catch (error) {
      process.stdout.write("!");
      findings.push({
        viewport: viewport.label,
        subject: overlay.name,
        problems: [`fallo al interactuar: ${error.message.split("\n")[0]}`],
      });
    }
  }

  for (const route of FORM_ROUTES) {
    checks += 1;
    try {
      await page.goto(`${BASE_URL}${route}`, { waitUntil: "domcontentloaded", timeout: 45_000 });
      await page.waitForTimeout(600);
      const offenders = await page.evaluate(measureFields);
      if (offenders.length) {
        process.stdout.write("z");
        findings.push({
          viewport: viewport.label,
          subject: `campos en ${route}`,
          problems: offenders.map(
            (o) =>
              `${o.name}: ${o.fontSize}px (< ${IOS_MIN_FONT_PX}px provoca zoom automatico en iOS)`,
          ),
        });
      } else {
        process.stdout.write(".");
      }
    } catch (error) {
      process.stdout.write("!");
      findings.push({
        viewport: viewport.label,
        subject: `campos en ${route}`,
        problems: [`fallo de carga: ${error.message.split("\n")[0]}`],
      });
    }
  }

  process.stdout.write("\n");
  await context.close();
}

await browser.close();

console.log(`\nDanniel Cuervo — auditoria de estados interactivos (${checks} comprobaciones)\n`);

if (!findings.length) {
  console.log("Sin hallazgos: overlays y formularios se comportan bien en movil.");
  process.exit(0);
}

for (const item of findings) {
  console.log(`[WARN] ${item.viewport} — ${item.subject}`);
  for (const problem of item.problems) console.log(`         ${problem}`);
}

console.log(`\n${findings.length} hallazgos.`);
process.exit(1);
