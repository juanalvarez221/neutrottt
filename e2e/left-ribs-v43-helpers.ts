/**
 * Shared helpers for Left Ribs V4.3 Playwright (temporary manifest, no promote).
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { expect, type Page } from "@playwright/test";

export type FieldTiming = {
  regionId: string;
  status: string;
  reason?: string;
  candidateId?: string;
  fieldHash?: string;
  refinementHash?: string;
  loadSource?: string;
  resolveMs: number;
  installMs: number;
  totalMs: number;
};

export type RayHit = {
  atomicId: string | null;
  publicTargetId: string | null;
  point: [number, number, number] | null;
  clientX: number;
  clientY: number;
};

const ROOT = process.cwd();
const ART = path.join(ROOT, "artifacts/left-ribs-v43");
const STAGED_SDF = path.join(
  ART,
  "staged/neutro_body_v1_left_ribs_sdf_L01.bin",
);
const STAGED_REFINE = path.join(
  ART,
  "staged/neutro_body_v1_left_ribs_refine_L01.bin",
);
const TEMP_MASK = path.join(
  ART,
  "temp/neutro_body_v1_anatomical_region_ids_left_preview.png",
);
const OFFICIAL_FIELDS = path.join(
  ROOT,
  "public/models/interaction/fields/neutro_body_v1_region_fields.json",
);

/** Mesh-surface positives on the left lateral wall (L01 field vertices). */
export const INTERIOR: { id: string; xyz: [number, number, number] }[] = [
  { id: "under_axilla", xyz: [0.151155, 1.29255, -0.068944] },
  { id: "costado_superior", xyz: [0.140915, 1.257303, -0.043305] },
  { id: "costado_medio", xyz: [0.144485, 1.223858, -0.075954] },
  { id: "costado_inferior", xyz: [0.125544, 1.147174, -0.028946] },
  { id: "frente_lateral", xyz: [0.136909, 1.239205, -0.039851] },
  { id: "posterior_lateral", xyz: [0.152654, 1.270779, -0.088552] },
];

export const EXTERIOR: { id: string; xyz: [number, number, number] }[] = [
  { id: "pecho", xyz: [0.072, 1.277, 0.029] },
  { id: "abdomen", xyz: [0, 1.1, 0.025] },
  { id: "brazo", xyz: [0.28, 1.22, -0.09] },
  { id: "axila_interna", xyz: [0.2, 1.31, -0.05] },
  // Mid-back midline — keep clear of the posterior left-rib seam.
  { id: "espalda", xyz: [0, 1.2, -0.2] },
  { id: "cadera", xyz: [0.14, 0.92, 0.04] },
];

export async function installTempLeftRibsManifest(
  page: Page,
  fieldHash: string,
  refineHash: string,
) {
  const official = JSON.parse(readFileSync(OFFICIAL_FIELDS, "utf8")) as {
    version: string;
    fields: Array<Record<string, unknown>>;
  };
  const temp = {
    ...official,
    version: `${official.version}+left_ribs_v43_temp`,
    fields: [
      ...official.fields.filter((f) => f.regionId !== "left_ribs"),
      {
        regionId: "left_ribs",
        visualRegionId: "left_ribs_surface",
        surfaceRegionId: "left_ribs_region",
        maskIndex: 12,
        geometryHash: "c62e81edaa1f",
        indexHash: "52494d471398c",
        vertexCount: 14517,
        fieldUrl: "/models/interaction/fields/neutro_body_v1_left_ribs_sdf.bin",
        fieldHash,
        fieldRange: 0.02,
        encoding: "snorm16",
        candidateId: "L01",
        sourceCandidateId: "L01",
        temporary: true,
        refinement: {
          url: "/models/interaction/fields/neutro_body_v1_left_ribs_refine.bin",
          hash: refineHash,
          encoding: "snorm16",
          range: 0.02,
        },
      },
    ],
  };
  const sdf = readFileSync(STAGED_SDF);
  const refine = readFileSync(STAGED_REFINE);
  const tempMask = readFileSync(TEMP_MASK);

  await page.route("**/neutro_body_v1_region_fields.json*", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(temp),
    });
  });
  await page.route("**/neutro_body_v1_left_ribs_sdf.bin*", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/octet-stream",
      body: sdf,
    });
  });
  await page.route("**/neutro_body_v1_left_ribs_refine.bin*", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/octet-stream",
      body: refine,
    });
  });
  // Temporary categorical mask aligned to L01 — official public PNG stays untouched.
  await page.route(
    "**/neutro_body_v1_anatomical_region_ids.png*",
    async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "image/png",
        body: tempMask,
      });
    },
  );
}

