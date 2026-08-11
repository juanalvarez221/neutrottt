import { expect, test, type Page } from "@playwright/test";
import path from "node:path";

const OUT = path.join("artifacts", "body-public-anatomy-smoke");

async function openPublicAnatomyQa(page: Page) {
  await page.addInitScript(() => {
    window.localStorage.setItem("neutrottt.language", "es");
  });
  await page.goto("/lab/body-3d?mode=audit", { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(800);
  await page.evaluate(() => {
    const tab = [...document.querySelectorAll('[role="tab"]')].find((el) =>
      (el.textContent ?? "").includes("Public Region Audit"),
    ) as HTMLButtonElement | undefined;
    tab?.click();
  });
  await expect(
    page.locator("text=Anatomical Region Review").first(),
  ).toBeVisible({ timeout: 60_000 });
}

async function selectTarget(page: Page, targetId: string) {
  const select = page
    .locator("select")
    .filter({ has: page.locator(`option[value="${targetId}"]`) })
    .first();
  await select.selectOption(targetId);
  await expect(select).toHaveValue(targetId);
  await page.waitForTimeout(900);
}

async function shot(page: Page, name: string) {
  const canvas = page.locator("canvas").first();
  await expect(canvas).toBeVisible({ timeout: 30_000 });
  await canvas.screenshot({
    path: path.join(OUT, name),
    animations: "disabled",
  });
}

test.describe("Costal anatomy smoke", () => {
  test("pecho / costillas / costado / abdomen / espalda / brazo", async ({
    page,
  }) => {
    test.setTimeout(120_000);
    await page.setViewportSize({ width: 1440, height: 900 });
    await openPublicAnatomyQa(page);

    const targets = [
      ["full_chest", "01-pecho.png"],
      ["right_ribs", "02-costillas.png"],
      ["right_flank", "03-costado.png"],
      ["full_abdomen", "04-abdomen.png"],
      ["upper_back", "05-espalda.png"],
      ["left_biceps_region", "06-brazo-anterior.png"],
    ] as const;

    for (const [id, file] of targets) {
      await selectTarget(page, id);
      await shot(page, file);
    }

    await expect(
      page.locator('option[value="right_flank"]').first(),
    ).toContainText(/Costado/i);
    await expect(
      page.locator('option[value="right_ribs"]').first(),
    ).toContainText(/Costillas/i);
  });
});
