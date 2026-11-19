// Requires the A3 bundle and Chrome with a WebGPU adapter.
import assert from "node:assert/strict";
import { chromium } from "@playwright/test";
const origin = process.argv[2] || "http://127.0.0.1:4321";
const browser = await chromium.launch({ channel: "chrome" });
try {
  const page = await browser.newPage({
    viewport: { width: 1180, height: 820 },
  });
  await page.goto(
    new URL("/en/projects/playground/?body=a3&mode=live#scene", origin).href,
  );
  const panel = page.locator("[data-editor]"),
    floor = panel.locator("[data-floor]");
  const place = async (x, y) => {
    const pos = await floor.evaluate(
      (svg, [x, y]) => {
        const p = new DOMPoint(54 + 42 * x, 194 - 42 * y).matrixTransform(
          svg.getScreenCTM(),
        );
        return [p.x, p.y];
      },
      [x, y],
    );
    await page.mouse.click(...pos);
  };
  await floor.scrollIntoViewIfNeeded();
  await place(4, 2.9);
  assert.match(
    await panel.locator("[data-status-live]").innerText(),
    /clear spot/,
  );
  await place(5.9, 0.7);
  await panel.getByRole("button", { name: "Dispatch" }).click();
  await panel.locator("[data-start-live]").click();
  await page.waitForFunction(
    () =>
      /back at dock|Tracking ended|Could not run|timed out/.test(
        document.querySelector("[data-status-live]").textContent,
      ),
    null,
    { timeout: 160000 },
  );
  assert.match(
    await panel.locator("[data-status-live]").innerText(),
    /back at dock/,
  );
  assert.ok(
    (await panel.locator("[data-measured]").getAttribute("points")).split(" ")
      .length > 100,
  );
  console.log(
    await panel.locator("[data-order]").innerText(),
    await panel.locator("[data-sim-time]").innerText(),
  );
  await panel.locator("[data-start-live]").click();
  await page.waitForFunction(
    () =>
      parseFloat(document.querySelector("[data-sim-time]").textContent) > 0.2,
  );
  await page
    .locator("[data-model-choice]")
    .getByRole("radio", { name: "G1" })
    .check();
  await page.waitForFunction(
    () => document.querySelector("[data-stop-live]").hidden,
  );
  assert.equal(await page.locator("[data-live-course]").isVisible(), true);
  assert.match(await panel.locator("[data-order]").innerText(),/Point 1 → Dispatch/);
  assert.equal(await panel.locator("[data-sim-time]").innerText(),"0.00 s");
  await panel.locator("[data-start-live]").click();
  await page.waitForFunction(() => parseFloat(document.querySelector("[data-sim-time]").textContent) > 0.2);
  await panel.locator("[data-live-angle]").selectOption("eye");
  await page.waitForFunction(() => /back at dock|ended|timed out|Could not run/.test(document.querySelector("[data-status-live]").textContent), null, {timeout:160000});
  assert.match(await panel.locator("[data-status-live]").innerText(),/back at dock/);
} finally {
  await browser.close();
}