export async function seedQuoteOnboarding(page: Page) {
  await page.addInitScript(() => {
    window.localStorage.setItem("neutrottt.language", "es");
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

export async function waitBridge(page: Page) {
  await expect
    .poll(
      async () =>
        page.evaluate(
          () =>
            typeof (window as unknown as { __neutroHitBridge?: unknown })
              .__neutroHitBridge !== "undefined",
        ),
      { timeout: 90_000 },
    )
    .toBe(true);
}

export async function raycastWorld(
  page: Page,
  xyz: [number, number, number],
): Promise<RayHit | null> {
  return page.evaluate(async ([x, y, z]) => {
    const bridge = (
      window as unknown as {
        __neutroHitBridge?: {
          raycastWorldAsync?: (
            x: number,
            y: number,
            z: number,
          ) => Promise<RayHit | null>;
          raycastWorld: (x: number, y: number, z: number) => RayHit | null;
        };
      }
    ).__neutroHitBridge;
    if (!bridge) return null;
    if (bridge.raycastWorldAsync) {
      return bridge.raycastWorldAsync(x, y, z);
    }
    return bridge.raycastWorld(x, y, z);
  }, xyz);
}

export async function prepView(
  page: Page,
  prep: "front-left" | "left" | "back-left" | "front",
) {
  if (prep === "front") {
    const front = page.getByRole("button", { name: "front", exact: true });
    if (await front.count()) {
      await front.click({ timeout: 10_000 });
      await page.waitForTimeout(500);
    }
    return;
  }
  const front = page.getByRole("button", { name: "front", exact: true });
  if (await front.count()) {
    await front.click({ timeout: 10_000 });
    await page.waitForTimeout(400);
  }
  const canvas = page.locator("canvas").first();
  const box = await canvas.boundingBox();
  expect(box).toBeTruthy();
  const cx = box!.x + box!.width / 2;
  const cy = box!.y + box!.height * 0.48;
  // Drag toward anatomical left (+X camera orbit ≈ negative screen X drag).
  const drag =
    prep === "front-left" ? -130 : prep === "left" ? -180 : -200;
  const towardBack = prep === "back-left";
  await page.mouse.move(cx, cy);
  await page.mouse.down();
  await page.mouse.move(cx + drag, cy + (towardBack ? 40 : 0), { steps: 8 });
  if (towardBack) {
    await page.mouse.move(cx + drag - 40, cy + 80, { steps: 6 });
  }
  await page.mouse.up();
  await page.waitForTimeout(350);
}

export async function openLabLeftRibs(
  page: Page,
  fieldHash: string,
  refineHash: string,
) {
  await page.addInitScript(() => {
    window.localStorage.setItem("neutrottt.language", "es");
  });
  await installTempLeftRibsManifest(page, fieldHash, refineHash);
  await page.goto(`/lab/body-3d?mode=audit&v43=${fieldHash}`, {
    waitUntil: "domcontentloaded",
  });
  await page.waitForTimeout(600);
  await page.evaluate(() => {
    const tab = [...document.querySelectorAll('[role="tab"]')].find((el) =>
      (el.textContent ?? "").includes("Public Region Audit"),
    ) as HTMLButtonElement | undefined;
    tab?.click();
  });
  await expect(
    page.locator("text=Anatomical Region Review").first(),
  ).toBeVisible({ timeout: 60_000 });
  const select = page
    .locator("select")
    .filter({ has: page.locator('option[value="left_ribs"]') })
    .first();
  await select.selectOption("left_ribs");
  await expect(page.locator("canvas").first()).toBeVisible({ timeout: 30_000 });
  await expect
    .poll(async () => (await readTiming(page))?.status, { timeout: 60_000 })
    .toBe("ok");
  await waitBridge(page);
  await prepView(page, "front-left");
  return select;
}
