/**
 * Full Chest V2.7 — promote C07 into the real selector and capture browser QA.
 *
 *   npx playwright test e2e/full-chest-v27-browser.spec.ts --config=playwright.v23.config.ts
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { expect, test, type Page } from "@playwright/test";

const ROOT = process.cwd();
const REPORT = path.join(ROOT, "artifacts/full-chest-v27/report.json");
const BROWSER = path.join(ROOT, "artifacts/full-chest-v27/browser");
const HIT = path.join(ROOT, "artifacts/full-chest-v27/hit-alignment");
const PERF = path.join(ROOT, "artifacts/full-chest-v27/performance.json");

type FieldTiming = {
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

type RayHit = {
  atomicId: string | null;
  publicTargetId: string | null;
  point: [number, number, number] | null;
  clientX: number;
  clientY: number;
};

const INTERIOR: { id: string; xyz: [number, number, number] }[] = [
  { id: "infraclavicular_right", xyz: [-0.055, 1.345, 0.035] },
  { id: "infraclavicular_left", xyz: [0.055, 1.345, 0.035] },
  { id: "chest_volume_right", xyz: [-0.072, 1.268, 0.045] },
  { id: "chest_volume_left", xyz: [0.072, 1.268, 0.045] },
  { id: "sternum", xyz: [-0.01, 1.275, 0.04] },
  { id: "lateral_interior_right", xyz: [-0.11, 1.29, 0.02] },
  { id: "lateral_interior_left", xyz: [0.11, 1.29, 0.02] },
  { id: "inferior_right", xyz: [-0.05, 1.185, 0.035] },
  { id: "inferior_left", xyz: [0.05, 1.185, 0.035] },
];

const EXTERIOR: { id: string; xyz: [number, number, number] }[] = [
  { id: "neck", xyz: [0, 1.48, 0.02] },
  { id: "shoulder_right", xyz: [-0.22, 1.4, -0.05] },
  { id: "shoulder_left", xyz: [0.22, 1.4, -0.05] },
  { id: "arm_right", xyz: [-0.28, 1.15, -0.05] },
  { id: "arm_left", xyz: [0.28, 1.15, -0.05] },
  { id: "ribs_right", xyz: [-0.12, 1.08, 0.04] },
  { id: "ribs_left", xyz: [0.12, 1.08, 0.04] },
  { id: "abdomen", xyz: [0, 1.05, 0.05] },
];

async function seedQuoteOnboarding(page: Page) {
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

async function readTiming(page: Page) {
  return page.evaluate(
    () =>
      (window as unknown as { __neutroRegionField?: FieldTiming })
        .__neutroRegionField ?? null,
  );
}

async function waitBridge(page: Page) {
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

async function raycastWorld(
  page: Page,
  xyz: [number, number, number],
): Promise<RayHit | null> {
  return page.evaluate(([x, y, z]) => {
    const bridge = (
      window as unknown as {
        __neutroHitBridge?: {
          raycastWorld: (x: number, y: number, z: number) => RayHit | null;
        };
      }
    ).__neutroHitBridge;
    return bridge?.raycastWorld(x, y, z) ?? null;
  }, xyz);
}

async function openLabFullChest(page: Page, fieldHash: string) {
  await page.addInitScript(() => {
    window.localStorage.setItem("danniel.language", "es");
  });
  await page.goto(`/lab/body-3d?mode=audit&v27=${fieldHash}`, {
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
    .filter({ has: page.locator('option[value="full_chest"]') })
    .first();
  await select.selectOption("full_chest");
  await expect(page.locator("canvas").first()).toBeVisible({ timeout: 30_000 });
  await expect
    .poll(async () => (await readTiming(page))?.status, { timeout: 60_000 })
    .toBe("ok");
  await waitBridge(page);
  // Ensure cardinal front after selection camera move.
  await page.getByRole("button", { name: "front", exact: true }).click();
  await page.waitForTimeout(700);
  return select;
}

async function openQuoteSelector(page: Page) {
  await seedQuoteOnboarding(page);
  await page.goto("/cotizacion/ubicacion?size=mediano", {
    waitUntil: "domcontentloaded",
  });
  await expect(page.getByText("Cargando…")).toHaveCount(0, { timeout: 30_000 });
  await expect(page.locator("canvas").first()).toBeVisible({ timeout: 90_000 });
  // Wait until the premium selector marks interaction ready (overlay gone).
  await expect(page.locator('[aria-busy="true"]')).toHaveCount(0, {
    timeout: 90_000,
  });
  await expect(page.getByText("Preparando el modelo…")).toHaveCount(0, {
    timeout: 90_000,
  });
  await waitBridge(page);
  await page.waitForTimeout(500);
}

async function clickLandmark(page: Page, xyz: [number, number, number]) {
  const hit = await raycastWorld(page, xyz);
  expect(hit?.publicTargetId).toBe("full_chest");
  const canvas = page.locator("canvas").first();
  const box = await canvas.boundingBox();
  expect(box).toBeTruthy();
  await canvas.click({
    position: {
      x: hit!.clientX - box!.x,
      y: hit!.clientY - box!.y,
    },
    force: true,
  });
  await page.waitForTimeout(700);
  return hit;
}

async function dragOrbit(page: Page, fromX: number, toX: number, y: number) {
  await page.mouse.move(fromX, y);
  await page.mouse.down();
  await page.mouse.move(toX, y, { steps: 10 });
  await page.mouse.up();
  await page.waitForTimeout(350);
}


test.describe("Full Chest V2.7 official C07", () => {
  test("real selector loads C07 field without SDF UV", async ({ page }) => {
    test.setTimeout(300_000);
    await page.setViewportSize({ width: 1440, height: 900 });
    expect(existsSync(REPORT)).toBe(true);
    mkdirSync(HIT, { recursive: true });
    const report = JSON.parse(readFileSync(REPORT, "utf8"));
    const fieldHash = report.field.fieldHash as string;
    const refineHash = report.field.refineHash as string;

    const sidecarRequests: string[] = [];
    const sdfRequests: string[] = [];
    page.on("request", (request) => {
      const url = request.url();
      if (url.includes("/models/interaction/fields/")) sidecarRequests.push(url);
      if (url.includes("/models/interaction/sdf/")) sdfRequests.push(url);
    });

    await openQuoteSelector(page);

    const sternum = INTERIOR.find((p) => p.id === "sternum")!;
    await expect
      .poll(async () => (await raycastWorld(page, sternum.xyz))?.publicTargetId, {
        timeout: 30_000,
      })
      .toBe("full_chest");
    await clickLandmark(page, sternum.xyz);

    await expect(page.getByText("Pecho completo").first()).toBeVisible({
      timeout: 15_000,
    });
    await expect(
      page.getByText("Superficie frontal completa del pecho").first(),
    ).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText("Pectoral derecho")).toHaveCount(0);
    await expect(page.getByText("Pectoral izquierdo")).toHaveCount(0);
    await expect(page.getByText("Cara interna")).toHaveCount(0);
    await expect(page.getByText("Cara externa")).toHaveCount(0);

    // Stage: choose Pecho completo in the options sheet, then confirm.
    await page
      .getByRole("button", {
        name: /Pecho completo · Superficie frontal completa del pecho/i,
      })
      .click();
    await page.waitForTimeout(400);

    await expect
      .poll(async () => (await readTiming(page))?.status, { timeout: 45_000 })
      .toBe("ok");
    const first = await readTiming(page);
    expect(first?.candidateId).toBe("C07");
    expect(first?.fieldHash).toBe(fieldHash);
    expect(first?.refinementHash).toBe(refineHash);
    expect(first?.loadSource).toBe("official");
    expect(first?.status).toBe("ok");

    const confirm = page.getByRole("button", { name: /Confirmar selección/i });
    await expect(confirm).toBeVisible({ timeout: 10_000 });
    await confirm.click();
    await expect(page.getByText("Selección confirmada").first()).toBeVisible({
      timeout: 10_000,
    });

    expect(sdfRequests).toHaveLength(0);
    expect(
      sidecarRequests.some(
        (url) => url.includes("full_chest") && url.includes(fieldHash),
      ),
    ).toBe(true);

    // Cached re-select budget is measured in the audit viewer (same loader/cache).
    await openLabFullChest(page, fieldHash);
    const select = page
      .locator("select")
      .filter({ has: page.locator('option[value="full_chest"]') })
      .first();
    await select.selectOption("full_abdomen");
    await page.waitForTimeout(900);
    await select.selectOption("full_chest");
    await expect
      .poll(async () => (await readTiming(page))?.status, { timeout: 30_000 })
      .toBe("ok");
    const cached = await readTiming(page);
    expect(cached!.totalMs).toBeLessThan(16);

    writeFileSync(
      PERF,
      JSON.stringify(
        {
          cold: first,
          cachedReselectMs: cached!.totalMs,
          sidecarRequestCount: sidecarRequests.length,
          sdfRequestCount: sdfRequests.length,
          sidecarBytes: report.field.sidecarBytes + report.field.refineBytes,
          drawCallsAdditional: 0,
        },
        null,
        2,
      ),
    );
  });

  test("raycast hit tests interior/exterior", async ({ page }) => {
    test.setTimeout(240_000);
    mkdirSync(HIT, { recursive: true });
    const report = JSON.parse(readFileSync(REPORT, "utf8"));
    await openLabFullChest(page, report.field.fieldHash);

    const results: Record<
      string,
      { expect: string; publicTargetId: string | null; pass: boolean }
    > = {};

    for (const point of INTERIOR) {
      const hit = await raycastWorld(page, point.xyz);
      const pass = hit?.publicTargetId === "full_chest";
      results[point.id] = {
        expect: "full_chest",
        publicTargetId: hit?.publicTargetId ?? null,
        pass,
      };
      expect(hit?.publicTargetId, point.id).toBe("full_chest");
    }

    for (const point of EXTERIOR) {
      const hit = await raycastWorld(page, point.xyz);
      const pass = hit?.publicTargetId !== "full_chest";
      results[point.id] = {
        expect: "not_full_chest",
        publicTargetId: hit?.publicTargetId ?? null,
        pass,
      };
      expect(hit?.publicTargetId, point.id).not.toBe("full_chest");
    }

    writeFileSync(
      path.join(HIT, "raycast-results.json"),
      JSON.stringify({ via: "three-raycast-bridge", results }, null, 2),
    );
  });

  test("captures 13 browser evidence frames", async ({ page }) => {
    test.setTimeout(600_000);
    mkdirSync(BROWSER, { recursive: true });
    const report = JSON.parse(readFileSync(REPORT, "utf8"));
    const fieldHash = report.field.fieldHash as string;

    const viewports = [
      { key: "desktop", width: 1440, height: 900 },
      { key: "tablet", width: 820, height: 1180 },
      { key: "mobile", width: 390, height: 844 },
    ] as const;

    const desktopShots: {
      name: string;
      prep: "front" | "right30" | "right60" | "right90" | "left30" | "left60" | "left90";
    }[] = [
      { name: "01-desktop-front.png", prep: "front" },
      { name: "02-desktop-front-right-30.png", prep: "right30" },
      { name: "03-desktop-front-right-60.png", prep: "right60" },
      { name: "04-desktop-right-90.png", prep: "right90" },
      { name: "05-desktop-front-left-30.png", prep: "left30" },
      { name: "06-desktop-front-left-60.png", prep: "left60" },
      { name: "07-desktop-left-90.png", prep: "left90" },
    ];

    const tabletShots = [
      { name: "08-tablet-front.png", prep: "front" as const },
      { name: "09-tablet-front-right-60.png", prep: "right60" as const },
      { name: "10-tablet-left-60.png", prep: "left60" as const },
    ];

    const mobileShots = [
      { name: "11-mobile-front.png", prep: "front" as const },
      { name: "12-mobile-front-right-60.png", prep: "right60" as const },
      { name: "13-mobile-left-60.png", prep: "left60" as const },
    ];

    for (const vp of viewports) {
      await page.setViewportSize({ width: vp.width, height: vp.height });
      await openLabFullChest(page, fieldHash);
      const canvas = page.locator("canvas").first();
      const box = await canvas.boundingBox();
      expect(box).toBeTruthy();
      const cx = box!.x + box!.width / 2;
      const cy = box!.y + box!.height * 0.48;

      const prepView = async (
        prep: (typeof desktopShots)[number]["prep"],
      ) => {
        await page.getByRole("button", { name: "front", exact: true }).click();
        await page.waitForTimeout(500);
        if (prep === "front") return;
        if (prep === "right90") {
          await page.getByRole("button", { name: "right", exact: true }).click();
          await page.waitForTimeout(600);
          return;
        }
        if (prep === "left90") {
          await page.getByRole("button", { name: "left", exact: true }).click();
          await page.waitForTimeout(600);
          return;
        }
        const map: Record<string, number> = {
          right30: -80,
          right60: -140,
          left30: 80,
          left60: 140,
        };
        const delta = map[prep] ?? 0;
        await dragOrbit(page, cx, cx + delta, cy);
      };

      const shots =
        vp.key === "desktop"
          ? desktopShots
          : vp.key === "tablet"
            ? tabletShots
            : mobileShots;

      for (const shot of shots) {
        await prepView(shot.prep);
        await canvas.screenshot({
          path: path.join(BROWSER, shot.name),
          animations: "disabled",
        });
      }
    }

    for (const name of [
      ...desktopShots.map((s) => s.name),
      ...tabletShots.map((s) => s.name),
      ...mobileShots.map((s) => s.name),
    ]) {
      expect(existsSync(path.join(BROWSER, name))).toBe(true);
    }
  });

  test("fallback keeps selector alive when field assets fail", async ({
    page,
  }) => {
    test.setTimeout(360_000);
    await page.setViewportSize({ width: 1440, height: 900 });
    mkdirSync(HIT, { recursive: true });
    const results: Record<string, string> = {};

    const runFallback = async (
      id: string,
      setup: () => Promise<void>,
      expectStatusNotOk = true,
    ) => {
      await setup();
      await openQuoteSelector(page);
      const sternum = INTERIOR.find((p) => p.id === "sternum")!;
      await expect
        .poll(
          async () => (await raycastWorld(page, sternum.xyz))?.publicTargetId,
          { timeout: 30_000 },
        )
        .toBe("full_chest");
      await clickLandmark(page, sternum.xyz);
      await expect(page.getByText("Pecho completo").first()).toBeVisible({
        timeout: 15_000,
      });
      await page
        .getByRole("button", {
          name: /Pecho completo · Superficie frontal completa del pecho/i,
        })
        .click();
      await page.waitForTimeout(400);
      if (expectStatusNotOk) {
        await expect
          .poll(
            async () => {
              const t = await readTiming(page);
              return t?.status ?? "pending";
            },
            { timeout: 30_000 },
          )
          .not.toBe("ok");
      }
      const confirm = page.getByRole("button", {
        name: /Confirmar selección/i,
      });
      await expect(confirm).toBeVisible({ timeout: 10_000 });
      await confirm.click();
      await expect(page.getByText("Selección confirmada").first()).toBeVisible({
        timeout: 10_000,
      });
      results[id] = "PASS";
      await page.unrouteAll({ behavior: "ignoreErrors" });
    };

    await runFallback("manifest-404", async () => {
      await page.route(/neutro_body_v1_region_fields\.json/, async (route) => {
        await route.fulfill({ status: 404, body: "missing" });
      });
    });

    await runFallback("sidecar-404", async () => {
      await page.route(/full_chest_sdf\.bin/, async (route) => {
        await route.fulfill({ status: 404, body: "missing" });
      });
    });

    await runFallback("hash-vertex-mismatch", async () => {
      await page.route(/neutro_body_v1_region_fields\.json/, async (route) => {
        const body = {
          model: "neutro_body_v1",
          version: "2.7-bad",
          geometryHash: "deadbeefdead",
          indexHash: "deadbeefdead1",
          vertexCount: 1,
          indexCount: 1,
          fields: [
            {
              regionId: "full_chest",
              surfaceRegionId: "full_chest_surface",
              maskIndex: 9,
              geometryHash: "deadbeefdead",
              indexHash: "deadbeefdead1",
              vertexCount: 1,
              fieldUrl:
                "/models/interaction/fields/neutro_body_v1_full_chest_sdf.bin",
              fieldHash: "badhashbadhash00",
              encoding: "snorm16",
              distanceRangeMeters: 0.02,
              candidateId: "C07",
            },
          ],
        };
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify(body),
        });
      });
    });

    writeFileSync(
      path.join(HIT, "fallback-results.json"),
      JSON.stringify(results, null, 2),
    );
  });
});
