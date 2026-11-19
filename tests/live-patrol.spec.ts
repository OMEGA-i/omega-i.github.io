import { expect, test } from "@playwright/test";

test("A3 route editor works with keyboard and retains recorded playback without WebGPU", async ({
  page,
}) => {
  const requests: string[] = [];
  page.on("request", (r) => requests.push(r.url()));
  await page.addInitScript(() =>
    Object.defineProperty(navigator, "gpu", { value: undefined }),
  );
  await page.goto("/en/projects/playground/?body=a3&mode=live#scene");
  const editor = page.locator("[data-editor]");
  await expect(editor).toBeVisible();
  await editor.getByRole("button", { name: "Inventory" }).press("Enter");
  await editor.getByRole("button", { name: "Inbound" }).press("Space");
  await expect(editor.locator("[data-order]")).toHaveText(
    "Dock → Inventory → Inbound → Dock",
  );
  await editor.getByRole("button", { name: "Undo last stop" }).click();
  await expect(editor.locator("[data-order]")).toHaveText(
    "Dock → Inventory → Dock",
  );
  await expect(editor.locator("[data-start-live]")).toBeDisabled();
  await page.locator("[data-recorded]").click();
  await expect(page.locator("[data-episode] video")).toBeVisible();
  await page
    .locator("[data-model-choice]")
    .getByRole("radio", { name: "G1" })
    .check();
  await expect(page.locator("[data-live-course]")).toBeVisible();
  expect(
    requests.some((url) =>
      /actor\.onnx|warehouse\.xml|gait\.f32|mujoco.*\.wasm/.test(url),
    ),
  ).toBe(false);
});
