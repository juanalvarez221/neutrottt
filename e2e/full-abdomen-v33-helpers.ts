/**
 * Shared helpers for Full Abdomen V3.3 Playwright suites.
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

export const INTERIOR: { id: string; xyz: [number, number, number] }[] = [
  { id: "epigastrio_central", xyz: [0, 1.123, 0.0246] },
  { id: "epigastrio_derecho", xyz: [-0.0557, 1.1432, 0.0214] },
  { id: "epigastrio_izquierdo", xyz: [0.0557, 1.1432, 0.0214] },
  { id: "umbilical", xyz: [0, 1.0986, 0.0248] },
  { id: "abdomen_inferior_central", xyz: [0, 1.0198, 0.0281] },
  { id: "abdomen_inferior_derecho", xyz: [-0.0396, 1.0235, 0.0267] },
  { id: "abdomen_inferior_izquierdo", xyz: [0.0396, 1.0235, 0.0267] },
  { id: "lateral_derecho_interior", xyz: [-0.0756, 1.0961, 0.0096] },
  { id: "lateral_izquierdo_interior", xyz: [0.0756, 1.0961, 0.0096] },
];

export const EXTERIOR: { id: string; xyz: [number, number, number] }[] = [
  { id: "pecho_derecho", xyz: [-0.0718, 1.2773, 0.0293] },
  { id: "pecho_izquierdo", xyz: [0.0718, 1.2773, 0.0293] },
  { id: "costillas_derechas", xyz: [-0.305, 1.086, 0.027] },
  { id: "costillas_izquierdas", xyz: [0.305, 1.086, 0.027] },
  { id: "cadera_derecha", xyz: [-0.14, 0.92, 0.04] },
  { id: "cadera_izquierda", xyz: [0.14, 0.92, 0.04] },
  { id: "pubis", xyz: [0, 0.86, 0.03] },
  { id: "ingle_derecha", xyz: [-0.05, 0.88, 0.02] },
  { id: "ingle_izquierda", xyz: [0.05, 0.88, 0.02] },
  { id: "muslo_derecho", xyz: [-0.1108, 0.7451, 0.0052] },
  { id: "muslo_izquierdo", xyz: [0.1108, 0.7451, 0.0052] },
];

export const SEAM = {
  chest: { id: "seam_chest", xyz: [0, 1.275, 0.04] as [number, number, number] },
  abdomen: {
    id: "seam_abdomen",
    xyz: [0, 1.12, 0.025] as [number, number, number],
  },
};

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

export async function openLabAbdomen(page: Page, fieldHash: string) {
  await page.addInitScript(() => {
    window.localStorage.setItem("danniel.language", "es");
  });
  await page.goto(`/lab/body-3d?mode=audit&v33=${fieldHash}`, {
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
    .filter({ has: page.locator('option[value="full_abdomen"]') })
    .first();
  await select.selectOption("full_abdomen");
  await expect(page.locator("canvas").first()).toBeVisible({ timeout: 30_000 });
  await expect
    .poll(async () => (await readTiming(page))?.status, { timeout: 60_000 })
    .toBe("ok");
  await waitBridge(page);
  await page.getByRole("button", { name: "front", exact: true }).click();
  await page.waitForTimeout(700);
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
  // Canonical front before landmark clicks — avoids back-face projections.
  const front = page.getByRole("button", { name: "front", exact: true });
  if (await front.count()) {
    await front.click();
    await page.waitForTimeout(700);
  }
}

export async function clickLandmark(
  page: Page,
  xyz: [number, number, number],
  expectId?: string,
) {
  const hit = await raycastWorld(page, xyz);
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
  prep:
    | "front"
    | "right30"
    | "right45"
    | "right60"
    | "right90"
    | "left30"
    | "left45"
    | "left60"
    | "left90",
) {
  const front = page.getByRole("button", { name: "front", exact: true });
  if (await front.count()) {
    await front.click({ timeout: 10_000 });
    await page.waitForTimeout(400);
  }
  if (prep === "front") return;
  if (prep === "right90") {
    await page.getByRole("button", { name: "right", exact: true }).click({
      timeout: 10_000,
    });
    await page.waitForTimeout(500);
    return;
  }
  if (prep === "left90") {
    await page.getByRole("button", { name: "left", exact: true }).click({
      timeout: 10_000,
    });
    await page.waitForTimeout(500);
    return;
  }
  const canvas = page.locator("canvas").first();
  await expect(canvas).toBeVisible({ timeout: 15_000 });
  const box = await canvas.boundingBox();
  expect(box).toBeTruthy();
  const cx = box!.x + box!.width / 2;
  const cy = box!.y + box!.height * 0.48;
  const drag =
    prep === "right30" || prep === "right45" || prep === "right60"
      ? prep === "right30"
        ? 90
        : prep === "right45"
          ? 130
          : 180
      : prep === "left30"
        ? -90
        : prep === "left45"
          ? -130
          : -180;
  await page.mouse.move(cx, cy);
  await page.mouse.down();
  await page.mouse.move(cx + drag, cy, { steps: 8 });
  await page.mouse.up();
  await page.waitForTimeout(350);
}
