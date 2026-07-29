/**
 * Shared helpers for Right Ribs V4.2 Playwright suites.
 */
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

/** Mesh-surface positives visible from front-right oblique (avoids arm occlusion). */
export const INTERIOR: { id: string; xyz: [number, number, number] }[] = [
  { id: "under_axilla", xyz: [-0.151155, 1.29255, -0.068944] },
  { id: "costado_superior", xyz: [-0.151589, 1.258029, -0.085578] },
  { id: "costado_medio", xyz: [-0.138117, 1.208814, -0.053203] },
  { id: "costado_inferior", xyz: [-0.125456, 1.127161, -0.033283] },
  { id: "frente_lateral", xyz: [-0.125377, 1.169972, -0.026713] },
  { id: "posterior_lateral", xyz: [-0.152654, 1.270779, -0.088552] },
];

export const EXTERIOR: { id: string; xyz: [number, number, number] }[] = [
  { id: "pecho", xyz: [-0.072, 1.277, 0.029] },
  { id: "abdomen", xyz: [0, 1.1, 0.025] },
  { id: "brazo", xyz: [-0.28, 1.22, -0.09] },
  { id: "espalda", xyz: [0.02, 1.18, -0.195] },
  { id: "cadera", xyz: [-0.14, 0.92, 0.04] },
  { id: "axila_interna", xyz: [-0.2, 1.31, -0.05] },
];

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

export async function openLabRibs(page: Page, fieldHash: string) {
  await page.addInitScript(() => {
    window.localStorage.setItem("danniel.language", "es");
  });
  await page.goto(`/lab/body-3d?mode=audit&v42=${fieldHash}`, {
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
    .filter({ has: page.locator('option[value="right_ribs"]') })
    .first();
  await select.selectOption("right_ribs");
  await expect(page.locator("canvas").first()).toBeVisible({ timeout: 30_000 });
  await expect
    .poll(async () => (await readTiming(page))?.status, { timeout: 60_000 })
    .toBe("ok");
  await waitBridge(page);
  await prepView(page, "front-right");
  return select;
}

export async function openQuoteSelector(page: Page) {
  await seedQuoteOnboarding(page);
  await page.goto("/cotizacion/ubicacion?size=mediano", {
    waitUntil: "domcontentloaded",
  });
  await expect(page.getByText("Cargando…")).toHaveCount(0, { timeout: 30_000 });
  await expect(page.locator("canvas").first()).toBeVisible({ timeout: 90_000 });
  await expect(page.locator('[aria-busy="true"]')).toHaveCount(0, {
    timeout: 90_000,
  });
  await expect(page.getByText("Preparando el modelo…")).toHaveCount(0, {
    timeout: 90_000,
  });
  await waitBridge(page);
  await page.waitForTimeout(500);
  await prepView(page, "front-right");
}

export async function clickLandmark(
  page: Page,
  xyz: [number, number, number],
  expectId?: string,
) {
  // Try canonical point, then slight lateral/outward nudges if occluded.
  const candidates: [number, number, number][] = [
    xyz,
    [xyz[0] - 0.012, xyz[1], xyz[2]],
    [xyz[0] - 0.02, xyz[1], xyz[2] - 0.01],
    [xyz[0] - 0.01, xyz[1] - 0.01, xyz[2] - 0.015],
  ];
  let hit: RayHit | null = null;
  for (const p of candidates) {
    hit = await raycastWorld(page, p);
    if (hit?.publicTargetId) break;
  }
  if (expectId) {
    expect(hit?.publicTargetId).toBe(expectId);
  }
  const canvas = page.locator("canvas").first();
  const box = await canvas.boundingBox();
  expect(box).toBeTruthy();
  expect(hit?.clientX).toBeTruthy();
  expect(hit?.clientY).toBeTruthy();
  await page.mouse.click(hit!.clientX, hit!.clientY);
  await page.waitForTimeout(600);
  return hit;
}

export async function prepView(
  page: Page,
  prep: "front-right" | "right" | "back-right" | "front",
) {
  if (prep === "front") {
    const front = page.getByRole("button", { name: "front", exact: true });
    if (await front.count()) {
      await front.click({ timeout: 10_000 });
      await page.waitForTimeout(500);
    }
    return;
  }
  if (prep === "right") {
    const right = page.getByRole("button", { name: "right", exact: true });
    if (await right.count()) {
      await right.click({ timeout: 10_000 });
      await page.waitForTimeout(500);
      return;
    }
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
  const drag =
    prep === "front-right" ? 130 : prep === "right" ? 180 : 200;
  const towardBack = prep === "back-right";
  await page.mouse.move(cx, cy);
  await page.mouse.down();
  await page.mouse.move(cx + drag, cy + (towardBack ? 40 : 0), { steps: 8 });
  if (towardBack) {
    await page.mouse.move(cx + drag + 40, cy + 80, { steps: 6 });
  }
  await page.mouse.up();
  await page.waitForTimeout(350);
}
