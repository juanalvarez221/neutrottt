/**
 * Shared helpers for Posterior Back V5.1 Playwright (temporary manifest, no promote).
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import type { Page } from "@playwright/test";

export type FieldTiming = {
  regionId: string;
  status: string;
  reason?: string;
  candidateId?: string;
  fieldHash?: string;
  refinementHash?: string;
  resolveMs: number;
  installMs: number;
  totalMs: number;
};

const ROOT = process.cwd();
const ART = path.join(ROOT, "artifacts/posterior-back-v51");
const OFFICIAL_FIELDS = path.join(
  ROOT,
  "public/models/interaction/fields/neutro_body_v1_region_fields.json",
);

export function readReport() {
  return JSON.parse(readFileSync(path.join(ART, "report.json"), "utf8")) as {
    candidate: {
      upper: { fieldHash: string; refineHash: string };
      lower: { fieldHash: string; refineHash: string };
      full: { fieldHash: string; refineHash: string };
    };
    selection: { approved: boolean };
  };
}

export async function installTempBackManifest(page: Page) {
  const report = readReport();
  const official = JSON.parse(readFileSync(OFFICIAL_FIELDS, "utf8")) as {
    version: string;
    fields: Array<Record<string, unknown>>;
    geometryHash?: string;
    indexHash?: string;
    vertexCount?: number;
  };

  const mk = (
    regionId: string,
    fieldHash: string,
    refineHash: string,
    surface: string | null,
  ) => ({
    regionId,
    surfaceRegionId: surface,
    geometryHash: "c62e81edaa1f",
    indexHash: "52494d471398c",
    vertexCount: 14517,
    fieldUrl: `/models/interaction/fields/temp_v51_${regionId}_sdf.bin`,
    fieldHash,
    fieldRange: 0.02,
    encoding: "snorm16",
    candidateId: "S02",
    temporary: true,
    refinement: {
      url: `/models/interaction/fields/temp_v51_${regionId}_refine.bin`,
      hash: refineHash,
      encoding: "u32-snorm16x3",
      range: 0.02,
    },
  });

  const temp = {
    ...official,
    version: `${official.version}+posterior_back_v51_temp`,
    temporary: true,
    fields: [
      ...official.fields,
      mk(
        "upper_back",
        report.candidate.upper.fieldHash,
        report.candidate.upper.refineHash,
        "upper_back_surface",
      ),
      mk(
        "lower_back",
        report.candidate.lower.fieldHash,
        report.candidate.lower.refineHash,
        "lower_back_surface",
      ),
      mk(
        "full_back",
        report.candidate.full.fieldHash,
        report.candidate.full.refineHash,
        null,
      ),
    ],
    hitContracts: {
      upper_back: ["upper_back_surface"],
      lower_back: ["lower_back_surface"],
      full_back: ["upper_back_surface", "lower_back_surface"],
    },
  };

  await page.route("**/neutro_body_v1_region_fields.json*", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(temp),
    });
  });

  for (const regionId of ["upper_back", "lower_back", "full_back"]) {
    const sdf = readFileSync(path.join(ART, "approved", `${regionId}_sdf.bin`));
    const refine = readFileSync(
      path.join(ART, "approved", `${regionId}_refine.bin`),
    );
    await page.route(`**/temp_v51_${regionId}_sdf.bin*`, async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/octet-stream",
        body: sdf,
      });
    });
    await page.route(`**/temp_v51_${regionId}_refine.bin*`, async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/octet-stream",
        body: refine,
      });
    });
  }
}

export async function seedQuoteOnboarding(page: Page) {
  await page.addInitScript(() => {
    window.localStorage.setItem("danniel.language", "es");
    window.localStorage.setItem(
      "quote_profile",
      JSON.stringify({
        name: "Mateo Rivas",
        phone: "+57 312 847 1928",
        email: "mateo.rivas@ejemplo.com",
      }),
    );
    window.localStorage.setItem(
      "quote_connection",
      JSON.stringify({
        referralSources: ["instagram"],
        personalValues: ["loyalty"],
        adjustments: ["trust_artist"],
        openNote: "",
      }),
    );
    window.localStorage.setItem("quote_onboarding_complete", "1");
  });
}

export async function readTiming(page: Page) {
  return page.evaluate(
    () =>
      (window as unknown as { __neutroRegionField?: FieldTiming })
        .__neutroRegionField ?? null,
  );
}

export async function openLabBack(page: Page) {
  await seedQuoteOnboarding(page);
  await installTempBackManifest(page);
  await page.goto("/lab/body-3d?mode=audit&v51=s02", {
    waitUntil: "domcontentloaded",
  });
  await page.waitForTimeout(2500);
}

export async function openQuoteSelector(page: Page) {
  await seedQuoteOnboarding(page);
  await installTempBackManifest(page);
  await page.goto("/cotizacion/ubicacion", { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(2000);
}
