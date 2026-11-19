import a3 from "../public/inspection/a3-record.json" with { type: "json" };
import { expect, test } from "@playwright/test";

test("home, direct project links and persistent bilingual navigation", async ({
  page,
}) => {
  for (const lang of ["en", "zh"]) {
    await page.goto("/" + lang + "/");
    await expect(page.locator(".project h3")).toHaveText([
      "Joystick",
      "PlayGround",
      "SeMoCo",
    ]);
    expect(
      await page
        .locator(".imagebox img")
        .evaluateAll((images) =>
          images.every((image) => (image as HTMLImageElement).naturalWidth > 0),
        ),
    ).toBeTruthy();
    for (const slug of ["joystick", "playground", "semoco"]) {
      const response = await page.goto("/" + lang + "/projects/" + slug + "/");
      expect(response?.status()).toBe(200);
      await expect(page.locator("h1")).toBeVisible();
    }
  }
  await page.locator(".locale").click();
  await expect(page).toHaveURL(/\/en\/projects\/semoco\/$/);
  await page.goto("/");
  await expect(page).toHaveURL(/\/en\/$/);
  await page.locator(".theme").click();
  const pref = await page.locator("html").getAttribute("data-theme");
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-theme", pref!);
});

test("mobile offline from the lab and without WebGPU", async ({
  page,
  baseURL,
}) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.addInitScript(() =>
    Object.defineProperty(navigator, "gpu", { value: undefined }),
  );
  await page.route("**/*", (route) =>
    route.request().url().startsWith(baseURL!)
      ? route.continue()
      : route.abort(),
  );
  for (const path of [
    "/zh/",
    "/zh/projects/joystick/",
    "/zh/projects/playground/",
    "/zh/projects/semoco/",
    "/zh/blog/simulation-data/",
  ]) {
    await page.goto(path);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBeTruthy();
    await expect(page.locator("h1")).toBeVisible();
  }
  await expect(page.locator(".articlebody h2")).toHaveText([
    "机器人需要什么样的经验？", "Joystick 让运动意图变成全身动作",
    "PlayGround 让动作在场景中产生结果", "一个例子：G1 如何绕过仓内货架",
  ]);
});

test("SeMoCo offers two generated dance prompts", async ({page}) => {
  await page.goto("/en/projects/semoco/");
  await page.getByRole("button", {name:"Side steps and a turn"}).click();
  await expect(page.locator(".semstage video")).toHaveAttribute("src","/phrases/g1/dance.mp4");
  await expect(page.locator("[data-prompt]")).toContainText("spins around");
});

test("recorded Joystick commands preserve their identity when inputs change", async ({
  page,
}) => {
  await page.goto("/en/projects/joystick/");
  const preset = page.locator("[data-preset]");
  await expect(page.locator("[data-status]")).toContainText("0.8 / 0.25");
  await preset.selectOption("backward");
  await expect(page.locator("[data-status]")).toContainText("-0.3 / 0");
  await expect(page.locator("[data-joystick] [data-mode]")).toHaveText(
    "Walking reference preview",
  );
  await page.locator("[data-body]").getByRole("radio",{name:"A3"}).check();
  await expect(page.locator("[data-view][data-avatar=a3] canvas")).toBeVisible();
  await expect(page.locator("[data-follow]")).toBeVisible();
  await page.locator("[data-frame]").fill("50");
  await expect(page.locator("[data-joystick] [data-time]")).toHaveText(
    "2.00 s",
  );
});

test("Playground camera changes share one clock and finish at the recorded receipt", async ({
  page,
}) => {
  await page.goto("/en/projects/playground/");
  const episode=page.locator("[data-episode]");
  const timeline=episode.locator("input[type=range]");
  await timeline.fill("12");
  await expect(episode.locator(".floorplan")).toBeVisible();
  await episode.locator("[data-model-choice]").getByRole("radio",{name:"A3"}).check();
  await expect(episode.locator("[data-policy]")).toContainText("its own a15k tracker")
  await expect(timeline).toHaveAttribute("max",String(a3.duration));
  await expect(episode.locator("[data-contact]")).toContainText(String(a3.clearance.samples));
  await expect.poll(()=>episode.locator("video").evaluate(v=>v.currentTime)).toBeCloseTo(12);
  await episode.locator("[data-model-choice]").getByRole("radio",{name:"G1"}).check();
  await expect.poll(()=>episode.locator("video").evaluate(v=>v.currentTime)).toBeCloseTo(12);
  await episode.getByRole("button",{name:/Back at dock/}).click();
  await expect(episode.locator("[aria-current=step]")).toHaveAccessibleName(/Back at dock/);
});
