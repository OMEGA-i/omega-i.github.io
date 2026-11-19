import { expect, test } from "@playwright/test";

test("the architecture shows the full control loop in both languages", async ({
  page,
}) => {
  for (const [lang, width] of [
    ["zh", 1280],
    ["en", 375],
  ] as const) {
    await page.setViewportSize({ width, height: 850 });
    await page.goto("/" + lang + "/");
    await page.locator(".see-system").click();
    const figure = page.locator("[data-system]");
    await expect(figure.locator(".flow h3:visible")).toHaveCount(4);
    await expect(figure.locator("button")).toHaveCount(0);
    await expect(figure.locator(".planned")).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
  }
});

test("architecture captions remain legible on the diagram in both themes", async ({page}) => {
  for (const colorScheme of ["light", "dark"] as const) {
    await page.emulateMedia({colorScheme});
    await page.goto("/zh/#architecture");
    const contrasts = await page.locator(".plate").evaluate(plate => {
      function luminance(rgb:string) {
        const [r,g,b] = rgb.match(/[\d.]+/g)!.slice(0,3).map(n => {
          const v = Number(n)/255;
          return v <= .04045 ? v/12.92 : ((v+.055)/1.055)**2.4;
        });
        return .2126*r+.7152*g+.0722*b;
      }
      const bg=luminance(getComputedStyle(plate).backgroundColor);
      return Array.from(plate.querySelectorAll("h3,p,small,.loop"), node => {
        const fg=luminance(getComputedStyle(node).color);
        return (Math.max(fg,bg)+.05)/(Math.min(fg,bg)+.05);
      });
    });
    expect(Math.min(...contrasts)).toBeGreaterThanOrEqual(4.5);
  }
});
