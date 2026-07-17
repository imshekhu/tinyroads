import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

test("loads the original world without runtime errors", async ({ page }) => {
  const errors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  page.on("pageerror", (error) => errors.push(error.message));

  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Tiny Roads" })).toBeVisible();
  await expect(page.getByText("A tiny driving adventure")).toBeVisible();
  await expect(page.locator("#loading-screen")).toHaveClass(/is-done/, {
    timeout: 20_000,
  });
  await expect(page.locator("#game-canvas")).toBeVisible();

  const canvasHasPixels = await page.locator("#game-canvas").evaluate((canvas) => {
    const gl = (canvas as HTMLCanvasElement).getContext("webgl2");
    return Boolean(gl && gl.drawingBufferWidth > 0 && gl.drawingBufferHeight > 0);
  });
  expect(canvasHasPixels).toBe(true);
  expect(errors).toEqual([]);
});

test("starts a drive and responds to keyboard controls", async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name.includes("mobile"), "Desktop keyboard test");
  await page.goto("/");
  await page.getByRole("button", { name: "Sky blue" }).click();
  await page.getByRole("button", { name: "Start your engine" }).click();

  await expect(page.locator("#game-ui")).toHaveClass(/is-visible/);
  await expect(page.locator("#start-screen")).toHaveClass(/is-hidden/);
  await expect(page.getByText("Welcome to the loop")).toBeVisible();

  await page.keyboard.down("w");
  await page.waitForTimeout(1_500);
  await page.keyboard.up("w");
  const speed = Number(await page.locator("#speed-value").textContent());
  expect(speed).toBeGreaterThan(5);

  await page.keyboard.press("r");
  await expect(page.getByText("Back on route")).toBeVisible();
});

test("opens the driver handbook and restores focusable UI", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Start your engine" }).click();
  await page.getByRole("button", { name: "Show controls" }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  await expect(page.getByText("Take the long way.")).toBeVisible();
  await page.getByRole("button", { name: "Close" }).click();
  await expect(dialog).not.toBeVisible();
});

test("shows usable touch driving controls on mobile", async ({
  page,
}, testInfo) => {
  test.skip(!testInfo.project.name.includes("mobile"), "Mobile-only test");
  await page.goto("/");
  await page.getByRole("button", { name: "Start your engine" }).click();

  const accelerate = page.getByRole("button", { name: "Accelerate" });
  const steer = page.getByRole("button", { name: "Steer left" });
  await expect(accelerate).toBeVisible();
  await expect(steer).toBeVisible();

  await accelerate.dispatchEvent("pointerdown", {
    pointerId: 1,
    pointerType: "touch",
  });
  await page.waitForTimeout(1_200);
  await accelerate.dispatchEvent("pointerup", {
    pointerId: 1,
    pointerType: "touch",
  });
  const speed = Number(await page.locator("#speed-value").textContent());
  expect(speed).toBeGreaterThan(0);
});

test("fits the viewport without horizontal overflow", async ({ page }) => {
  await page.goto("/");
  const overflow = await page.evaluate(
    () =>
      document.documentElement.scrollWidth >
      document.documentElement.clientWidth,
  );
  expect(overflow).toBe(false);
});

test("has no serious automated accessibility violations", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator("#loading-screen")).toHaveClass(/is-done/, {
    timeout: 20_000,
  });
  const results = await new AxeBuilder({ page }).analyze();
  const severe = results.violations.filter((violation) =>
    ["serious", "critical"].includes(violation.impact ?? ""),
  );
  expect(severe).toEqual([]);
});
