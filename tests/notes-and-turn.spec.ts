import { expect, test } from "@playwright/test";
import g1 from "../public/inspection/record.json" with {type:"json"};
import a3 from "../public/inspection/a3-record.json" with {type:"json"};

test("both recorded policies finish the warehouse mission without rack contact", () => {
  for (const record of [g1,a3]) {
    expect(record.end).toBe("returned");
    expect(record.events.map(event=>event[0])).toEqual(["inbound","bend","clear","inventory","return_lane","dispatch","dock"]);
    expect(record.clearance.rackContactSamples).toBe(0);
    expect(record.clearance.samples).toBe(Math.round(record.duration * 50) + 1);
  }
});

test("both research features have both languages and the legacy turn link reaches the case study", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  for (const lang of ["en", "zh"]) {
    await page.goto(`/${lang}/blog/`);
    const links = await page.locator(".journal>a").evaluateAll((nodes) =>
      nodes.map((node) => node.getAttribute("href")!),
    );
    expect(links).toHaveLength(2);
    for (const link of links) {
      const response = await page.goto(link);
      expect(response?.status()).toBe(200);
      expect(await page.locator("html").getAttribute("lang")).toBe(lang === "en" ? "en" : "zh-CN");
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(375);
    }
    await page.goto(`/${lang}/blog/one-rollout-three-views/`);
    await expect(page).toHaveURL(new RegExp("/simulation-data/#turn$"));
    await expect(page.locator("#inspection .moments a")).toHaveCount(3);
    await expect(page.locator(".articlebody details")).toHaveCount(0);
  }
});

test("physical inspection keeps camera, event and telemetry on one clock",async({page})=>{
  await page.goto("/en/projects/playground/");
  const episode=page.locator("[data-episode]");
  await episode.getByRole("button",{name:/Inspection complete/}).click();
  await expect(episode.locator(".replay-controls output")).toContainText("30.30");
  await episode.locator("select[data-angle]").selectOption("2");
  await expect(episode.locator(".screen")).toHaveAttribute("data-angle","2");
  await expect(episode.locator(".replay-controls output")).toContainText("30.30");
  await expect(episode.locator("[data-measure]")).toContainText("Ground speed");
});

test("SeMoCo links the merged release and preserves the pose when switching robot",async({page})=>{
  await page.goto("/en/projects/semoco/");
  await expect(page.getByRole("link",{name:"SeMoCo · GitHub ↗"})).toHaveAttribute("href","https://github.com/OMEGA-i/SeMoCo");
  const player=page.locator("[data-semoco]"),video=player.locator("video");
  await expect.poll(()=>video.evaluate(v=>v.readyState)).toBeGreaterThan(0);
  await video.evaluate(v=>{v.currentTime=.96});
  await expect.poll(()=>video.evaluate(v=>(v as HTMLVideoElement).currentTime)).toBeCloseTo(.96);
  await player.locator("[data-robot]").getByRole("radio",{name:"A3"}).check();
  await expect(video).toHaveAttribute("src","/phrases/a3/rhythm.mp4");
  await expect.poll(()=>video.evaluate(v=>(v as HTMLVideoElement).currentTime)).toBeCloseTo(.96);
});
