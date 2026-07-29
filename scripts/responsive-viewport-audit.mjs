#!/usr/bin/env node
/**
 * Auditoria de responsividad en navegador real.
 * Recorre rutas publicas en varios viewports y reporta:
 *  - scroll horizontal del documento
 *  - elementos que sobresalen del viewport
 *  - areas de toque menores al minimo accesible en movil
 *
 * Uso: node scripts/responsive-viewport-audit.mjs [baseUrl]
 */
import { chromium } from "playwright";

const BASE_URL = process.argv[2] ?? process.env.AUDIT_BASE_URL ?? "http://localhost:3000";

const ROUTES = [
  "/",
  "/premios",
  "/proyectos",
  "/contacto",
  "/tienda",
  "/tienda/seminario-lettering-online",
  "/tienda/el-poder-de-las-letras",
  "/tienda/camiseta-artista",
  "/tienda/checkout",
  "/cotizacion",
  "/cotizacion/conexion",
  "/cotizacion/tamano",
  "/cotizacion/ubicacion?size=mediano",
  "/cotizacion/estilo?size=mediano&zone=pecho",
  "/cotizacion/referencia?size=mediano&zone=pecho",
  "/cotizacion/confirmacion?size=mediano&zone=brazo_completo",
  "/cotizacion/asesoria?size=espalda_completa",
  "/cotizacion/asesoria/agendar?size=espalda_completa",
  "/cotizacion/gracias",
  "/admin/login",
];

const VIEWPORTS = [
  { label: "280w  Fold cerrado", width: 280, height: 653, mobile: true },
  { label: "320w  iPhone SE", width: 320, height: 568, mobile: true },
  { label: "360w  Android", width: 360, height: 740, mobile: true },
  { label: "390w  iPhone 14", width: 390, height: 844, mobile: true },
  { label: "414w  Plus", width: 414, height: 896, mobile: true },
  { label: "667w  Movil horizontal", width: 667, height: 375, mobile: true },
  { label: "844w  iPhone horizontal", width: 844, height: 390, mobile: true },
  { label: "768w  iPad", width: 768, height: 1024, mobile: false },
  { label: "1024w Laptop", width: 1024, height: 768, mobile: false },
  { label: "1280w Desktop", width: 1280, height: 800, mobile: false },
  { label: "1536w Wide", width: 1536, height: 960, mobile: false },
];

const MIN_TAP_PX = 40;

function describe(el) {
  const tag = el.tagName.toLowerCase();
  const id = el.id ? `#${el.id}` : "";
  const cls = el.getAttribute("class");
  const short = cls ? `.${cls.trim().split(/\s+/).slice(0, 3).join(".")}` : "";
  return `${tag}${id}${short}`;
}

async function auditPage(page, viewport) {
  return page.evaluate(
    ({ minTap, isMobile, describeSrc }) => {
      const describeEl = new Function(`return ${describeSrc}`)();
      const vw = window.innerWidth;
      const doc = document.documentElement;

      const overflow = {
        scrollWidth: doc.scrollWidth,
        clientWidth: doc.clientWidth,
        amount: Math.max(0, doc.scrollWidth - doc.clientWidth),
      };

      const offenders = [];
      const smallTaps = [];
      const unreachable = [];

      for (const el of document.querySelectorAll("body *")) {
        const style = getComputedStyle(el);
        if (style.display === "none" || style.visibility === "hidden") continue;
        if (style.position === "fixed" && el.getAttribute("aria-hidden") === "true") continue;

        const rect = el.getBoundingClientRect();
        if (rect.width === 0 || rect.height === 0) continue;

        const bleedsRight = rect.right > vw + 1;
        const bleedsLeft = rect.left < -1;
        if ((bleedsRight || bleedsLeft) && offenders.length < 12) {
          // Ignorar hijos cuyo ancestro ya recorta el desborde.
          let clipped = false;
          for (let p = el.parentElement; p && p !== document.body; p = p.parentElement) {
            const ps = getComputedStyle(p);
            if (ps.overflowX === "hidden" || ps.overflowX === "auto" || ps.overflowX === "scroll") {
              clipped = true;
              break;
            }
          }
          if (!clipped) {
            offenders.push({
              selector: describeEl(el),
              left: Math.round(rect.left),
              right: Math.round(rect.right),
              width: Math.round(rect.width),
            });
          }
        }

        const interactive =
          el.matches("a[href], button, [role='button'], input, select, textarea") &&
          !el.hasAttribute("disabled");

        // Control empujado fuera del viewport: invisible por recorte y por tanto inutilizable.
        if (interactive && unreachable.length < 8) {
          const centerX = rect.left + rect.width / 2;
          if (centerX < 0 || centerX > vw) {
            // Alcanzable si vive en un carrusel: contenedor con scroll horizontal
            // o pista desplazada por transform (marquee arrastrable).
            let inCarousel = false;
            for (let p = el.parentElement; p && p !== document.body; p = p.parentElement) {
              const ps = getComputedStyle(p);
              if (
                (ps.overflowX === "auto" || ps.overflowX === "scroll") &&
                p.scrollWidth > p.clientWidth + 1
              ) {
                inCarousel = true;
                break;
              }
              if (ps.transform !== "none" && Math.abs(new DOMMatrix(ps.transform).m41) > 1) {
                inCarousel = true;
                break;
              }
            }
            if (!inCarousel) {
              unreachable.push({
                selector: describeEl(el),
                left: Math.round(rect.left),
                right: Math.round(rect.right),
                label: (el.getAttribute("aria-label") || el.textContent || "").trim().slice(0, 32),
              });
            }
          }
        }

        if (isMobile) {
          if (interactive && rect.top < window.innerHeight * 3) {
            const tooSmall = rect.height < minTap || rect.width < minTap;
            if (tooSmall && smallTaps.length < 12) {
              smallTaps.push({
                selector: describeEl(el),
                width: Math.round(rect.width),
                height: Math.round(rect.height),
                label: (el.getAttribute("aria-label") || el.textContent || "").trim().slice(0, 32),
              });
            }
          }
        }
      }

      return { overflow, offenders, smallTaps, unreachable };
    },
    { minTap: MIN_TAP_PX, isMobile: viewport.mobile, describeSrc: describe.toString() },
  );
}

