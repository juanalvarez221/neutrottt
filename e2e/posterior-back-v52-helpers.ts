/**
 * Shared helpers for Posterior Back V5.2 Playwright (official S02 assets).
 */
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { expect, type Page } from "@playwright/test";

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
  microCachedMs?: number;
  geometryCacheHit?: boolean;
  stages?: Record<string, number | boolean>;
};

export type RayHit = {
  atomicId?: string | null;
  publicTargetId?: string | null;
  point?: [number, number, number] | null;
  clientX?: number;
  clientY?: number;
  maskIndex?: number;
};

const ROOT = process.cwd();
export const ART = path.join(ROOT, "artifacts/posterior-back-v52");

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

export async function prepBackView(page: Page) {
  const back = page.getByRole("button", { name: "back", exact: true });
  if (await back.count()) {
    await back.click({ timeout: 10_000, force: true });
    await page.waitForTimeout(500);
  }
}

export async function openLabBack(page: Page) {
  await seedQuoteOnboarding(page);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/lab/body-3d?mode=audit", {
    waitUntil: "domcontentloaded",
    timeout: 60_000,
  });
  await page.locator("canvas").first().waitFor({ state: "visible", timeout: 60_000 });
  await waitBridge(page);
  await page.waitForTimeout(800);
  await prepBackView(page);
}

export async function openQuoteSelector(page: Page) {
  await seedQuoteOnboarding(page);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/cotizacion/ubicacion", {
    waitUntil: "domcontentloaded",
    timeout: 60_000,
  });
  await page.locator("canvas").first().waitFor({ state: "visible", timeout: 60_000 });
  await waitBridge(page);
  await page.waitForTimeout(800);
}

export async function selectPublicTarget(
  page: Page,
  regionId: string,
  options?: { requireOk?: boolean },
) {
  const requireOk = options?.requireOk !== false;
  await page.waitForFunction(
    () =>
      typeof (window as unknown as { __neutroSelectPublicTarget?: unknown })
        .__neutroSelectPublicTarget === "function",
    null,
    { timeout: 30_000 },
  );
  await page.evaluate((id) => {
    (
      window as unknown as {
        __neutroSelectPublicTarget: (regionId: string) => void;
      }
    ).__neutroSelectPublicTarget(id);
  }, regionId);
  if (
    regionId === "upper_back" ||
    regionId === "lower_back" ||
    regionId === "full_back"
  ) {
    await prepBackView(page);
  }
  if (!requireOk) {
    await page.waitForTimeout(800);
    return;
  }
  const fieldAliases: Record<string, string[]> = {
    upper_back: ["upper_back", "upper_back_surface"],
    lower_back: ["lower_back", "lower_back_surface"],
    full_back: ["full_back"],
    right_ribs: ["right_ribs", "right_ribs_region"],
    left_ribs: ["left_ribs", "left_ribs_region"],
  };
  const accepted = fieldAliases[regionId] ?? [regionId];
  await expect
    .poll(
      async () => {
        const timing = await readTiming(page);
        if (timing?.status !== "ok") return null;
        return accepted.includes(timing.regionId ?? "")
          ? timing.regionId
          : null;
      },
      { timeout: 60_000 },
    )
    .not.toBeNull();
  await page.waitForTimeout(400);
}

export async function raycastWorld(
  page: Page,
  xyz: [number, number, number],
): Promise<RayHit | null> {
  return page.evaluate(async (pt) => {
    const bridge = (
      window as unknown as {
        __neutroHitBridge?: {
          raycastWorldAsync: (
            x: number,
            y: number,
            z: number,
          ) => Promise<RayHit | null>;
        };
      }
    ).__neutroHitBridge;
    if (!bridge?.raycastWorldAsync) return null;
    return bridge.raycastWorldAsync(pt[0], pt[1], pt[2]);
  }, xyz);
}

/** Screen-raycast with small landmark offsets (matches ribs V4.4 pattern). */
export async function raycastWorldExpect(
  page: Page,
  xyz: [number, number, number],
  expectId: string,
): Promise<RayHit | null> {
  const candidates: [number, number, number][] = [
    xyz,
    [xyz[0], xyz[1] + 0.012, xyz[2]],
    [xyz[0], xyz[1] + 0.02, xyz[2] - 0.008],
    [xyz[0] + 0.008, xyz[1] + 0.01, xyz[2] - 0.006],
    [xyz[0] - 0.008, xyz[1] + 0.01, xyz[2] - 0.006],
  ];
  let hit: RayHit | null = null;
  for (const p of candidates) {
    hit = await raycastWorld(page, p);
    if (hit?.publicTargetId === expectId) break;
  }
  return hit;
}

export function writeJson(rel: string, data: unknown) {
  const full = path.join(ART, rel);
  mkdirSync(path.dirname(full), { recursive: true });
  writeFileSync(full, `${JSON.stringify(data, null, 2)}\n`);
}