const browser = await chromium.launch();
const findings = [];
let checks = 0;

for (const viewport of VIEWPORTS) {
  const context = await browser.newContext({
    viewport: { width: viewport.width, height: viewport.height },
    deviceScaleFactor: viewport.mobile ? 2 : 1,
    isMobile: viewport.mobile,
    hasTouch: viewport.mobile,
  });
  const page = await context.newPage();

  process.stdout.write(`${viewport.label}: `);

  for (const route of ROUTES) {
    checks += 1;
    try {
      await page.goto(`${BASE_URL}${route}`, { waitUntil: "domcontentloaded", timeout: 45_000 });
      await page.waitForTimeout(450);
      const result = await auditPage(page, viewport);
      process.stdout.write(
        result.overflow.amount > 1 || result.unreachable.length ? "x" : ".",
      );

      if (result.unreachable.length) {
        findings.push({
          severity: "error",
          viewport: viewport.label,
          route,
          detail: `${result.unreachable.length} control(es) fuera del viewport (recortados, imposibles de pulsar)`,
          offenders: result.unreachable,
        });
      }

      if (result.overflow.amount > 1) {
        findings.push({
          severity: "error",
          viewport: viewport.label,
          route,
          detail: `scroll horizontal de ${result.overflow.amount}px (${result.overflow.scrollWidth} > ${result.overflow.clientWidth})`,
          offenders: result.offenders,
        });
      }
      if (result.smallTaps.length) {
        findings.push({
          severity: "warn",
          viewport: viewport.label,
          route,
          detail: `${result.smallTaps.length} area(s) de toque < ${MIN_TAP_PX}px`,
          offenders: result.smallTaps,
        });
      }
    } catch (error) {
      process.stdout.write("!");
      findings.push({
        severity: "error",
        viewport: viewport.label,
        route,
        detail: `fallo de carga: ${error.message.split("\n")[0]}`,
        offenders: [],
      });
    }
  }

  process.stdout.write("\n");
  await context.close();
}

await browser.close();

console.log(`Danniel Cuervo — auditoria responsive en navegador (${checks} comprobaciones)\n`);

if (!findings.length) {
  console.log("Sin hallazgos: ningun desborde ni area de toque pequena.");
  process.exit(0);
}

for (const item of findings) {
  console.log(`[${item.severity.toUpperCase()}] ${item.viewport} ${item.route} — ${item.detail}`);
  for (const offender of item.offenders) {
    const geo =
      offender.width === undefined
        ? `left=${offender.left} right=${offender.right} "${offender.label}"`
        : offender.right !== undefined
          ? `left=${offender.left} right=${offender.right} w=${offender.width}`
          : `${offender.width}x${offender.height} "${offender.label}"`;
    console.log(`         ${offender.selector}  ${geo}`);
  }
}

const errors = findings.filter((f) => f.severity === "error").length;
console.log(`\n${findings.length} hallazgos (${errors} errores).`);
process.exit(errors > 0 ? 1 : 0);
